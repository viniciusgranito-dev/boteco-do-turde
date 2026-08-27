"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Inbox, Users } from "lucide-react";
import { CartaoReserva } from "./cartao-reserva";
import { LinhaDoTempo } from "./linha-do-tempo";
import { NovaReserva } from "./nova-reserva";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import {
  addDays,
  capitalizar,
  formatDataLonga,
  formatHora,
  fromYmd,
} from "@/lib/format";
import { hoje } from "@/lib/dia";
import type { AdminReservation, BarTable } from "@/lib/types";

type Janela = {
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  label: string | null;
};

const OCUPA = new Set(["pendente", "confirmada", "compareceu"]);

export function Painel({
  dia,
  janela,
  reservas,
  pendentes,
  mesas,
  config,
}: {
  dia: string;
  janela: Janela | null;
  reservas: AdminReservation[];
  pendentes: AdminReservation[];
  mesas: BarTable[];
  config: Record<string, string | number>;
}) {
  const router = useRouter();

  // Duas pessoas podem estar com o painel aberto ao mesmo tempo:
  // qualquer mudança em reservas recarrega os dados na hora.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("reservas-painel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  function irPara(data: string) {
    router.push(`/admin?data=${data}`);
  }

  const ativas = reservas.filter((r) => OCUPA.has(r.status));
  const pessoas = ativas.reduce((soma, r) => soma + r.party_size, 0);
  const mesasAtivas = mesas.filter((m) => m.active).length;

  const ocupacaoPorHora = useMemo(() => {
    if (!janela?.opens_at || !janela.closes_at) return [];
    const inicio = Date.parse(janela.opens_at);
    const fim = Date.parse(janela.closes_at);
    const faixas: { hora: string; ocupadas: number }[] = [];

    for (let t = inicio; t < fim; t += 3_600_000) {
      const proximo = t + 3_600_000;
      const ocupadas = new Set(
        ativas
          .filter(
            (r) =>
              Date.parse(r.starts_at) < proximo && t < Date.parse(r.ends_at),
          )
          .map((r) => r.table_id),
      ).size;
      faixas.push({ hora: formatHora(new Date(t)), ocupadas });
    }
    return faixas;
  }, [ativas, janela]);

  const pendentesDeOutrosDias = pendentes.filter(
    (p) => !reservas.some((r) => r.id === p.id),
  );

  return (
    <div className="space-y-6">
      {/* ---- Navegação de data ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="contorno"
          size="icone"
          aria-label="Dia anterior"
          onClick={() => irPara(addDays(dia, -1))}
        >
          <ChevronLeft />
        </Button>
        <Input
          type="date"
          value={dia}
          onChange={(e) => e.target.value && irPara(e.target.value)}
          className="h-10 w-auto flex-1 min-w-[9.5rem]"
          aria-label="Escolher data"
        />
        <Button
          variant="contorno"
          size="icone"
          aria-label="Próximo dia"
          onClick={() => irPara(addDays(dia, 1))}
        >
          <ChevronRight />
        </Button>
        {dia !== hoje() && (
          <Button variant="fantasma" size="sm" onClick={() => irPara(hoje())}>
            Hoje
          </Button>
        )}
      </div>

      <div>
        <h1 className="display text-2xl">
          {capitalizar(formatDataLonga(fromYmd(dia)))}
        </h1>
        <p className="mt-1 text-sm text-giz-fraco">
          {janela?.is_open
            ? `${ativas.length} ${ativas.length === 1 ? "reserva" : "reservas"} · ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"} esperadas`
            : "Bar fechado neste dia"}
          {janela?.label ? ` · ${janela.label}` : ""}
        </p>
      </div>

      {/* ---- Fila de pendentes ---- */}
      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-brasa">
            <Inbox className="size-5" />
            Esperando sua resposta ({pendentes.length})
          </h2>
          {pendentes
            .filter((p) => reservas.some((r) => r.id === p.id))
            .map((r) => (
              <CartaoReserva key={r.id} reserva={r} mesas={mesas} config={config} destaque />
            ))}

          {pendentesDeOutrosDias.length > 0 && (
            <>
              <p className="rotulo pt-2">De outros dias</p>
              {pendentesDeOutrosDias.map((r) => (
                <CartaoReserva key={r.id} reserva={r} mesas={mesas} config={config} destaque />
              ))}
            </>
          )}
        </section>
      )}

      {/* ---- Ocupação ---- */}
      {janela?.is_open && ocupacaoPorHora.length > 0 && (
        <Card>
          <CardBody>
            <p className="rotulo mb-3 flex items-center gap-2">
              <Users className="size-3.5" /> Ocupação por horário
            </p>
            <div className="rolagem-x flex gap-2 pb-1">
              {ocupacaoPorHora.map((f) => (
                <div
                  key={f.hora}
                  className="flex min-w-[3.75rem] flex-col items-center gap-1 rounded-lg border border-linha bg-noite px-2 py-2"
                >
                  <span className="text-[0.65rem] font-bold text-giz-fraco">
                    {f.hora}
                  </span>
                  <span className="text-lg font-extrabold leading-none text-giz">
                    {f.ocupadas}
                  </span>
                  <span className="text-[0.6rem] text-giz-fraco">
                    de {mesasAtivas}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ---- Linha do tempo ---- */}
      {janela?.is_open && janela.opens_at && janela.closes_at && (
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold text-giz">Mapa do dia</h2>
          <LinhaDoTempo
            abre={janela.opens_at}
            fecha={janela.closes_at}
            mesas={mesas}
            reservas={reservas}
          />
        </section>
      )}

      {/* ---- Lista completa ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-giz">Reservas do dia</h2>
          <NovaReserva mesas={mesas} dia={dia} />
        </div>

        {reservas.length === 0 ? (
          <Aviso tom="neutro">
            Nenhuma reserva para este dia ainda.
          </Aviso>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {reservas.map((r) => (
              <CartaoReserva key={r.id} reserva={r} mesas={mesas} config={config} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
