-- =====================================================================
-- Boteco do Turde — Reservas
-- Migration 01: extensões, tipos e tabelas
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type public.reservation_status as enum (
      'pendente',
      'confirmada',
      'recusada',
      'cancelada',
      'expirada',
      'compareceu',
      'no_show'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Mesas
-- ---------------------------------------------------------------------
create table if not exists public.tables (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null unique,
  capacity    integer not null check (capacity between 1 and 40),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.tables is
  'Mesas físicas do bar. O número serve só para a organização interna do bar:
   quem escolhe a mesa é o sistema, não o cliente. Desative em vez de apagar,
   senão o histórico de reservas perde o sentido.';

-- ---------------------------------------------------------------------
-- Horário de funcionamento (padrão semanal)
-- weekday: 0 = domingo ... 6 = sábado (mesmo padrão de EXTRACT(dow))
-- ---------------------------------------------------------------------
create table if not exists public.opening_hours (
  weekday    integer primary key check (weekday between 0 and 6),
  opens_at   time not null,
  closes_at  time not null,
  active     boolean not null default true
);

comment on table public.opening_hours is 'Horário padrão por dia da semana. active=false significa fechado.';

-- ---------------------------------------------------------------------
-- Datas especiais (feriado, show, jogo, fechamento pontual)
-- ---------------------------------------------------------------------
create table if not exists public.special_dates (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  label       text not null,
  closed      boolean not null default false,
  opens_at    time,
  closes_at   time,
  created_at  timestamptz not null default now()
);

comment on table public.special_dates is
  'Feriado, show, jogo: fecha o bar naquele dia ou muda o horário dele.';

-- ---------------------------------------------------------------------
-- Configurações (chave/valor)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Telefones bloqueados (reincidente de no-show, trote)
-- ---------------------------------------------------------------------
create table if not exists public.blocked_phones (
  phone       text primary key,
  reason      text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table if not exists public.reservations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  table_id        uuid not null references public.tables (id) on delete restrict,
  customer_name   text not null check (length(btrim(customer_name)) >= 3),
  customer_phone  text not null check (customer_phone ~ '^[0-9]{10,11}$'),
  party_size      integer not null check (party_size >= 1),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  period          tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status          public.reservation_status not null default 'pendente',
  notes           text,
  decline_reason  text,
  manage_token    text not null unique default encode(gen_random_bytes(18), 'hex'),
  source          text not null default 'site' check (source in ('site', 'manual')),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_ip      inet,
  decided_at      timestamptz,
  decided_by      uuid references auth.users (id) on delete set null,

  constraint reservations_valid_period check (ends_at > starts_at),

  -- Requisito crítico: duas reservas nunca ocupam a mesma mesa ao mesmo tempo.
  -- Garantido pelo banco, não pela interface.
  constraint reservations_no_overlap exclude using gist (
    table_id with =,
    period   with &&
  ) where (status in ('pendente', 'confirmada', 'compareceu'))
);

create index if not exists reservations_starts_at_idx on public.reservations (starts_at);
create index if not exists reservations_status_idx    on public.reservations (status);
create index if not exists reservations_phone_idx     on public.reservations (customer_phone);
create index if not exists reservations_token_idx     on public.reservations (manage_token);

-- ---------------------------------------------------------------------
-- Log de auditoria
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id              bigint generated always as identity primary key,
  reservation_id  uuid references public.reservations (id) on delete cascade,
  actor           uuid references auth.users (id) on delete set null,
  action          text not null,
  from_status     public.reservation_status,
  to_status       public.reservation_status,
  detail          jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_reservation_idx on public.audit_log (reservation_id, created_at desc);

-- ---------------------------------------------------------------------
-- Trigger de auditoria em mudança de status
-- ---------------------------------------------------------------------
create or replace function public.log_reservation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (reservation_id, actor, action, to_status, detail)
    values (new.id, auth.uid(), 'criada', new.status,
            jsonb_build_object('source', new.source, 'party_size', new.party_size));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_log (reservation_id, actor, action, from_status, to_status, detail)
    values (new.id, auth.uid(), 'status_alterado', old.status, new.status,
            jsonb_build_object('decline_reason', new.decline_reason));
  end if;

  if new.table_id is distinct from old.table_id or new.starts_at is distinct from old.starts_at then
    insert into public.audit_log (reservation_id, actor, action, detail)
    values (new.id, auth.uid(), 'remarcada',
            jsonb_build_object(
              'de', jsonb_build_object('table_id', old.table_id, 'starts_at', old.starts_at),
              'para', jsonb_build_object('table_id', new.table_id, 'starts_at', new.starts_at)
            ));
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_audit on public.reservations;
create trigger reservations_audit
  after insert or update on public.reservations
  for each row execute function public.log_reservation_status_change();

-- ---------------------------------------------------------------------
-- Realtime: o painel do bar precisa ver mudanças na hora
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
    ) then
      alter publication supabase_realtime add table public.reservations;
    end if;
  end if;
end $$;
