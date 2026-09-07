"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { mensagemDoErro } from "@/lib/errors";
import { ipDoPedido, tempoDeEspera, verificarFreio } from "@/lib/rate-limit";

export async function cancelarReserva(
  token: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!token || token.length < 20) {
    return { ok: false, erro: "Link inválido." };
  }

  const supabase = createPublicClient();

  // Sem freio, dava para varrer token atrás de token até acertar o de
  // alguém e cancelar a reserva de outra pessoa. O freio vem antes da
  // chamada ao banco, então o chute custa caro e o castigo é crescente.
  const freio = await verificarFreio(supabase, "cancel_ip", await ipDoPedido());
  if (!freio.liberado) {
    return {
      ok: false,
      erro: `Muitas tentativas seguidas. Espere ${tempoDeEspera(
        freio.esperaSegundos,
      )} ou chame o bar no WhatsApp.`,
    };
  }

  const { error } = await supabase.rpc("cancel_reservation", {
    p_token: token,
  });

  if (error) {
    return { ok: false, erro: mensagemDoErro(error) };
  }

  revalidatePath(`/reserva/${token}`);
  return { ok: true };
}
