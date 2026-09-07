import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Freio de tentativas. O contador mora no Postgres (migration 04),
 * não em memória do processo: em serverless cada instância tem a sua
 * memória, então contador local não limita nada de verdade.
 *
 * Os limites NÃO são passados daqui — a função do banco só aceita o
 * nome da ação e resolve o limite internamente. Isso é de propósito:
 * o fluxo público fala com o banco como `anon`, e um limite vindo do
 * cliente seria escolhido pelo atacante.
 */
export type AcaoFreio =
  | "login_ip"
  | "login_email"
  | "cancel_ip"
  | "reserva_ip"
  | "consulta_ip";

export type Freio =
  | { liberado: true }
  | { liberado: false; travado: boolean; esperaSegundos: number };

type RespostaBanco = {
  allowed: boolean;
  locked: boolean;
  retry_after?: number;
  remaining?: number;
};

/** IP de quem chamou, atravessando o proxy da hospedagem. */
export async function ipDoPedido(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get("x-forwarded-for");
  return (
    encaminhado?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "desconhecido"
  );
}

/**
 * Registra a tentativa e diz se pode seguir.
 *
 * Falha ABERTA de propósito: se a função do banco não existir (migration
 * ainda não aplicada) ou o banco estiver fora, a gente libera em vez de
 * travar. Travar fechado deixaria o bar sem receber reserva e a equipe
 * sem entrar no painel por causa de um problema de infraestrutura. As
 * outras defesas continuam de pé: honeypot, validação, limite por
 * telefone no banco e o rate limit próprio do Supabase Auth.
 */
export async function verificarFreio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  acao: AcaoFreio,
  chave: string,
): Promise<Freio> {
  const { data, error } = await supabase.rpc("rate_limit_check", {
    p_action: acao,
    p_key: chave,
  });

  if (error) {
    console.warn(`[freio] ${acao} indisponível, liberando:`, error.message);
    return { liberado: true };
  }

  const r = data as RespostaBanco | null;
  if (!r || r.allowed) return { liberado: true };

  return {
    liberado: false,
    travado: Boolean(r.locked),
    esperaSegundos: Number(r.retry_after ?? 600),
  };
}

/**
 * Zera o contador. Só funciona autenticado — a função do banco não é
 * concedida ao anon, senão qualquer um limparia o próprio castigo.
 * Chamar depois de um login bem-sucedido, com o cliente que já tem sessão.
 */
export async function liberarFreio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  acao: AcaoFreio,
  chave: string,
): Promise<void> {
  const { error } = await supabase.rpc("rate_limit_reset", {
    p_action: acao,
    p_key: chave,
  });
  if (error) console.warn(`[freio] não zerou ${acao}:`, error.message);
}

/** "Espere 3 minutos", "Espere 2 horas" — para mostrar para o usuário. */
export function tempoDeEspera(segundos: number): string {
  if (segundos < 90) return "alguns segundos";
  const min = Math.ceil(segundos / 60);
  if (min < 60) return `${min} minuto${min > 1 ? "s" : ""}`;
  const h = Math.round(min / 60);
  return `${h} hora${h > 1 ? "s" : ""}`;
}
