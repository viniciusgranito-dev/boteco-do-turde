import { Painel } from "./painel";
import { createClient } from "@/lib/supabase/server";
import { Aviso } from "@/components/ui/surface";
import { fimDoDia, hoje, inicioDoDia } from "@/lib/dia";
import type { AdminReservation, BarTable } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const params = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.data ?? "")
    ? params.data!
    : hoje();

  const supabase = await createClient();

  // Libera mesas de pendentes que estouraram o prazo antes de desenhar a agenda.
  await supabase.rpc("expire_stale_reservations");

  const [doDia, pendentes, mesas, ajustes, janela] = await Promise.all([
    supabase
      .from("reservations")
      .select("*, tables(number, capacity)")
      .gte("starts_at", inicioDoDia(dia).toISOString())
      .lt("starts_at", fimDoDia(dia).toISOString())
      .order("starts_at", { ascending: true }),

    supabase
      .from("reservations")
      .select("*, tables(number, capacity)")
      .eq("status", "pendente")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50),

    supabase
      .from("tables")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("number", { ascending: true }),

    supabase.from("settings").select("key, value"),

    supabase.rpc("day_window", { p_date: dia }),
  ]);

  const erro =
    doDia.error?.message ??
    pendentes.error?.message ??
    mesas.error?.message ??
    ajustes.error?.message;

  if (erro) {
    return (
      <Aviso tom="erro">
        Não foi possível carregar a agenda: {erro}
      </Aviso>
    );
  }

  const config = Object.fromEntries(
    (ajustes.data ?? []).map((linha) => [linha.key, linha.value]),
  ) as Record<string, string | number>;

  // day_window devolve um conjunto de uma linha só.
  const linhaJanela = Array.isArray(janela.data) ? janela.data[0] : null;

  return (
    <Painel
      dia={dia}
      janela={linhaJanela ?? null}
      reservas={(doDia.data ?? []) as AdminReservation[]}
      pendentes={(pendentes.data ?? []) as AdminReservation[]}
      mesas={(mesas.data ?? []) as BarTable[]}
      config={config}
    />
  );
}
