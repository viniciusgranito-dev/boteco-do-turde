"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  Copy,
  Hourglass,
  MessageCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import { capitalizar, formatDataLonga, formatHora } from "@/lib/format";
import { linkCompartilhar } from "@/lib/whatsapp";
import type { BookingConfig, CreatedReservation } from "@/lib/types";

export function Sucesso({
  reserva,
  config,
}: {
  reserva: CreatedReservation;
  config: BookingConfig;
}) {
  const [origem, setOrigem] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setOrigem(
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
        window.location.origin,
    );
  }, []);

  const linkPessoal = `${origem}/reserva/${reserva.manage_token}`;

  const resumo = [
    `Meu pedido de reserva no ${config.bar_name}:`,
    `📅 ${capitalizar(formatDataLonga(reserva.starts_at))} às ${formatHora(reserva.starts_at)}`,
    `👥 ${reserva.party_size} ${reserva.party_size === 1 ? "pessoa" : "pessoas"}`,
    `🔖 Código ${reserva.code}`,
    "",
    "⏳ Aguardando a confirmação do bar.",
    `Acompanhar: ${linkPessoal}`,
  ].join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkPessoal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 pb-16 pt-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-brasa/15 text-brasa">
          <Hourglass className="size-8" />
        </div>

        <h1 className="display text-3xl">Pedido enviado!</h1>
        <p className="mt-2 text-sm text-giz-fraco">
          Sua mesa ainda <strong className="text-giz">não está garantida</strong>
          . O bar vai confirmar no seu WhatsApp em até{" "}
          {reserva.pending_hold_hours} horas — até lá, seguramos o lugar para
          você.
        </p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between border-b border-linha pb-3">
            <span className="rotulo">Código</span>
            <span className="text-xl font-extrabold tracking-wider text-brasa">
              {reserva.code}
            </span>
          </div>

          <p className="flex items-center gap-2.5 text-sm">
            <CalendarDays className="size-4 text-brasa" />
            {capitalizar(formatDataLonga(reserva.starts_at))}
          </p>
          <p className="flex items-center gap-2.5 text-sm">
            <Clock className="size-4 text-brasa" />
            Chegada às {formatHora(reserva.starts_at)}
          </p>
          <p className="flex items-center gap-2.5 text-sm">
            <Users className="size-4 text-brasa" />
            {reserva.party_size}{" "}
            {reserva.party_size === 1 ? "pessoa" : "pessoas"} · em nome de{" "}
            {reserva.customer_name}
          </p>
        </CardBody>
      </Card>

      <a href={linkCompartilhar(resumo)} target="_blank" rel="noopener noreferrer">
        <Button size="lg" full>
          <MessageCircle /> Salvar no WhatsApp
        </Button>
      </a>

      <Card>
        <CardBody className="space-y-3">
          <p className="rotulo">Seu link de acompanhamento</p>
          <p className="break-all rounded-lg bg-noite px-3 py-2 text-xs text-giz-fraco">
            {linkPessoal || "…"}
          </p>
          <p className="text-xs text-giz-fraco">
            Guarde este link. É por ele que você vê se a reserva foi confirmada e
            cancela se precisar.
          </p>
          <div className="flex gap-2">
            <Button variant="secundario" full onClick={copiar}>
              <Copy /> {copiado ? "Copiado!" : "Copiar link"}
            </Button>
            <a href={linkPessoal} className="flex-1">
              <Button variant="contorno" full>
                Abrir
              </Button>
            </a>
          </div>
        </CardBody>
      </Card>

      {config.rules_text && <Aviso tom="neutro">{config.rules_text}</Aviso>}

      <p className="text-center text-sm text-giz-fraco">
        Precisa mudar alguma coisa?{" "}
        {config.bar_phone ? (
          <a
            className="font-semibold text-brasa underline"
            href={`https://wa.me/${config.bar_phone}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chame o bar no WhatsApp
          </a>
        ) : (
          "Fale com o bar."
        )}
      </p>
    </div>
  );
}
