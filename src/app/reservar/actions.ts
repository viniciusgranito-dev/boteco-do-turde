"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";
import { chaveDoErro, mensagemDoErro } from "@/lib/errors";
import { nomeValido, somenteDigitos, telefoneValido } from "@/lib/format";
import type {
  BookingConfig,
  CreatedReservation,
  DayAvailability,
} from "@/lib/types";

export type Resultado<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; chave: string };

/**
 * Freio por IP, melhor-esforço: vale por instância do servidor, então
 * serve só para conter enxurrada boba. O limite que realmente segura
 * é o por telefone, que mora no banco (max_active_per_phone).
 */
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_IP = 8;
const porIp = new Map<string, number[]>();

async function ipDoPedido(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get("x-forwarded-for");
  return (
    encaminhado?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "desconhecido"
  );
}

function passouNoFreio(ip: string): boolean {
  const agora = Date.now();
  const anteriores = (porIp.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  if (anteriores.length >= MAX_POR_IP) {
    porIp.set(ip, anteriores);
    return false;
  }
  anteriores.push(agora);
  porIp.set(ip, anteriores);
  // Limpeza preguiçosa para o mapa não crescer sem fim.
  if (porIp.size > 5000) {
    for (const [chave, marcas] of porIp) {
      if (marcas.every((t) => agora - t >= JANELA_MS)) porIp.delete(chave);
    }
  }
  return true;
}

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

  if (v.sobrenome_do_meio.trim() !== "") {
    return { ok: false, erro: mensagemDoErro("SPAM"), chave: "SPAM" };
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

  if (!passouNoFreio(await ipDoPedido())) {
    return {
      ok: false,
      erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
      chave: "MUITAS_TENTATIVAS",
    };
  }

  const supabase = createPublicClient();
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
