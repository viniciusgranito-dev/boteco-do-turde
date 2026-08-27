"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { mensagemDoErro } from "@/lib/errors";

export async function cancelarReserva(
  token: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!token || token.length < 20) {
    return { ok: false, erro: "Link inválido." };
  }

  const supabase = createPublicClient();
  const { error } = await supabase.rpc("cancel_reservation", {
    p_token: token,
  });

  if (error) {
    return { ok: false, erro: mensagemDoErro(error) };
  }

  revalidatePath(`/reserva/${token}`);
  return { ok: true };
}
