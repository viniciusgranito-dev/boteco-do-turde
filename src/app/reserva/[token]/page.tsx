import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MessageCircle, Users } from "lucide-react";
import { BotaoCancelar } from "./cancelar";
import { buscarConfiguracao } from "@/app/reservar/actions";
import { createPublicClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Aviso,
  Card,
  CardBody,
  StatusBadge,
} from "@/components/ui/surface";
import { capitalizar, formatDataLonga, formatHora, tempoRestante } from "@/lib/format";
import type { ReservationView } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReservaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_reservation", {
    p_token: token,
  });

  if (error || !data) notFound();
  const reserva = data as ReservationView;

  const config = await buscarConfiguracao().catch(() => null);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pb-16 pt-10">
      <div className="text-center">
        <p className="rotulo">{config?.bar_name ?? "Boteco do Turde"}</p>
        <h1 className="display mt-2 text-3xl">Sua reserva</h1>
        <div className="mt-4 flex justify-center">
          <StatusBadge status={reserva.status} />
        </div>
      </div>

      {reserva.status === "pendente" && reserva.expires_at && (
        <Aviso tom="alerta">
          Ainda <strong>não está confirmada</strong>. Seguramos o lugar por mais{" "}
          <strong>{tempoRestante(reserva.expires_at)}</strong> enquanto o bar
          responde no seu WhatsApp.
        </Aviso>
      )}

      {reserva.status === "confirmada" && (
        <Aviso tom="ok">
          Tudo certo, o bar confirmou. É só chegar no horário.
        </Aviso>
      )}

      {reserva.status === "recusada" && (
        <Aviso tom="erro">
          O bar não conseguiu atender essa reserva.
          {reserva.decline_reason ? ` Motivo: ${reserva.decline_reason}` : ""}
        </Aviso>
      )}

      {reserva.status === "expirada" && (
        <Aviso tom="neutro">
          O prazo de aprovação passou e a mesa foi liberada. Faça uma nova
          reserva ou chame o bar no WhatsApp.
        </Aviso>
      )}

      {reserva.status === "cancelada" && (
        <Aviso tom="neutro">
          Esta reserva foi cancelada. Se mudou de ideia, é só reservar de novo.
        </Aviso>
      )}

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

          {reserva.notes && (
            <p className="rounded-lg bg-noite px-3 py-2 text-xs text-giz-fraco">
              Observação: {reserva.notes}
            </p>
          )}
        </CardBody>
      </Card>

      {reserva.can_cancel && <BotaoCancelar token={token} />}

      {!reserva.can_cancel && (
        <Link href="/reservar" className="block">
          <Button variant="secundario" full>
            Fazer uma nova reserva
          </Button>
        </Link>
      )}

      {config?.rules_text && <Aviso tom="neutro">{config.rules_text}</Aviso>}

      {config?.bar_phone && (
        <p className="text-center text-sm">
          <a
            href={`https://wa.me/${config.bar_phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-semibold text-brasa underline"
          >
            <MessageCircle className="size-4" /> Falar com o bar
          </a>
        </p>
      )}
    </main>
  );
}
