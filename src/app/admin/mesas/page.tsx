import { GestaoMesas } from "./gestao-mesas";
import { createClient } from "@/lib/supabase/server";
import { Aviso } from "@/components/ui/surface";
import type { BarTable } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("number", { ascending: true });

  if (error) {
    return <Aviso tom="erro">Não foi possível carregar as mesas: {error.message}</Aviso>;
  }

  return <GestaoMesas mesas={(data ?? []) as BarTable[]} />;
}
