-- =====================================================================
-- Boteco do Turde — Reservas
-- Seed: dados iniciais. Pode rodar mais de uma vez sem duplicar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Horário de funcionamento REAL do bar
-- weekday: 0=domingo, 1=segunda, ... 6=sábado
-- ---------------------------------------------------------------------
insert into public.opening_hours (weekday, opens_at, closes_at, active) values
  (0, '17:30', '22:30', true),   -- domingo
  (1, '17:30', '22:30', false),  -- segunda-feira: FECHADO
  (2, '17:30', '22:30', true),   -- terça-feira
  (3, '17:30', '22:30', true),   -- quarta-feira
  (4, '17:30', '22:30', true),   -- quinta-feira
  (5, '17:30', '23:30', true),   -- sexta-feira
  (6, '17:30', '23:30', true)    -- sábado
on conflict (weekday) do update
  set opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      active = excluded.active;

-- ---------------------------------------------------------------------
-- Mesas
--
-- O cliente nunca vê isto. Serve para duas coisas:
--   1. saber quantos grupos de cada tamanho cabem em cada horário;
--   2. te dar um número para se organizar no salão.
--
-- O que importa de verdade é a CAPACIDADE de cada mesa. Se você junta
-- mesas para grupo grande, cadastre a junção como se fosse uma mesa só
-- (ex.: mesa 20, 12 lugares) — senão o site nunca vai aceitar o grupão.
--
-- ⚠️ ESTES NÚMEROS SÃO UM CHUTE INICIAL. Ajuste em /admin/mesas.
-- ---------------------------------------------------------------------
insert into public.tables (number, capacity, sort_order) values
  ( 1, 4,  10),
  ( 2, 4,  20),
  ( 3, 4,  30),
  ( 4, 4,  40),
  ( 5, 4,  50),
  ( 6, 4,  60),
  ( 7, 2,  70),
  ( 8, 2,  80),
  ( 9, 6,  90),
  (10, 6, 100),
  (11, 6, 110),
  (12, 6, 120),
  (13, 8, 130),
  (14, 8, 140)
on conflict (number) do nothing;

-- ---------------------------------------------------------------------
-- Configurações
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
  ('timezone',                     '"America/Sao_Paulo"'),
  ('bar_name',                     '"Boteco do Turde"'),
  ('bar_address',                  '"Pederneiras - SP"'),
  ('bar_phone',                    '"5514999999999"'),
  ('bar_instagram',                '""'),
  ('rules_text',                   '"A gente confirma toda reserva no WhatsApp antes de valer. Depois de confirmada, a mesa fica guardada por 20 minutos a partir do horário combinado. Se não puder vir, cancele pelo link — assim outra galera aproveita."'),

  -- Prazo de aprovação
  ('pending_hold_hours',           '12'),

  -- Grade de horários
  ('reservation_duration_minutes', '120'),
  ('slot_minutes',                 '30'),
  ('last_slot_offset_minutes',     '60'),
  ('last_slot_time',               '"20:00"'),
  ('min_lead_minutes',             '60'),
  ('booking_window_days',          '30'),

  -- Limites
  ('max_party_size',               '20'),
  ('max_active_per_phone',         '3'),

  -- Mensagens de WhatsApp (o painel monta o link wa.me com isso preenchido)
  ('msg_confirm',
   '"Opa {nome}! Sua reserva no Boteco do Turde está CONFIRMADA ✅\n\n📅 {data} às {hora}\n👥 {pessoas} pessoas\n🔖 Código: {codigo}\n\nA mesa fica guardada por 20 min a partir do horário. Se não puder vir, avisa a gente. Até lá!"'),
  ('msg_decline',
   '"Oi {nome}, tudo bem? Infelizmente não vamos conseguir atender sua reserva de {data} às {hora}. {motivo}\n\nMe chama aqui que a gente tenta outro horário. Abraço!"'),
  ('msg_reminder',
   '"Oi {nome}! Passando pra lembrar da sua mesa hoje às {hora} no Boteco do Turde 🍻\n{pessoas} pessoas · Código {codigo}\n\nSe não puder vir, avisa pra gente liberar. Valeu!"')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Reservas fictícias no próximo sábado, só para ver o painel com vida.
-- Apague à vontade depois de testar.
-- ---------------------------------------------------------------------
do $$
declare
  v_tz   text := 'America/Sao_Paulo';
  v_sat  date := (now() at time zone v_tz)::date
                 + ((6 - extract(dow from (now() at time zone v_tz)::date)::integer + 7) % 7);
  v_t1   uuid; v_t2 uuid; v_t3 uuid;
begin
  if v_sat = (now() at time zone v_tz)::date then
    v_sat := v_sat + 7;
  end if;

  select id into v_t1 from public.tables where number = 3;
  select id into v_t2 from public.tables where number = 10;
  select id into v_t3 from public.tables where number = 13;

  if exists (select 1 from public.reservations where source = 'site' and starts_at::date = v_sat) then
    return; -- seed já rodou
  end if;

  insert into public.reservations
    (table_id, customer_name, customer_phone, party_size, starts_at, ends_at, status, notes)
  values
    (v_t1, 'Ana Paula Ribeiro', '14991234567', 4,
     timezone(v_tz, (v_sat + time '19:00')::timestamp),
     timezone(v_tz, (v_sat + time '21:00')::timestamp),
     'confirmada', null),

    (v_t2, 'Marcos Vinícius Alves', '14998887766', 6,
     timezone(v_tz, (v_sat + time '20:00')::timestamp),
     timezone(v_tz, (v_sat + time '22:00')::timestamp),
     'pendente', 'Aniversário, vamos levar bolo'),

    (v_t3, 'Juliana Castro', '14997776655', 8,
     timezone(v_tz, (v_sat + time '20:30')::timestamp),
     timezone(v_tz, (v_sat + time '22:30')::timestamp),
     'pendente', 'Confraternização do trabalho');
end $$;
