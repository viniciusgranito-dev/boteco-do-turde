"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Check,
  Loader2,
  MessageCircle,
  Phone,
  Shuffle,
  StickyNote,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import {
  bloquearTelefone,
  decidirReserva,
  mudarStatus,
  remarcarReserva,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Aviso, Badge, StatusBadge } from "@/components/ui/surface";
import { formatHora, formatTelefone, tempoRestante } from "@/lib/format";
import { linkWhatsapp, preencherTemplate, variaveisDaReserva } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { AdminReservation, BarTable } from "@/lib/types";

type Props = {
  reserva: AdminReservation;
  mesas: BarTable[];
  config: Record<string, string | number>;
  destaque?: boolean;
};

export function CartaoReserva({ reserva, mesas, config, destaque }: Props) {
  const [recusando, setRecusando] = useState(false);
  const [trocandoMesa, setTrocandoMesa] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const mesa = reserva.tables?.number ?? "?";

  const vars = variaveisDaReserva({
    customer_name: reserva.customer_name,
    code: reserva.code,
    starts_at: reserva.starts_at,
    party_size: reserva.party_size,
    table_number: reserva.tables?.number,
  });

  function acao(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? "Não deu certo.");
    });
  }

  const mensagemWhatsapp =
    reserva.status === "recusada"
      ? preencherTemplate(String(config.msg_decline ?? ""), {
          ...vars,
          motivo: reserva.decline_reason ?? "",
        })
      : reserva.status === "confirmada"
        ? preencherTemplate(String(config.msg_confirm ?? ""), vars)
        : preencherTemplate(String(config.msg_reminder ?? ""), vars);

  const telefoneReal = /^\d{10,11}$/.test(reserva.customer_phone);
  const cabeNoGrupo = mesas.filter(
    (m) => m.active && m.capacity >= reserva.party_size,
  );

  return (
    <article
      className={cn(
        "rounded-2xl border bg-madeira p-4",
        destaque ? "border-brasa/60 shadow-[0_0_0_1px_rgba(233,163,60,0.25)]" : "border-linha",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold leading-none text-brasa">
              {formatHora(reserva.starts_at)}
            </span>
            <span className="text-sm font-bold text-giz">Mesa {mesa}</span>
            {reserva.tables && (
              <span className="text-xs text-giz-fraco">
                {reserva.tables.capacity} lugares
              </span>
            )}
          </p>
          <p className="mt-1.5 truncate font-semibold text-giz">
            {reserva.customer_name}
          </p>
          <p className="text-sm text-giz-fraco">
            {reserva.party_size}{" "}
            {reserva.party_size === 1 ? "pessoa" : "pessoas"}
            {telefoneReal && ` · ${formatTelefone(reserva.customer_phone)}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={reserva.status} />
          <span className="font-mono text-[0.65rem] text-giz-fraco">
            {reserva.code}
          </span>
          {reserva.source === "manual" && (
            <Badge className="border-azul/40 bg-azul/10 text-azul">
              <Phone className="size-3" /> na porta
            </Badge>
          )}
        </div>
      </div>

      {reserva.notes && (
        <p className="mt-3 flex gap-2 rounded-lg bg-noite px-3 py-2 text-xs text-giz-fraco">
          <StickyNote className="mt-0.5 size-3.5 shrink-0" />
          {reserva.notes}
        </p>
      )}

      {reserva.status === "pendente" && reserva.expires_at && (
        <p className="mt-3 text-xs font-semibold text-brasa">
          Expira em {tempoRestante(reserva.expires_at)} se ninguém decidir.
        </p>
      )}

      {erro && (
        <Aviso tom="erro" className="mt-3">
          {erro}
        </Aviso>
      )}

      {/* ---- Trocar a mesa que o sistema separou ---- */}
      {trocandoMesa && (
        <div className="mt-3 space-y-2 rounded-xl border border-linha bg-noite p-3">
          <p className="rotulo">Mudar para qual mesa?</p>
          <Select
            defaultValue={reserva.table_id}
            disabled={ocupado}
            onChange={(e) => {
              const novaMesa = e.target.value;
              if (novaMesa === reserva.table_id) return;
              acao(async () => {
                const r = await remarcarReserva(
                  reserva.id,
                  novaMesa,
                  reserva.starts_at,
                );
                if (r.ok) setTrocandoMesa(false);
                return r;
              });
            }}
          >
            {cabeNoGrupo.map((m) => (
              <option key={m.id} value={m.id}>
                Mesa {m.number} · {m.capacity} lugares
              </option>
            ))}
          </Select>
          <Button
            variant="fantasma"
            size="sm"
            full
            onClick={() => setTrocandoMesa(false)}
          >
            Deixar como está
          </Button>
        </div>
      )}

      {/* ---- Aprovar / recusar ---- */}
      {reserva.status === "pendente" && !recusando && (
        <div className="mt-4 flex gap-2">
          <Button
            variant="sucesso"
            size="lg"
            full
            disabled={ocupado}
            onClick={() => acao(() => decidirReserva(reserva.id, true))}
          >
            {ocupado ? <Loader2 className="animate-spin" /> : <Check />}
            Aprovar
          </Button>
          <Button
            variant="perigo"
            size="lg"
            full
            disabled={ocupado}
            onClick={() => setRecusando(true)}
          >
            <X /> Recusar
          </Button>
        </div>
      )}

      {reserva.status === "pendente" && recusando && (
        <div className="mt-4 space-y-2">
          <Input
            placeholder="Motivo (opcional) — vai na mensagem"
            value={motivo}
            maxLength={140}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="perigo"
              full
              disabled={ocupado}
              onClick={() =>
                acao(async () => {
                  const r = await decidirReserva(reserva.id, false, motivo);
                  if (r.ok) setRecusando(false);
                  return r;
                })
              }
            >
              Confirmar recusa
            </Button>
            <Button
              variant="contorno"
              full
              disabled={ocupado}
              onClick={() => setRecusando(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* ---- Ações rápidas ---- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {telefoneReal && (
          <a
            href={linkWhatsapp(reserva.customer_phone, mensagemWhatsapp)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secundario" size="sm">
              <MessageCircle /> WhatsApp
            </Button>
          </a>
        )}

        {["pendente", "confirmada"].includes(reserva.status) &&
          cabeNoGrupo.length > 1 &&
          !trocandoMesa && (
            <Button
              variant="contorno"
              size="sm"
              disabled={ocupado}
              onClick={() => setTrocandoMesa(true)}
            >
              <Shuffle /> Trocar mesa
            </Button>
          )}

        {reserva.status === "confirmada" && (
          <>
            <Button
              variant="contorno"
              size="sm"
              disabled={ocupado}
              onClick={() => acao(() => mudarStatus(reserva.id, "compareceu"))}
            >
              <UserCheck /> Chegou
            </Button>
            <Button
              variant="contorno"
              size="sm"
              disabled={ocupado}
              onClick={() => acao(() => mudarStatus(reserva.id, "no_show"))}
            >
              <UserX /> Não veio
            </Button>
          </>
        )}

        {["pendente", "confirmada"].includes(reserva.status) && (
          <Button
            variant="fantasma"
            size="sm"
            disabled={ocupado}
            onClick={() => acao(() => mudarStatus(reserva.id, "cancelada"))}
          >
            Cancelar
          </Button>
        )}

        {reserva.status === "no_show" && telefoneReal && (
          <Button
            variant="fantasma"
            size="sm"
            disabled={ocupado}
            onClick={() =>
              acao(() =>
                bloquearTelefone(
                  reserva.customer_phone,
                  `No-show em ${formatHora(reserva.starts_at)}`,
                ),
              )
            }
          >
            <Ban /> Bloquear telefone
          </Button>
        )}
      </div>
    </article>
  );
}
