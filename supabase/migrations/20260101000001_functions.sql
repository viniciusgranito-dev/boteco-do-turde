-- =====================================================================
-- Boteco do Turde — Reservas
-- Migration 02: funções de negócio
--
-- Toda a regra de negócio vive aqui, no banco. O site é só a casca:
-- se alguém chamar a API por fora, as mesmas regras valem.
--
-- Duas decisões que atravessam este arquivo:
--   • TODA reserva nasce PENDENTE. Nada é confirmado sem o bar aprovar.
--   • O cliente NÃO escolhe a mesa. O sistema separa a menor mesa livre
--     que comporta o grupo, e o bar pode trocar depois no painel. É isso
--     que mantém a garantia de que duas pessoas nunca pegam a mesma mesa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Leitura de configurações
-- ---------------------------------------------------------------------
create or replace function public.setting_int(p_key text, p_default integer)
returns integer language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::integer from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_text(p_key text, p_default text)
returns text language sql stable set search_path = public as $$
  select coalesce((select value #>> '{}' from public.settings where key = p_key), p_default);
$$;

create or replace function public.bar_tz()
returns text language sql stable set search_path = public as $$
  select public.setting_text('timezone', 'America/Sao_Paulo');
$$;

create or replace function public.touch_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_settings();

-- ---------------------------------------------------------------------
-- Código curto da reserva — sem 0/O/1/I para não confundir no WhatsApp
-- ---------------------------------------------------------------------
create or replace function public.gen_reservation_code()
returns text language sql volatile set search_path = public as $$
  select 'TURDE-' || (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 4)
  );
$$;

alter table public.reservations alter column code set default public.gen_reservation_code();

-- ---------------------------------------------------------------------
-- Telefone: guardamos só dígitos
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

-- ---------------------------------------------------------------------
-- Janela de funcionamento de um dia, já resolvendo datas especiais
-- ---------------------------------------------------------------------
create or replace function public.day_window(p_date date)
returns table (
  is_open   boolean,
  opens_at  timestamptz,
  closes_at timestamptz,
  label     text
)
language plpgsql stable set search_path = public as $$
declare
  v_tz     text := public.bar_tz();
  v_dow    integer := extract(dow from p_date)::integer;
  v_open   time;
  v_close  time;
  v_active boolean;
  v_sp     public.special_dates%rowtype;
begin
  select * into v_sp from public.special_dates sd where sd.date = p_date;

  select oh.opens_at, oh.closes_at, oh.active
    into v_open, v_close, v_active
    from public.opening_hours oh
   where oh.weekday = v_dow;

  label := v_sp.label;

  if v_sp.id is not null then
    if v_sp.closed then
      is_open := false; opens_at := null; closes_at := null;
      return next; return;
    end if;
    -- Data especial pode abrir num dia normalmente fechado, ou mudar o horário.
    if v_sp.opens_at is not null and v_sp.closes_at is not null then
      v_open := v_sp.opens_at;
      v_close := v_sp.closes_at;
      v_active := true;
    end if;
  end if;

  if v_open is null or v_close is null or not coalesce(v_active, false) then
    is_open := false; opens_at := null; closes_at := null;
    return next; return;
  end if;

  is_open  := true;
  opens_at := timezone(v_tz, (p_date + v_open)::timestamp);
  -- Se fecha depois da meia-noite, o fechamento cai no dia seguinte.
  if v_close <= v_open then
    closes_at := timezone(v_tz, ((p_date + 1) + v_close)::timestamp);
  else
    closes_at := timezone(v_tz, (p_date + v_close)::timestamp);
  end if;

  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Expiração de pendentes
--
-- Chamada preguiçosamente em toda consulta de disponibilidade e em toda
-- criação de reserva — assim a mesa é liberada sem depender de cron.
-- Se você habilitar pg_cron, agende também (veja o README).
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_reservations()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with upd as (
    update public.reservations
       set status = 'expirada'
     where status = 'pendente'
       and expires_at is not null
       and expires_at < now()
    returning 1
  )
  select count(*) into v_count from upd;
  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- Configuração pública do formulário (nada sensível sai daqui)
-- ---------------------------------------------------------------------
create or replace function public.get_booking_config()
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_tz    text := public.bar_tz();
  v_days  integer := public.setting_int('booking_window_days', 30);
  v_today date := (now() at time zone v_tz)::date;
begin
  return jsonb_build_object(
    'timezone',                     v_tz,
    'today',                        v_today,
    'bar_name',                     public.setting_text('bar_name', 'Boteco do Turde'),
    'bar_address',                  public.setting_text('bar_address', ''),
    'bar_phone',                    public.setting_text('bar_phone', ''),
    'bar_instagram',                public.setting_text('bar_instagram', ''),
    'rules_text',                   public.setting_text('rules_text', ''),
    'booking_window_days',          v_days,
    'slot_minutes',                 public.setting_int('slot_minutes', 30),
    'reservation_duration_minutes', public.setting_int('reservation_duration_minutes', 120),
    'max_party_size',               public.setting_int('max_party_size', 20),
    'pending_hold_hours',           public.setting_int('pending_hold_hours', 12),
    'weekdays', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday', oh.weekday, 'opens_at', oh.opens_at, 'closes_at', oh.closes_at, 'active', oh.active
             ) order by oh.weekday), '[]'::jsonb)
        from public.opening_hours oh
    ),
    'special_dates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', sd.date, 'label', sd.label, 'closed', sd.closed
             ) order by sd.date), '[]'::jsonb)
        from public.special_dates sd
       where sd.date between v_today and v_today + v_days
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Disponibilidade de um dia
--
-- Devolve os horários possíveis e, de cada mesa, só a capacidade e os
-- intervalos OCUPADOS — sem número, sem nome, sem telefone. O site usa
-- isso apenas para saber se ainda cabe um grupo de N pessoas em cada
-- horário; o cliente nunca vê mesa nenhuma.
-- ---------------------------------------------------------------------
create or replace function public.get_day_availability(p_date date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tz       text := public.bar_tz();
  v_win      record;
  v_slot_min integer := public.setting_int('slot_minutes', 30);
  v_dur      integer := public.setting_int('reservation_duration_minutes', 120);
  v_last_off integer := public.setting_int('last_slot_offset_minutes', 60);
  v_days     integer := public.setting_int('booking_window_days', 30);
  v_lead     integer := public.setting_int('min_lead_minutes', 60);
  v_today    date := (now() at time zone v_tz)::date;
  v_slots    jsonb;
  v_tables   jsonb;
begin
  perform public.expire_stale_reservations();

  if p_date < v_today or p_date > v_today + v_days then
    return jsonb_build_object(
      'date', p_date, 'is_open', false, 'reason', 'fora_da_janela',
      'slots', '[]'::jsonb, 'tables', '[]'::jsonb
    );
  end if;

  select * into v_win from public.day_window(p_date);

  if not v_win.is_open then
    return jsonb_build_object(
      'date', p_date, 'is_open', false, 'reason', 'fechado', 'label', v_win.label,
      'slots', '[]'::jsonb, 'tables', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s), '[]'::jsonb)
    into v_slots
    from generate_series(
           v_win.opens_at,
           v_win.closes_at - make_interval(mins => v_last_off),
           make_interval(mins => v_slot_min)
         ) as s
   where s >= now() + make_interval(mins => v_lead);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'capacity', t.capacity,
             'busy',     coalesce(b.busy, '[]'::jsonb)
           ) order by t.capacity, t.sort_order
         ), '[]'::jsonb)
    into v_tables
    from public.tables t
    left join lateral (
      select jsonb_agg(jsonb_build_object('s', r.starts_at, 'e', r.ends_at)) as busy
        from public.reservations r
       where r.table_id = t.id
         and r.status in ('pendente', 'confirmada', 'compareceu')
         and r.period && tstzrange(v_win.opens_at, v_win.closes_at, '[)')
    ) b on true
   where t.active;

  return jsonb_build_object(
    'date',             p_date,
    'is_open',          true,
    'label',            v_win.label,
    'opens_at',         v_win.opens_at,
    'closes_at',        v_win.closes_at,
    'duration_minutes', v_dur,
    'slot_minutes',     v_slot_min,
    'slots',            v_slots,
    'tables',           v_tables
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Criação da reserva (fluxo público)
--
-- O cliente manda dia, hora, quantas pessoas e o contato. A mesa é
-- escolhida aqui dentro. A reserva sempre nasce PENDENTE.
--
-- Erros são levantados com uma chave estável (SEM_MESA, etc.);
-- a tradução para português amigável acontece no front.
-- ---------------------------------------------------------------------
drop function if exists public.create_reservation(timestamptz, uuid, text, text, integer, text, text);

create or replace function public.create_reservation(
  p_starts_at  timestamptz,
  p_name       text,
  p_phone      text,
  p_party_size integer,
  p_notes      text default null,
  p_hp         text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tz         text := public.bar_tz();
  v_today      date := (now() at time zone v_tz)::date;
  v_date       date;
  v_win        record;
  v_phone      text := public.normalize_phone(p_phone);
  v_name       text := btrim(coalesce(p_name, ''));
  v_notes      text := nullif(btrim(coalesce(p_notes, '')), '');
  v_dur        integer := public.setting_int('reservation_duration_minutes', 120);
  v_max_party  integer := public.setting_int('max_party_size', 20);
  v_hold       integer := public.setting_int('pending_hold_hours', 12);
  v_max_active integer := public.setting_int('max_active_per_phone', 3);
  v_slot_min   integer := public.setting_int('slot_minutes', 30);
  v_lead       integer := public.setting_int('min_lead_minutes', 60);
  v_last_off   integer := public.setting_int('last_slot_offset_minutes', 60);
  v_days       integer := public.setting_int('booking_window_days', 30);
  v_table      public.tables%rowtype;
  v_ends       timestamptz;
  v_expires    timestamptz;
  v_row        public.reservations%rowtype;
  v_gravou     boolean := false;
begin
  -- Honeypot: campo invisível preenchido = robô.
  if coalesce(btrim(coalesce(p_hp, '')), '') <> '' then
    raise exception 'SPAM';
  end if;

  perform public.expire_stale_reservations();

  if length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'NOME_INVALIDO';
  end if;

  if v_phone !~ '^[0-9]{10,11}$' then
    raise exception 'TELEFONE_INVALIDO';
  end if;

  if exists (select 1 from public.blocked_phones bp where bp.phone = v_phone) then
    raise exception 'TELEFONE_BLOQUEADO';
  end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > v_max_party then
    raise exception 'GRUPO_INVALIDO';
  end if;

  if p_starts_at is null then
    raise exception 'HORARIO_INVALIDO';
  end if;

  v_date := (p_starts_at at time zone v_tz)::date;

  if v_date < v_today or v_date > v_today + v_days then
    raise exception 'DATA_FORA_JANELA';
  end if;

  select * into v_win from public.day_window(v_date);
  if not v_win.is_open then
    raise exception 'BAR_FECHADO';
  end if;

  if p_starts_at < v_win.opens_at
     or p_starts_at > v_win.closes_at - make_interval(mins => v_last_off)
     or p_starts_at < now() + make_interval(mins => v_lead)
     or (extract(epoch from (p_starts_at - v_win.opens_at))::bigint % (v_slot_min * 60)) <> 0 then
    raise exception 'HORARIO_INVALIDO';
  end if;

  if (select count(*) from public.reservations r
       where r.customer_phone = v_phone
         and r.status in ('pendente', 'confirmada')
         and r.starts_at > now()) >= v_max_active then
    raise exception 'LIMITE_RESERVAS';
  end if;

  -- A mesa fica ocupada pela duração padrão, no máximo até a hora de fechar.
  v_ends    := least(p_starts_at + make_interval(mins => v_dur), v_win.closes_at);
  -- Pendente segura a mesa até o prazo, nunca além da hora da própria reserva.
  v_expires := least(now() + make_interval(hours => v_hold), p_starts_at);

  -- ---- Atribuição automática da mesa ---------------------------------
  -- Pega a MENOR mesa livre que comporta o grupo, para não gastar uma
  -- mesa grande com um casal e deixar a turma de dez sem lugar.
  -- Se alguém fisgar a mesa entre o select e o insert, a constraint do
  -- banco barra e tentamos a próxima.
  for v_tentativa in 1..5 loop
    select t.* into v_table
      from public.tables t
     where t.active
       and t.capacity >= p_party_size
       and not exists (
             select 1 from public.reservations r
              where r.table_id = t.id
                and r.status in ('pendente', 'confirmada', 'compareceu')
                and r.period && tstzrange(p_starts_at, v_ends, '[)')
           )
     order by t.capacity asc, t.sort_order asc, t.number asc
     limit 1;

    if v_table.id is null then
      raise exception 'SEM_MESA';
    end if;

    begin
      insert into public.reservations (
        table_id, customer_name, customer_phone, party_size,
        starts_at, ends_at, status, notes, expires_at, source
      ) values (
        v_table.id, v_name, v_phone, p_party_size,
        p_starts_at, v_ends, 'pendente', v_notes, v_expires, 'site'
      )
      returning * into v_row;
      v_gravou := true;
    exception
      when exclusion_violation then v_gravou := false;  -- mesa fisgada, tenta outra
      when unique_violation    then v_gravou := false;  -- colisão no código curto
    end;

    exit when v_gravou;
    v_table := null;
  end loop;

  if not v_gravou then
    raise exception 'MESA_INDISPONIVEL';
  end if;
  -- ---------------------------------------------------------------------

  return jsonb_build_object(
    'code',               v_row.code,
    'manage_token',       v_row.manage_token,
    'status',             v_row.status,
    'starts_at',          v_row.starts_at,
    'ends_at',            v_row.ends_at,
    'party_size',         v_row.party_size,
    'customer_name',      v_row.customer_name,
    'expires_at',         v_row.expires_at,
    'pending_hold_hours', v_hold
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Consulta da própria reserva pelo token do link pessoal
--
-- Não devolve a mesa: o cliente não escolheu, e o bar pode trocar até a
-- hora de aprovar. Mostrar número de mesa aqui só geraria confusão.
-- ---------------------------------------------------------------------
create or replace function public.get_reservation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.reservations%rowtype;
begin
  perform public.expire_stale_reservations();

  select * into v_row from public.reservations r where r.manage_token = p_token;
  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'code',           v_row.code,
    'status',         v_row.status,
    'customer_name',  v_row.customer_name,
    'party_size',     v_row.party_size,
    'starts_at',      v_row.starts_at,
    'ends_at',        v_row.ends_at,
    'notes',          v_row.notes,
    'decline_reason', v_row.decline_reason,
    'expires_at',     v_row.expires_at,
    'can_cancel',     (v_row.status in ('pendente', 'confirmada') and v_row.starts_at > now())
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Cancelamento pelo cliente
-- ---------------------------------------------------------------------
create or replace function public.cancel_reservation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.reservations%rowtype;
begin
  select * into v_row from public.reservations r where r.manage_token = p_token for update;

  if v_row.id is null then
    raise exception 'RESERVA_NAO_ENCONTRADA';
  end if;

  if v_row.status not in ('pendente', 'confirmada') then
    raise exception 'RESERVA_NAO_CANCELAVEL';
  end if;

  if v_row.starts_at <= now() then
    raise exception 'RESERVA_JA_COMECOU';
  end if;

  update public.reservations
     set status = 'cancelada', decided_at = now()
   where id = v_row.id;

  return public.get_reservation(p_token);
end;
$$;
