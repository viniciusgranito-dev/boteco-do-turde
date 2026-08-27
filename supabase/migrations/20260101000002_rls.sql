-- =====================================================================
-- Boteco do Turde — Reservas
-- Migration 03: Row Level Security e permissões
--
-- Regra geral:
--   • anon (o cliente no site) não toca em NENHUMA tabela diretamente.
--     Todo o acesso público passa pelas funções SECURITY DEFINER, que
--     devolvem apenas o necessário e nunca dados de outros clientes.
--   • authenticated (equipe do bar) tem acesso completo.
-- =====================================================================

alter table public.tables          enable row level security;
alter table public.opening_hours   enable row level security;
alter table public.special_dates   enable row level security;
alter table public.settings        enable row level security;
alter table public.reservations    enable row level security;
alter table public.blocked_phones  enable row level security;
alter table public.audit_log       enable row level security;

-- ---------------------------------------------------------------------
-- Equipe do bar: acesso total
-- ---------------------------------------------------------------------
drop policy if exists staff_all on public.tables;
create policy staff_all on public.tables
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.opening_hours;
create policy staff_all on public.opening_hours
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.special_dates;
create policy staff_all on public.special_dates
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.settings;
create policy staff_all on public.settings
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.reservations;
create policy staff_all on public.reservations
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.blocked_phones;
create policy staff_all on public.blocked_phones
  for all to authenticated using (true) with check (true);

-- Auditoria é só leitura: quem escreve é o trigger (SECURITY DEFINER).
drop policy if exists staff_read on public.audit_log;
create policy staff_read on public.audit_log
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Público (anon): zero acesso direto a tabelas
-- Sem policy = negado. Revogamos os grants por garantia.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Funções: por padrão o Postgres libera EXECUTE para PUBLIC.
-- Fechamos tudo e reabrimos só o que é da porta da rua.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.get_booking_config()                                        to anon, authenticated;
grant execute on function public.get_day_availability(date)                                  to anon, authenticated;
grant execute on function public.create_reservation(timestamptz, text, text, integer, text, text)
                                                                                             to anon, authenticated;
grant execute on function public.get_reservation(text)                                       to anon, authenticated;
grant execute on function public.cancel_reservation(text)                                    to anon, authenticated;

grant execute on all functions in schema public to authenticated;

-- O service_role do Supabase perdeu o EXECUTE junto com o PUBLIC acima.
-- Devolvemos, senão as ferramentas internas do painel do Supabase quebram.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all       on all tables    in schema public to service_role;
    grant all       on all sequences in schema public to service_role;
    grant execute   on all functions in schema public to service_role;
  end if;
end $$;
