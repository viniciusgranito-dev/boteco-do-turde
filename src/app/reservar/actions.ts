"use server";

import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";
import { chaveDoErro, mensagemDoErro } from "@/lib/errors";
import { nomeValido, somenteDigitos, telefoneValido } from "@/lib/format";
import { ipDoPedido, tempoDeEspera, verificarFreio } from "@/lib/rate-limit";
import type {
  BookingConfig,
  CreatedReservation,
  DayAvailability,
} from "@/lib/types";

export type Resultado<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; chave: string };

export async function buscarConfiguracao(): Promise<BookingConfig> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_booking_config");
  if (error) throw new Error(error.message);
  return data as BookingConfig;
}

export async function buscarDia(
  data: string,
): Promise<Resultado<DayAvailability>> {
  const valido = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(data);
  if (!valido.success) {
    return { ok: false, erro: "Data inválida.", chave: "DATA_INVALIDA" };
  }

  const supabase = createPublicClient();
  const { data: dia, error } = await supabase.rpc("get_day_availability", {
    p_date: data,
  });

  if (error) {
    return { ok: false, erro: mensagemDoErro(error), chave: chaveDoErro(error) };
  }
  return { ok: true, dados: dia as DayAvailability };
}

const esquemaReserva = z.object({
  starts_at: z.string().min(10),
  nome: z.string().min(3).max(120),
  telefone: z.string().min(10).max(20),
  pessoas: z.coerce.number().int().min(1).max(40),
  observacao: z.string().max(300).optional().default(""),
  /** Honeypot: gente não enxerga, robô preenche. */
  sobrenome_do_meio: z.string().optional().default(""),
});

export async function criarReserva(
  entrada: z.input<typeof esquemaReserva>,
): Promise<Resultado<CreatedReservation>> {
  const analisado = esquemaReserva.safeParse(entrada);
  if (!analisado.success) {
    return {
      ok: false,
      erro: "Confira os dados preenchidos.",
      chave: "DADOS_INVALIDOS",
    };
  }
  const v = analisado.data;

  // Honeypot primeiro: é de graça e não gasta ida ao banco com robô.
  if (v.sobrenome_do_meio.trim() !== "") {
    return { ok: false, erro: mensagemDoErro("SPAM"), chave: "SPAM" };
  }

  const supabase = createPublicClient();

  // Freio antes das validações, para que tentativa com dado inválido
  // também conte — senão dava para martelar de graça mandando lixo.
  const freio = await verificarFreio(supabase, "reserva_ip", await ipDoPedido());
  if (!freio.liberado) {
    return {
      ok: false,
      erro: `Muitas tentativas seguidas. Espere ${tempoDeEspera(
        freio.esperaSegundos,
      )} e tente de novo.`,
      chave: "MUITAS_TENTATIVAS",
    };
  }

  if (!nomeValido(v.nome)) {
    return {
      ok: false,
      erro: mensagemDoErro("NOME_INVALIDO"),
      chave: "NOME_INVALIDO",
    };
  }
  if (!telefoneValido(v.telefone)) {
    return {
      ok: false,
      erro: mensagemDoErro("TELEFONE_INVALIDO"),
      chave: "TELEFONE_INVALIDO",
    };
  }

  // A mesa não vai aqui: quem escolhe é o banco, em create_reservation.
  const { data, error } = await supabase.rpc("create_reservation", {
    p_starts_at: v.starts_at,
    p_name: v.nome.trim().replace(/\s+/g, " "),
    p_phone: somenteDigitos(v.telefone),
    p_party_size: v.pessoas,
    p_notes: v.observacao?.trim() || null,
    p_hp: null,
  });

  if (error) {
    return { ok: false, erro: mensagemDoErro(error), chave: chaveDoErro(error) };
  }
  return { ok: true, dados: data as CreatedReservation };
}
