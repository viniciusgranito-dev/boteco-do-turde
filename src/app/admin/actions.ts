"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mensagemDoErro } from "@/lib/errors";
import { somenteDigitos } from "@/lib/format";
import type { ReservationStatus } from "@/lib/types";

export type Retorno = { ok: boolean; erro?: string };

async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  return { supabase, user };
}

function atualizarPainel() {
  revalidatePath("/admin");
  revalidatePath("/admin/mesas");
  revalidatePath("/admin/horarios");
  revalidatePath("/admin/configuracoes");
}

async function lerNumero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chave: string,
  padrao: number,
): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", chave)
    .maybeSingle();
  const valor = Number(data?.value);
  return Number.isFinite(valor) ? valor : padrao;
}

// ---------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------
export async function entrar(
  _estadoAnterior: Retorno | null,
  formData: FormData,
): Promise<Retorno> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { ok: false, erro: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return { ok: false, erro: "E-mail ou senha incorretos." };
  }

  redirect("/admin");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------
export async function decidirReserva(
  id: string,
  aprovar: boolean,
  motivo?: string,
): Promise<Retorno> {
  const { supabase, user } = await exigirSessao();

  const { error } = await supabase
    .from("reservations")
    .update({
      status: aprovar ? "confirmada" : "recusada",
      decline_reason: aprovar ? null : (motivo?.trim() || null),
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", id)
    .eq("status", "pendente");

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

export async function mudarStatus(
  id: string,
  status: ReservationStatus,
): Promise<Retorno> {
  const { supabase, user } = await exigirSessao();

  const { error } = await supabase
    .from("reservations")
    .update({
      status,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", id);

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

export async function remarcarReserva(
  id: string,
  tableId: string,
  startsAt: string,
): Promise<Retorno> {
  const { supabase } = await exigirSessao();
  const duracao = await lerNumero(supabase, "reservation_duration_minutes", 120);

  const inicio = new Date(startsAt);
  const fim = new Date(inicio.getTime() + duracao * 60_000);

  const { error } = await supabase
    .from("reservations")
    .update({
      table_id: tableId,
      starts_at: inicio.toISOString(),
      ends_at: fim.toISOString(),
    })
    .eq("id", id);

  if (error) {
    // 23P01 = exclusion_violation: a mesa já está ocupada nesse intervalo.
    if (error.code === "23P01") {
      return { ok: false, erro: "Essa mesa já está ocupada nesse horário." };
    }
    return { ok: false, erro: mensagemDoErro(error) };
  }
  atualizarPainel();
  return { ok: true };
}

export async function criarReservaManual(formData: FormData): Promise<Retorno> {
  const { supabase } = await exigirSessao();

  const tableId = String(formData.get("table_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const telefone = somenteDigitos(String(formData.get("telefone") ?? ""));
  const pessoas = Number(formData.get("pessoas") ?? 0);
  const data = String(formData.get("data") ?? "");
  const hora = String(formData.get("hora") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!tableId || !nome || !data || !hora || pessoas < 1) {
    return { ok: false, erro: "Preencha mesa, nome, data, hora e pessoas." };
  }
  if (telefone && !/^\d{10,11}$/.test(telefone)) {
    return { ok: false, erro: "Telefone precisa ter DDD + número." };
  }

  const duracao = await lerNumero(supabase, "reservation_duration_minutes", 120);

  // O input datetime local do painel já está no fuso do bar (o navegador
  // do bar roda em America/Sao_Paulo); o Postgres normaliza na gravação.
  const inicio = new Date(`${data}T${hora}:00`);
  if (Number.isNaN(inicio.getTime())) {
    return { ok: false, erro: "Data ou hora inválida." };
  }
  const fim = new Date(inicio.getTime() + duracao * 60_000);

  const { error } = await supabase.from("reservations").insert({
    table_id: tableId,
    customer_name: nome,
    customer_phone: telefone || "00000000000",
    party_size: pessoas,
    starts_at: inicio.toISOString(),
    ends_at: fim.toISOString(),
    status: "confirmada",
    notes: observacao || null,
    source: "manual",
  });

  if (error) {
    if (error.code === "23P01") {
      return { ok: false, erro: "Essa mesa já está ocupada nesse horário." };
    }
    return { ok: false, erro: mensagemDoErro(error) };
  }
  atualizarPainel();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------
export async function salvarMesa(formData: FormData): Promise<Retorno> {
  const { supabase } = await exigirSessao();

  const id = String(formData.get("id") ?? "");
  const registro = {
    number: Number(formData.get("number") ?? 0),
    capacity: Number(formData.get("capacity") ?? 0),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    sort_order: Number(formData.get("sort_order") ?? 0),
  };

  if (registro.number < 1 || registro.capacity < 1) {
    return { ok: false, erro: "Número e capacidade precisam ser maiores que zero." };
  }

  const { error } = id
    ? await supabase.from("tables").update(registro).eq("id", id)
    : await supabase.from("tables").insert(registro);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: `Já existe a mesa ${registro.number}.` };
    }
    return { ok: false, erro: mensagemDoErro(error) };
  }
  atualizarPainel();
  return { ok: true };
}

export async function alternarMesa(id: string, ativa: boolean): Promise<Retorno> {
  const { supabase } = await exigirSessao();
  const { error } = await supabase
    .from("tables")
    .update({ active: ativa })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Horários e datas especiais
// ---------------------------------------------------------------------
export async function salvarHorario(formData: FormData): Promise<Retorno> {
  const { supabase } = await exigirSessao();

  const weekday = Number(formData.get("weekday"));
  const registro = {
    weekday,
    opens_at: String(formData.get("opens_at") ?? "17:30"),
    closes_at: String(formData.get("closes_at") ?? "22:30"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };

  const { error } = await supabase
    .from("opening_hours")
    .upsert(registro, { onConflict: "weekday" });

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

export async function salvarDataEspecial(formData: FormData): Promise<Retorno> {
  const { supabase } = await exigirSessao();

  const fechado = formData.get("closed") === "on" || formData.get("closed") === "true";
  const abre = String(formData.get("opens_at") ?? "");
  const fecha = String(formData.get("closes_at") ?? "");

  const registro = {
    date: String(formData.get("date") ?? ""),
    label: String(formData.get("label") ?? "").trim(),
    closed: fechado,
    opens_at: !fechado && abre ? abre : null,
    closes_at: !fechado && fecha ? fecha : null,
  };

  if (!registro.date || !registro.label) {
    return { ok: false, erro: "Informe a data e um nome para ela." };
  }
  if (!fechado && Boolean(abre) !== Boolean(fecha)) {
    return {
      ok: false,
      erro: "Preencha os dois horários ou deixe os dois em branco.",
    };
  }

  const { error } = await supabase
    .from("special_dates")
    .upsert(registro, { onConflict: "date" });

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

export async function apagarDataEspecial(id: string): Promise<Retorno> {
  const { supabase } = await exigirSessao();
  const { error } = await supabase.from("special_dates").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------
export async function salvarConfiguracoes(formData: FormData): Promise<Retorno> {
  const { supabase } = await exigirSessao();

  const numericas = [
    "pending_hold_hours",
    "reservation_duration_minutes",
    "slot_minutes",
    "last_slot_offset_minutes",
    "min_lead_minutes",
    "booking_window_days",
    "max_party_size",
    "max_active_per_phone",
  ];
  const textuais = [
    "bar_name",
    "bar_address",
    "bar_phone",
    "bar_instagram",
    "rules_text",
    "last_slot_time",
    "msg_confirm",
    "msg_decline",
    "msg_reminder",
  ];

  const linhas: { key: string; value: unknown }[] = [];

  for (const chave of numericas) {
    const bruto = formData.get(chave);
    if (bruto === null) continue;
    const n = Number(bruto);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, erro: `Valor inválido em "${chave}".` };
    }
    linhas.push({ key: chave, value: n });
  }

  for (const chave of textuais) {
    const bruto = formData.get(chave);
    if (bruto === null) continue;
    let texto = String(bruto);
    if (chave === "bar_phone") texto = somenteDigitos(texto);
    if (chave === "last_slot_time") {
      texto = texto.trim();
      // Vazio = sem teto de horário. Qualquer outra coisa precisa ser HH:MM,
      // senão o banco estoura ao converter para `time`.
      if (texto !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(texto)) {
        return {
          ok: false,
          erro: "O último horário precisa estar no formato HH:MM (ex.: 20:00) ou ficar em branco.",
        };
      }
    }
    linhas.push({ key: chave, value: texto });
  }

  const { error } = await supabase
    .from("settings")
    .upsert(linhas, { onConflict: "key" });

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Telefones bloqueados
// ---------------------------------------------------------------------
export async function bloquearTelefone(
  telefone: string,
  motivo: string,
): Promise<Retorno> {
  const { supabase, user } = await exigirSessao();
  const limpo = somenteDigitos(telefone);
  if (!/^\d{10,11}$/.test(limpo)) {
    return { ok: false, erro: "Telefone inválido." };
  }

  const { error } = await supabase.from("blocked_phones").upsert({
    phone: limpo,
    reason: motivo?.trim() || null,
    created_by: user.id,
  });

  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}

export async function desbloquearTelefone(telefone: string): Promise<Retorno> {
  const { supabase } = await exigirSessao();
  const { error } = await supabase
    .from("blocked_phones")
    .delete()
    .eq("phone", somenteDigitos(telefone));
  if (error) return { ok: false, erro: mensagemDoErro(error) };
  atualizarPainel();
  return { ok: true };
}
