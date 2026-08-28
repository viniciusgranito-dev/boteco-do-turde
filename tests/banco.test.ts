/**
 * Testes de integração contra um Postgres de verdade.
 *
 * Rodar assim:
 *   supabase start
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
 *
 * Sem TEST_DATABASE_URL os testes são pulados — o `npm test` continua
 * verde com os testes de unidade, que não precisam de banco.
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
 * Fora do Supabase esses papéis e o schema auth não existem.
 * Criamos versões mínimas para as migrations rodarem em qualquer Postgres.
 */
const PRELUDIO = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $x$ select null::uuid $x$;

grant usage on schema public to anon, authenticated;
`;

/**
 * Mesas de tamanhos diferentes de propósito: é assim que dá para provar
 * que a atribuição automática escolhe a MENOR mesa que serve o grupo.
 */
const SEMENTE = `
insert into public.opening_hours (weekday, opens_at, closes_at, active)
select g, '17:30', '23:30', true from generate_series(0, 6) g;

insert into public.tables (number, capacity, sort_order) values
  (1,  2, 10),
  (2,  4, 20),
  (3,  4, 30),
  (4, 10, 40);

insert into public.settings (key, value) values
  ('pending_hold_hours', '12'),
  ('reservation_duration_minutes', '120'),
  ('slot_minutes', '30'),
  ('last_slot_offset_minutes', '60'),
  ('min_lead_minutes', '60'),
  ('booking_window_days', '30'),
  ('max_party_size', '20'),
  ('max_active_per_phone', '3');
