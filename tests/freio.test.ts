/**
 * Testes do rate limiting e da proteção contra tentativas de acesso
 * (migration 04). Contra um Postgres de verdade, igual banco.test.ts.
 *
 * Rodar assim:
 *   supabase start
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
 *
 * Sem TEST_DATABASE_URL os testes são pulados.
 *
 * ATENÇÃO: o banco apontado é RECRIADO do zero (drop schema public).
 * Nunca aponte para produção.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const URL_BANCO = process.env.TEST_DATABASE_URL;
const raiz = path.dirname(fileURLToPath(import.meta.url));
const pastaMigrations = path.join(raiz, "..", "supabase", "migrations");

/**
 * Banco próprio, e não o mesmo do banco.test.ts.
 *
 * O Vitest roda os arquivos de teste em paralelo. Se os dois derem
 * `drop schema public cascade` na mesma base, um apaga o schema no meio
 * da migration do outro — e a falha aparece longe da causa (o btree_gist
 * desaparece e o erro sai como "gbt_bytea_picksplit does not exist").
 * Criando a base aqui, o arquivo fica correto independente de paralelismo.
 */
const NOME_BANCO = "freio_test";

function urlComBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  return u.toString();
}

/**
 * Fora do Supabase esses papéis e o schema auth não existem.
 * O `exception when duplicate_object` cobre a corrida com o outro
 * arquivo de teste: papel no Postgres é do cluster, não da base.
 */
const PRELUDIO = `
do $$
begin
  begin create role anon nologin;          exception when duplicate_object then null; end;
  begin create role authenticated nologin; exception when duplicate_object then null; end;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $x$ select null::uuid $x$;

grant usage on schema public to anon, authenticated;
`;

type Resposta = {
  allowed: boolean;
  locked: boolean;
  retry_after?: number;
  remaining?: number;
};

const descreve = URL_BANCO ? describe : describe.skip;

