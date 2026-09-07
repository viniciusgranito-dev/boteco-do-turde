-- =====================================================================
-- Boteco do Turde — Reservas
-- Migration 04: rate limiting e proteção contra tentativas de acesso
--
-- Por que no banco, e não em memória do Node:
--   O freio antigo do fluxo de reserva era um Map dentro do processo.
--   Em serverless cada instância tem o seu, então o limite real era
--   8 × (número de instâncias), e zerava a cada cold start. Contador
--   em tabela é o único que vale para o cluster inteiro.
--
-- Por que o limite mora aqui dentro:
--   O anon precisa poder executar rate_limit_check (o fluxo público
--   fala com o banco como anon). Se a função aceitasse o limite como
--   argumento, o atacante passaria p_limit => 999999. Então a função
--   recebe apenas o NOME da ação e resolve o limite internamente.
--
-- Limitação conhecida, registrada de propósito:
--   Como o anon executa a função, alguém pode chamá-la direto passando
--   a chave de outra pessoa e queimar a cota dela (ex.: travar um IP
--   por até 2 h). É incômodo, não é acesso indevido. Fechar isso exige
--   uma service_role key no servidor — segredo que este projeto hoje
--   não tem, e cuja introdução tem custo próprio. Se um dia existir,
--   basta revogar o grant de rate_limit_check para anon.
--
--   rate_limit_reset, por outro lado, NUNCA vai para anon: quem pudesse
--   zerar o próprio contador não estaria limitado a nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Uma linha por tentativa, dentro da janela. Limpa sozinha a cada check.
create table if not exists public.rate_limit_hits (
  id          bigint generated always as identity primary key,
  bucket      text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists rate_limit_hits_bucket_idx
  on public.rate_limit_hits (bucket, created_at desc);

-- Castigo progressivo. `strikes` não zera junto com os hits, para que
-- o reincidente pegue janela maior que o distraído.
create table if not exists public.access_lockouts (
  bucket      text        primary key,
  until       timestamptz not null,
  strikes     integer     not null default 1,
  updated_at  timestamptz not null default now()
);

create index if not exists access_lockouts_until_idx
  on public.access_lockouts (until desc);

-- ---------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_check(p_action text, p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit    integer;
  v_window   integer;   -- em segundos
  v_escalona boolean;
  v_key      text;
  v_bucket   text;
  v_count    integer;
  v_until    timestamptz;
  v_strikes  integer;
  v_espera   integer;
begin
  -- Chave truncada: o bucket é indexado e vem de fora, não pode crescer sem teto.
  v_key := nullif(btrim(left(coalesce(p_key, ''), 100)), '');
  if v_key is null then
    v_key := 'desconhecido';
  end if;

  case p_action
    -- senha de funcionário: pouco tolerante, com castigo crescente
    when 'login_ip'    then v_limit := 5;   v_window := 600;  v_escalona := true;
    -- por e-mail: só janela, sem castigo. Assim ninguém tranca a conta
    -- de um funcionário de fora, e ainda assim segura credential stuffing.
    when 'login_email' then v_limit := 10;  v_window := 900;  v_escalona := false;
    -- adivinhação de token de reserva
    when 'cancel_ip'   then v_limit := 10;  v_window := 600;  v_escalona := true;
    -- criação de reserva: mesmo número que o freio antigo, agora valendo de verdade
    when 'reserva_ip'  then v_limit := 8;   v_window := 600;  v_escalona := false;
    -- leitura de disponibilidade: generoso, só barra raspagem
    when 'consulta_ip' then v_limit := 120; v_window := 600;  v_escalona := false;
    else raise exception 'ACAO_DESCONHECIDA';
  end case;

  v_bucket := p_action || ':' || v_key;

  -- 1) Já está de castigo?
  select until, strikes into v_until, v_strikes
    from public.access_lockouts
   where bucket = v_bucket;

  if v_until is not null and v_until > now() then
    return jsonb_build_object(
      'allowed',     false,
      'locked',      true,
      'retry_after', ceil(extract(epoch from (v_until - now())))::integer
    );
  end if;

  -- 2) Conta o que está dentro da janela, descartando o que venceu.
  delete from public.rate_limit_hits
   where bucket = v_bucket
     and created_at < now() - make_interval(secs => v_window);

  select count(*) into v_count
    from public.rate_limit_hits
   where bucket = v_bucket;

  if v_count >= v_limit then
    if v_escalona then
      v_strikes := coalesce(v_strikes, 0) + 1;
      -- 10 min, 30 min, 1h30, e daí em diante o teto de 2 h.
      v_espera := least(7200, (v_window * power(3, least(v_strikes, 4) - 1))::integer);
      v_until  := now() + make_interval(secs => v_espera);

      insert into public.access_lockouts (bucket, until, strikes, updated_at)
        values (v_bucket, v_until, v_strikes, now())
        on conflict (bucket) do update
          set until = excluded.until,
              strikes = excluded.strikes,
              updated_at = now();

      -- Zera os hits: senão, ao vencer o castigo o contador já estaria
      -- no limite e a próxima tentativa trancaria de novo na hora.
      delete from public.rate_limit_hits where bucket = v_bucket;

      return jsonb_build_object(
        'allowed',     false,
        'locked',      true,
        'retry_after', v_espera
      );
    end if;

    return jsonb_build_object(
      'allowed',     false,
      'locked',      false,
      'retry_after', v_window
    );
  end if;

  insert into public.rate_limit_hits (bucket) values (v_bucket);

  return jsonb_build_object(
    'allowed',   true,
    'locked',    false,
    'remaining', v_limit - v_count - 1
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Liberação — só para quem já entrou (nunca anon)
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_reset(p_action text, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bucket text;
begin
  v_bucket := p_action || ':' ||
              coalesce(nullif(btrim(left(coalesce(p_key, ''), 100)), ''), 'desconhecido');
  delete from public.rate_limit_hits  where bucket = v_bucket;
  delete from public.access_lockouts  where bucket = v_bucket;
end;
$$;

-- ---------------------------------------------------------------------
-- Faxina — para cron ou chamada manual da equipe
-- ---------------------------------------------------------------------
create or replace function public.purge_rate_limit()
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.rate_limit_hits where created_at < now() - interval '24 hours';
  delete from public.access_lockouts where until      < now() - interval '7 days';
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: anon não encosta nas tabelas; a equipe lê para investigar.
-- ---------------------------------------------------------------------
alter table public.rate_limit_hits  enable row level security;
alter table public.access_lockouts  enable row level security;

drop policy if exists staff_read on public.rate_limit_hits;
create policy staff_read on public.rate_limit_hits
  for select to authenticated using (true);

drop policy if exists staff_all on public.access_lockouts;
create policy staff_all on public.access_lockouts
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on function public.rate_limit_check(text, text)  from public;
revoke all on function public.rate_limit_reset(text, text)  from public;
revoke all on function public.purge_rate_limit()            from public;

grant execute on function public.rate_limit_check(text, text) to anon, authenticated;
grant execute on function public.rate_limit_reset(text, text) to authenticated;
grant execute on function public.purge_rate_limit()           to authenticated;
