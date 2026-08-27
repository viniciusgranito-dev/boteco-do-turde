import {
  GestaoHorarios,
  type LinhaEspecial,
  type LinhaHorario,
} from "./gestao-horarios";
import { createClient } from "@/lib/supabase/server";
import { Aviso } from "@/components/ui/surface";
import { hoje } from "@/lib/dia";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const supabase = await createClient();

  const [horarios, especiais] = await Promise.all([
    supabase.from("opening_hours").select("*").order("weekday"),
    supabase
      .from("special_dates")
      .select("*")
      .gte("date", hoje())
      .order("date"),
  ]);

  const erro = horarios.error?.message ?? especiais.error?.message;
  if (erro) {
    return <Aviso tom="erro">Não foi possível carregar os horários: {erro}</Aviso>;
  }

  return (
    <GestaoHorarios
      horarios={(horarios.data ?? []) as LinhaHorario[]}
      especiais={(especiais.data ?? []) as LinhaEspecial[]}
    />
  );
}