`;

const descreve = URL_BANCO ? describe : describe.skip;

descreve("regras de reserva no banco", () => {
  let db: Client;
  let telefones = 0;

  /** Amanhã no fuso do bar — sempre dentro da janela e do horário. */
  async function amanhaAs(hora: string): Promise<string> {
    const { rows } = await db.query<{ t: Date }>(
      `select timezone('America/Sao_Paulo',
                (((now() at time zone 'America/Sao_Paulo')::date + 1) + $1::time)::timestamp) as t`,
      [hora],
    );
    return rows[0].t.toISOString();
  }

  /** Cada chamada usa um telefone novo, senão esbarra no limite por telefone. */
  function telefoneNovo(): string {
    telefones += 1;
    return `1499${String(telefones).padStart(7, "0")}`;
  }

  async function reservar(opcoes: {
    inicio: string;
    pessoas: number;
    nome?: string;
    telefone?: string;
  }) {
    const { rows } = await db.query(
      "select public.create_reservation($1, $2, $3, $4, null, null) as r",
      [
        opcoes.inicio,
        opcoes.nome ?? "Ana Paula Ribeiro",
        opcoes.telefone ?? telefoneNovo(),
        opcoes.pessoas,
      ],
    );
    return rows[0].r as { code: string; status: string };
  }

  /** Qual mesa o sistema separou para essa reserva. */
  async function mesaDaReserva(code: string): Promise<number> {
    const { rows } = await db.query<{ number: number }>(
      `select t.number from public.reservations r
         join public.tables t on t.id = r.table_id
        where r.code = $1`,
      [code],
    );
    return rows[0].number;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: URL_BANCO });
    await db.connect();

    await db.query("drop schema if exists public cascade; create schema public;");
    await db.query(PRELUDIO);

    const arquivos = (await readdir(pastaMigrations))
      .filter((n) => n.endsWith(".sql"))
      .sort();

    for (const arquivo of arquivos) {
      const sql = await readFile(path.join(pastaMigrations, arquivo), "utf8");
      await db.query(sql);
    }

    await db.query(SEMENTE);
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("truncate public.reservations, public.audit_log cascade");
    await db.query("delete from public.special_dates");
    await db.query("delete from public.settings where key = 'last_slot_time'");
    await db.query("delete from public.blocked_phones");
    await db.query(
      "update public.settings set value = '3' where key = 'max_active_per_phone'",
    );
  });

  // -------------------------------------------------------------------
  // 1. Nada é confirmado sem o bar aprovar
  // -------------------------------------------------------------------
  describe("toda reserva espera aprovação", () => {
    it("grupo pequeno também nasce pendente", async () => {
      const r = await reservar({ inicio: await amanhaAs("19:00"), pessoas: 2 });
      expect(r.status).toBe("pendente");
    });

    it("grupo grande nasce pendente", async () => {
      const r = await reservar({ inicio: await amanhaAs("19:00"), pessoas: 9 });
      expect(r.status).toBe("pendente");
    });

    it("pendente já nasce com prazo para o bar decidir", async () => {
      const r = await reservar({ inicio: await amanhaAs("19:00"), pessoas: 2 });
      const { rows } = await db.query<{ expires_at: Date | null }>(
        "select expires_at from public.reservations where code = $1",
        [r.code],
      );
      expect(rows[0].expires_at).not.toBeNull();
    });

    it("o prazo nunca passa da hora da própria reserva", async () => {
      const inicio = await amanhaAs("19:00");
      const r = await reservar({ inicio, pessoas: 2 });
      const { rows } = await db.query<{ dentro: boolean }>(
        "select expires_at <= starts_at as dentro from public.reservations where code = $1",
        [r.code],
      );
      expect(rows[0].dentro).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // 2. O cliente não escolhe a mesa — o sistema escolhe
  // -------------------------------------------------------------------
  describe("atribuição automática de mesa", () => {
    it("separa a MENOR mesa que comporta o grupo", async () => {
      const inicio = await amanhaAs("19:00");

      // Mesas: 1→2 lugares, 2→4, 3→4, 4→10.
      const casal = await reservar({ inicio, pessoas: 2 });
      expect(await mesaDaReserva(casal.code)).toBe(1);

      const trio = await reservar({ inicio, pessoas: 3 });
      expect(await mesaDaReserva(trio.code)).toBe(2);

      const turma = await reservar({ inicio, pessoas: 8 });
      expect(await mesaDaReserva(turma.code)).toBe(4);
    });

    it("não gasta a mesa grande com grupo pequeno", async () => {
      const inicio = await amanhaAs("19:00");
      await reservar({ inicio, pessoas: 2 });
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });

      // As de 4 lugares acabaram, mas a de 10 continua livre para a turma.
      const turma = await reservar({ inicio, pessoas: 9 });
      expect(await mesaDaReserva(turma.code)).toBe(4);
    });

    it("duas reservas no mesmo horário caem em mesas diferentes", async () => {
      const inicio = await amanhaAs("19:00");
      const a = await reservar({ inicio, pessoas: 4 });
      const b = await reservar({ inicio, pessoas: 4 });
      expect(await mesaDaReserva(a.code)).not.toBe(await mesaDaReserva(b.code));
    });

    it("reaproveita a mesa quando o horário não se cruza", async () => {
      const primeira = await reservar({
        inicio: await amanhaAs("19:00"),
        pessoas: 2,
      });
      const segunda = await reservar({
        inicio: await amanhaAs("21:00"),
        pessoas: 2,
      });
      expect(await mesaDaReserva(primeira.code)).toBe(1);
      expect(await mesaDaReserva(segunda.code)).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // 3. Lotação — o bar nunca aceita mais gente do que cabe
  // -------------------------------------------------------------------
  describe("quando as mesas acabam", () => {
    it("recusa quando não sobra mesa para o grupo", async () => {
      const inicio = await amanhaAs("19:00");
      // Só as mesas 2 e 3 (4 lugares) e a 4 (10) servem um grupo de 4.
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });

      await expect(reservar({ inicio, pessoas: 4 })).rejects.toThrow(/SEM_MESA/);
    });

    it("recusa grupo maior que a maior mesa", async () => {
      await expect(
        reservar({ inicio: await amanhaAs("19:00"), pessoas: 12 }),
      ).rejects.toThrow(/SEM_MESA/);
    });

    it("a mesa pequena continua livre depois de lotar as grandes", async () => {
      const inicio = await amanhaAs("19:00");
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 8 });

      const casal = await reservar({ inicio, pessoas: 2 });
      expect(await mesaDaReserva(casal.code)).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // 4. A trava do banco — o problema que motivou o projeto
  // -------------------------------------------------------------------
  describe("mesa duplicada", () => {
    it("a constraint barra mesmo por fora das funções", async () => {
      const inicio = await amanhaAs("19:00");
      const r = await reservar({ inicio, pessoas: 2 });

      const { rows } = await db.query<{ table_id: string }>(
        "select table_id from public.reservations where code = $1",
        [r.code],
      );

      await expect(
        db.query(
          `insert into public.reservations
             (table_id, customer_name, customer_phone, party_size, starts_at, ends_at, status)
           values ($1, 'Fura Fila', '14990000000', 2, $2, $2::timestamptz + interval '2 hours', 'confirmada')`,
          [rows[0].table_id, inicio],
        ),
      ).rejects.toThrow(/reservations_no_overlap|exclusion/i);
    });

    it("cancelada libera a mesa na hora", async () => {
      const inicio = await amanhaAs("19:00");
      const primeira = await reservar({ inicio, pessoas: 2 });
      const mesa = await mesaDaReserva(primeira.code);

      await db.query(
        "update public.reservations set status = 'cancelada' where code = $1",
        [primeira.code],
      );

      const segunda = await reservar({ inicio, pessoas: 2 });
      expect(await mesaDaReserva(segunda.code)).toBe(mesa);
    });

    it("recusada libera a mesa na hora", async () => {
      const inicio = await amanhaAs("19:00");
      const primeira = await reservar({ inicio, pessoas: 2 });

      await db.query(
        "update public.reservations set status = 'recusada' where code = $1",
        [primeira.code],
      );

      const segunda = await reservar({ inicio, pessoas: 2 });
      expect(await mesaDaReserva(segunda.code)).toBe(1);
    });

    it("aprovar não pode roubar mesa de ninguém", async () => {
      const inicio = await amanhaAs("19:00");
      const a = await reservar({ inicio, pessoas: 2 });

      // Aprovar é só mudar pendente → confirmada; a mesa segue a mesma.
      await db.query(
        "update public.reservations set status = 'confirmada' where code = $1",
        [a.code],
      );

      const { rows } = await db.query<{ status: string }>(
        "select status from public.reservations where code = $1",
        [a.code],
      );
      expect(rows[0].status).toBe("confirmada");
    });
  });

  // -------------------------------------------------------------------
  // 5. Expiração de pendentes
  // -------------------------------------------------------------------
  describe("expiração de pendente", () => {
    it("vira expirada e devolve a mesa para o próximo", async () => {
      const inicio = await amanhaAs("19:00");
      const pendente = await reservar({ inicio, pessoas: 8 });
      const mesa = await mesaDaReserva(pendente.code);

      // Ninguém respondeu e o prazo passou.
      await db.query(
        "update public.reservations set expires_at = now() - interval '1 minute' where code = $1",
        [pendente.code],
      );

      const { rows: expiradas } = await db.query<{
        expire_stale_reservations: number;
      }>("select public.expire_stale_reservations()");
      expect(expiradas[0].expire_stale_reservations).toBe(1);

      const { rows } = await db.query<{ status: string }>(
        "select status from public.reservations where code = $1",
        [pendente.code],
      );
      expect(rows[0].status).toBe("expirada");

      const nova = await reservar({ inicio, pessoas: 8 });
      expect(await mesaDaReserva(nova.code)).toBe(mesa);
    });

    it("pendente dentro do prazo continua segurando a mesa", async () => {
      const inicio = await amanhaAs("19:00");
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });
      await reservar({ inicio, pessoas: 4 });

      // As três mesas que servem grupo de 4 estão presas em "pendente".
      await expect(reservar({ inicio, pessoas: 4 })).rejects.toThrow(/SEM_MESA/);
    });
  });

  // -------------------------------------------------------------------
  // 6. Validações do formulário público
  // -------------------------------------------------------------------
  describe("validações", () => {
    it("recusa horário fora da grade", async () => {
      await expect(
        reservar({ inicio: await amanhaAs("19:07"), pessoas: 2 }),
      ).rejects.toThrow(/HORARIO_INVALIDO/);
    });

    it("recusa horário depois do último slot", async () => {
      await expect(
        reservar({ inicio: await amanhaAs("23:00"), pessoas: 2 }),
      ).rejects.toThrow(/HORARIO_INVALIDO/);
    });

    it("respeita o teto absoluto de horário (last_slot_time)", async () => {
      await db.query(
        "insert into public.settings (key, value) values ('last_slot_time', '\"20:00\"') on conflict (key) do update set value = excluded.value",
      );

      // 20:00 é o último horário aceito.
      const ok = await reservar({ inicio: await amanhaAs("20:00"), pessoas: 2 });
      expect(ok.status).toBe("pendente");

      // 20:30 fica de fora, mesmo o bar fechando 23:30.
      await expect(
        reservar({
          inicio: await amanhaAs("20:30"),
          pessoas: 2,
          telefone: "14998887766",
        }),
      ).rejects.toThrow(/HORARIO_INVALIDO/);

      // A grade oferecida também para às 20:00.
      const { rows } = await db.query<{ d: { slots: string[] } }>(
        `select public.get_day_availability(
                  ((now() at time zone 'America/Sao_Paulo')::date + 1)) as d`,
      );
      const horas = rows[0].d.slots.map((s) =>
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(s)),
      );
      expect(horas.at(-1)).toBe("20:00");

      await db.query("delete from public.settings where key = 'last_slot_time'");
    });

    it("recusa dia em que o bar não abre", async () => {
      const inicio = await amanhaAs("19:00");
      await db.query(
        `insert into public.special_dates (date, label, closed)
         values (($1::timestamptz at time zone 'America/Sao_Paulo')::date, 'Feriado', true)`,
        [inicio],
      );

      await expect(reservar({ inicio, pessoas: 2 })).rejects.toThrow(
        /BAR_FECHADO/,
      );
    });

    it("data especial pode mudar o horário do dia", async () => {
      const inicio = await amanhaAs("19:00");
      await db.query(
        `insert into public.special_dates (date, label, opens_at, closes_at)
         values (($1::timestamptz at time zone 'America/Sao_Paulo')::date, 'Show do Zé', '20:00', '23:30')`,
        [inicio],
      );

      // 19:00 agora é antes de abrir.
      await expect(reservar({ inicio, pessoas: 2 })).rejects.toThrow(
        /HORARIO_INVALIDO/,
      );

      const r = await reservar({ inicio: await amanhaAs("20:00"), pessoas: 2 });
      expect(r.status).toBe("pendente");
    });

    it("recusa telefone bloqueado", async () => {
      await db.query(
        "insert into public.blocked_phones (phone, reason) values ('14991234567', 'furou 3 vezes')",
      );
      await expect(
        reservar({
          inicio: await amanhaAs("19:00"),
          pessoas: 2,
          telefone: "14991234567",
        }),
      ).rejects.toThrow(/TELEFONE_BLOQUEADO/);
    });

    it("segura o excesso de reservas por telefone", async () => {
      await db.query(
        "update public.settings set value = '1' where key = 'max_active_per_phone'",
      );
      const tel = "14995550001";
      await reservar({ inicio: await amanhaAs("19:00"), pessoas: 2, telefone: tel });

      await expect(
        reservar({ inicio: await amanhaAs("20:00"), pessoas: 2, telefone: tel }),
      ).rejects.toThrow(/LIMITE_RESERVAS/);
    });

    it("recusa nome sem sobrenome e telefone quebrado", async () => {
      const inicio = await amanhaAs("19:00");

      await expect(
        reservar({ inicio, pessoas: 2, nome: "Ana" }),
      ).rejects.toThrow(/NOME_INVALIDO/);

      await expect(
        reservar({ inicio, pessoas: 2, telefone: "123" }),
      ).rejects.toThrow(/TELEFONE_INVALIDO/);
    });

    it("recusa grupo acima do teto configurado", async () => {
      await expect(
        reservar({ inicio: await amanhaAs("19:00"), pessoas: 40 }),
      ).rejects.toThrow(/GRUPO_INVALIDO/);
    });
  });

  // -------------------------------------------------------------------
  // 7. O que o site público enxerga
  // -------------------------------------------------------------------
  describe("get_day_availability", () => {
    it("mostra o intervalo ocupado sem nome, telefone nem número de mesa", async () => {
      const inicio = await amanhaAs("19:00");
      await reservar({ inicio, pessoas: 2, telefone: "14991234567" });

      const { rows } = await db.query<{ r: Record<string, unknown> }>(
        `select public.get_day_availability(
                  ($1::timestamptz at time zone 'America/Sao_Paulo')::date) as r`,
        [inicio],
      );

      const dia = rows[0].r as { tables: { capacity: number }[] };
      const texto = JSON.stringify(dia);

      expect(texto).not.toContain("Ana Paula");
      expect(texto).not.toContain("14991234567");
      expect(texto).not.toContain("number");
      expect(texto).toContain("busy");
      expect(dia.tables[0]).toHaveProperty("capacity");
    });

    it("não oferece horário de dia fechado", async () => {
      const inicio = await amanhaAs("19:00");
      await db.query(
        `insert into public.special_dates (date, label, closed)
         values (($1::timestamptz at time zone 'America/Sao_Paulo')::date, 'Feriado', true)`,
        [inicio],
      );

      const { rows } = await db.query<{ r: { is_open: boolean; slots: [] } }>(
        `select public.get_day_availability(
                  ($1::timestamptz at time zone 'America/Sao_Paulo')::date) as r`,
        [inicio],
      );
      expect(rows[0].r.is_open).toBe(false);
      expect(rows[0].r.slots).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // 8. Link pessoal do cliente
  // -------------------------------------------------------------------
  describe("consulta e cancelamento por token", () => {
    it("o cliente vê e cancela a própria reserva", async () => {
      const r = await reservar({ inicio: await amanhaAs("19:00"), pessoas: 4 });

      const { rows: tokens } = await db.query<{ manage_token: string }>(
        "select manage_token from public.reservations where code = $1",
        [r.code],
      );
      const token = tokens[0].manage_token;

      const { rows: vista } = await db.query<{
        v: { can_cancel: boolean; status: string };
      }>("select public.get_reservation($1) as v", [token]);
      expect(vista[0].v.can_cancel).toBe(true);
      expect(vista[0].v.status).toBe("pendente");

      const { rows: depois } = await db.query<{ v: { status: string } }>(
        "select public.cancel_reservation($1) as v",
        [token],
      );
      expect(depois[0].v.status).toBe("cancelada");
    });

    it("a consulta do cliente não expõe a mesa que o bar separou", async () => {
      const r = await reservar({ inicio: await amanhaAs("19:00"), pessoas: 4 });
      const { rows: tokens } = await db.query<{ manage_token: string }>(
        "select manage_token from public.reservations where code = $1",
        [r.code],
      );

      const { rows } = await db.query<{ v: Record<string, unknown> }>(
        "select public.get_reservation($1) as v",
        [tokens[0].manage_token],
      );
      expect(rows[0].v).not.toHaveProperty("table_number");
      expect(JSON.stringify(rows[0].v)).not.toContain("mesa");
    });

    it("token errado não devolve nada", async () => {
      const { rows } = await db.query<{ v: unknown }>(
        "select public.get_reservation('token-que-nao-existe') as v",
      );
      expect(rows[0].v).toBeNull();
    });
  });
});