descreve("freio de tentativas", () => {
  let db: Client;
  let chaves = 0;

  /** Chave nova por teste: bucket é por (ação + chave), então não vaza entre casos. */
  function chaveNova(): string {
    chaves += 1;
    return `10.0.0.${chaves}`;
  }

  async function checar(acao: string, chave: string): Promise<Resposta> {
    const { rows } = await db.query<{ v: Resposta }>(
      "select public.rate_limit_check($1, $2) as v",
      [acao, chave],
    );
    return rows[0].v;
  }

  /** Bate na função até ela negar, devolvendo quantas passaram. */
  async function gastarAte(acao: string, chave: string, teto = 50) {
    let liberadas = 0;
    for (let i = 0; i < teto; i++) {
      const r = await checar(acao, chave);
      if (!r.allowed) return { liberadas, ultima: r };
      liberadas += 1;
    }
    throw new Error(`${acao} não barrou em ${teto} tentativas`);
  }

  /** Envelhece os registros da janela, para testar expiração sem esperar. */
  async function envelhecer(acao: string, chave: string, segundos: number) {
    await db.query(
      `update public.rate_limit_hits
          set created_at = created_at - make_interval(secs => $2)
        where bucket = $1`,
      [`${acao}:${chave}`, segundos],
    );
  }

  beforeAll(async () => {
    // Base descartável e exclusiva deste arquivo.
    const admin = new Client({ connectionString: URL_BANCO });
    await admin.connect();
    await admin.query(`drop database if exists ${NOME_BANCO} with (force)`);
    await admin.query(`create database ${NOME_BANCO}`);
    await admin.end();

    db = new Client({ connectionString: urlComBanco(URL_BANCO!, NOME_BANCO) });
    await db.connect();
    await db.query(PRELUDIO);

    const arquivos = (await readdir(pastaMigrations))
      .filter((n) => n.endsWith(".sql"))
      .sort();

    for (const arquivo of arquivos) {
      const sql = await readFile(path.join(pastaMigrations, arquivo), "utf8");
      await db.query(sql);
    }
  });

  afterAll(async () => {
    await db?.end();
    // Não dá para derrubar a base estando conectado nela.
    const admin = new Client({ connectionString: URL_BANCO });
    await admin.connect();
    await admin.query(`drop database if exists ${NOME_BANCO} with (force)`);
    await admin.end();
  });

  beforeEach(async () => {
    await db.query("truncate public.rate_limit_hits, public.access_lockouts");
  });

  // -------------------------------------------------------------------
  // Contagem e janela
  // -------------------------------------------------------------------
  it("libera até o limite da ação e barra a seguinte", async () => {
    const ip = chaveNova();
    const { liberadas, ultima } = await gastarAte("reserva_ip", ip);
    expect(liberadas).toBe(8); // reserva_ip = 8 por 10 min
    expect(ultima.allowed).toBe(false);
  });

  it("login_ip é mais curto que reserva_ip", async () => {
    const { liberadas } = await gastarAte("login_ip", chaveNova());
    expect(liberadas).toBe(5);
  });

  it("devolve quantas ainda restam", async () => {
    const ip = chaveNova();
    const primeira = await checar("reserva_ip", ip);
    expect(primeira.remaining).toBe(7);
    const segunda = await checar("reserva_ip", ip);
    expect(segunda.remaining).toBe(6);
  });

  it("tentativa fora da janela não conta mais", async () => {
    const ip = chaveNova();
    await gastarAte("reserva_ip", ip);
    // Empurra tudo para trás da janela de 10 min.
    await envelhecer("reserva_ip", ip, 601);
    const depois = await checar("reserva_ip", ip);
    expect(depois.allowed).toBe(true);
  });

  it("chaves diferentes não se afetam", async () => {
    const a = chaveNova();
    const b = chaveNova();
    await gastarAte("login_ip", a);
    const outro = await checar("login_ip", b);
    expect(outro.allowed).toBe(true);
  });

  it("ações diferentes não compartilham contador", async () => {
    const ip = chaveNova();
    await gastarAte("login_ip", ip); // estoura login_ip
    const reserva = await checar("reserva_ip", ip);
    expect(reserva.allowed).toBe(true);
  });

  // -------------------------------------------------------------------
  // Castigo progressivo
  // -------------------------------------------------------------------
  it("login_ip aplica castigo, e o castigo cresce a cada reincidência", async () => {
    const ip = chaveNova();

    const primeiro = await gastarAte("login_ip", ip);
    expect(primeiro.ultima.locked).toBe(true);
    const espera1 = primeiro.ultima.retry_after ?? 0;
    expect(espera1).toBe(600); // 10 min

    // Vence o castigo e reincide.
    await db.query(
      "update public.access_lockouts set until = now() - interval '1 second' where bucket = $1",
      [`login_ip:${ip}`],
    );
    const segundo = await gastarAte("login_ip", ip);
    expect(segundo.ultima.retry_after).toBe(1800); // 30 min

    await db.query(
      "update public.access_lockouts set until = now() - interval '1 second' where bucket = $1",
      [`login_ip:${ip}`],
    );
    const terceiro = await gastarAte("login_ip", ip);
    expect(terceiro.ultima.retry_after).toBe(5400); // 1h30

    // E o teto é 2 h, não cresce para sempre.
    await db.query(
      "update public.access_lockouts set until = now() - interval '1 second', strikes = 9 where bucket = $1",
      [`login_ip:${ip}`],
    );
    const quarto = await gastarAte("login_ip", ip);
    expect(quarto.ultima.retry_after).toBe(7200);
  });

  it("durante o castigo nega na hora, sem contar tentativa nova", async () => {
    const ip = chaveNova();
    await gastarAte("login_ip", ip);

    const { rows: antes } = await db.query<{ n: string }>(
      "select count(*) as n from public.rate_limit_hits where bucket = $1",
      [`login_ip:${ip}`],
    );
    const r = await checar("login_ip", ip);
    const { rows: depois } = await db.query<{ n: string }>(
      "select count(*) as n from public.rate_limit_hits where bucket = $1",
      [`login_ip:${ip}`],
    );

    expect(r.locked).toBe(true);
    expect(depois[0].n).toBe(antes[0].n);
  });

  it("ao vencer o castigo o contador está zerado, não re-trava na primeira", async () => {
    const ip = chaveNova();
    await gastarAte("login_ip", ip);
    await db.query(
      "update public.access_lockouts set until = now() - interval '1 second' where bucket = $1",
      [`login_ip:${ip}`],
    );
    const primeira = await checar("login_ip", ip);
    expect(primeira.allowed).toBe(true);
  });

  it("login_email barra por janela mas NÃO aplica castigo", async () => {
    const email = `alvo${chaves++}@bar.com`;
    const { liberadas, ultima } = await gastarAte("login_email", email);
    expect(liberadas).toBe(10);
    expect(ultima.allowed).toBe(false);
    // locked=false é o que impede trancar a conta de um funcionário de fora.
    expect(ultima.locked).toBe(false);

    const { rows } = await db.query<{ n: string }>(
      "select count(*) as n from public.access_lockouts where bucket = $1",
      [`login_email:${email}`],
    );
    expect(rows[0].n).toBe("0");
  });

  // -------------------------------------------------------------------
  // Liberação e validação
  // -------------------------------------------------------------------
  it("reset limpa contador e castigo", async () => {
    const ip = chaveNova();
    await gastarAte("login_ip", ip);
    await db.query("select public.rate_limit_reset('login_ip', $1)", [ip]);

    const depois = await checar("login_ip", ip);
    expect(depois.allowed).toBe(true);

    const { rows } = await db.query<{ n: string }>(
      "select count(*) as n from public.access_lockouts where bucket = $1",
      [`login_ip:${ip}`],
    );
    expect(rows[0].n).toBe("0");
  });

  it("ação inventada é recusada, não tratada como sem limite", async () => {
    await expect(
      db.query("select public.rate_limit_check('acao_que_nao_existe', '1.1.1.1')"),
    ).rejects.toThrow(/ACAO_DESCONHECIDA/);
  });

  it("chave vazia cai em bucket único, não em um bucket por requisição", async () => {
    const a = await checar("reserva_ip", "");
    const b = await checar("reserva_ip", "   ");
    expect(a.remaining).toBe(7);
    expect(b.remaining).toBe(6); // mesma cesta: 'desconhecido'
  });

  it("chave gigante é truncada, para o bucket não crescer sem teto", async () => {
    const gigante = "x".repeat(500);
    await checar("cancel_ip", gigante);
    const { rows } = await db.query<{ b: string }>(
      "select bucket as b from public.rate_limit_hits order by id desc limit 1",
    );
    expect(rows[0].b.length).toBeLessThanOrEqual("cancel_ip:".length + 100);
  });

  // -------------------------------------------------------------------
  // Permissões — a parte que sustenta o desenho
  // -------------------------------------------------------------------
  it("anon PODE checar (o fluxo público precisa)", async () => {
    await db.query("set local role anon");
    await expect(
      db.query("select public.rate_limit_check('reserva_ip', '9.9.9.9')"),
    ).resolves.toBeDefined();
    await db.query("reset role");
  });

  it("anon NÃO pode zerar o próprio castigo", async () => {
    await db.query("begin");
    await db.query("set local role anon");
    await expect(
      db.query("select public.rate_limit_reset('login_ip', '9.9.9.9')"),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await db.query("rollback");
  });

  it("anon não lê as tabelas do freio direto", async () => {
    await db.query("begin");
    await db.query("set local role anon");
    await expect(
      db.query("select * from public.access_lockouts"),
    ).rejects.toThrow(/permission denied|permissão negada/i);
    await db.query("rollback");
  });

  // -------------------------------------------------------------------
  // Faxina
  // -------------------------------------------------------------------
  it("purge apaga registro velho e mantém o recente", async () => {
    const ip = chaveNova();
    await checar("reserva_ip", ip);
    await envelhecer("reserva_ip", ip, 60 * 60 * 25); // 25 h
    await checar("reserva_ip", ip); // este é de agora

    await db.query("select public.purge_rate_limit()");

    const { rows } = await db.query<{ n: string }>(
      "select count(*) as n from public.rate_limit_hits where bucket = $1",
      [`reserva_ip:${ip}`],
    );
    expect(rows[0].n).toBe("1");
  });
});
