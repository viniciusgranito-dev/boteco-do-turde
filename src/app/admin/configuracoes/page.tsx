import { GestaoConfig, type Bloqueado } from "./gestao-config";
import { createClient } from "@/lib/supabase/server";
import { Aviso } from "@/components/ui/surface";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const [ajustes, bloqueados] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase
      .from("blocked_phones")
      .select("phone, reason")
      .order("created_at", { ascending: false }),
  ]);

  const erro = ajustes.error?.message ?? bloqueados.error?.message;
  if (erro) {
    return <Aviso tom="erro">Não foi possível carregar os ajustes: {erro}</Aviso>;
  }

  const config = Object.fromEntries(
    (ajustes.data ?? []).map((linha) => [linha.key, linha.value]),
  ) as Record<string, string | number>;

  return (
    <GestaoConfig
      config={config}
      bloqueados={(bloqueados.data ?? []) as Bloqueado[]}
    />
  );
}
