import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Chamado uma vez por dia pelo cron da Vercel (vercel.json).
 *
 * O Supabase gratuito pausa o projeto depois de 7 dias sem nenhuma
 * requisição. Essa leitura leve conta como atividade e impede a pausa
 * em semanas paradas (recesso, reforma). Só lê configuração pública.
 */
export async function GET() {
  const supabase = createPublicClient();
  const { error } = await supabase.rpc("get_booking_config");

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, em: new Date().toISOString() });
}
