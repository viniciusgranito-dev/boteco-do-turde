import Link from "next/link";
import { CalendarCheck, Clock, MapPin, MessageCircle } from "lucide-react";
import { buscarConfiguracao } from "./reservar/actions";
import { Button } from "@/components/ui/button";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import type { BookingConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function hhmm(valor: string) {
  return valor?.slice(0, 5) ?? "";
}

export default async function Home() {
  let config: BookingConfig | null = null;
  try {
    config = await buscarConfiguracao();
  } catch {
    config = null;
  }

  const nome = config?.bar_name ?? "Boteco do Turde";

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-14">
      <section className="text-center">
        <p className="rotulo">{config?.bar_address || "Pederneiras · SP"}</p>
        <h1 className="display mt-3 text-[2.75rem] text-giz">{nome}</h1>
        <p className="mx-auto mt-4 max-w-sm text-giz-fraco">
          Chega de perder mesa no fim de semana. Reserve a sua em menos de um
          minuto — sem cadastro, sem senha, sem ficar esperando resposta.
        </p>

        <Link href="/reservar" className="mt-8 block">
          <Button size="lg" full>
            <CalendarCheck /> Reservar minha mesa
          </Button>
        </Link>
      </section>

      {!config && (
        <Aviso tom="erro" className="mt-8">
          O sistema de reservas está fora do ar no momento. Chame o bar no
          WhatsApp, por favor.
        </Aviso>
      )}

      {config && (
        <>
          <Card className="mt-10">
            <CardBody>
              <p className="rotulo mb-3 flex items-center gap-2">
                <Clock className="size-3.5" /> Horário de funcionamento
              </p>
              <dl className="space-y-1.5 text-sm">
                {[...config.weekdays]
                  .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
                  .map((d) => (
                    <div
                      key={d.weekday}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <dt className="text-giz-fraco">{DIAS[d.weekday]}</dt>
                      <dd
                        className={
                          d.active
                            ? "font-semibold text-giz"
                            : "font-semibold text-giz-fraco/60"
                        }
                      >
                        {d.active
                          ? `${hhmm(d.opens_at)} – ${hhmm(d.closes_at)}`
                          : "Fechado"}
                      </dd>
                    </div>
                  ))}
              </dl>
            </CardBody>
          </Card>

          {config.special_dates.filter((d) => !d.closed).length > 0 && (
            <Card className="mt-4 border-brasa/40">
              <CardBody>
                <p className="rotulo mb-3">Vem aí</p>
                <ul className="space-y-1.5 text-sm">
                  {config.special_dates
                    .filter((d) => !d.closed)
                    .map((d) => (
                      <li key={d.date} className="flex justify-between gap-4">
                        <span className="text-giz">{d.label}</span>
                        <span className="shrink-0 text-giz-fraco">
                          {d.date.split("-").reverse().slice(0, 2).join("/")}
                        </span>
                      </li>
                    ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {config.rules_text && (
            <Aviso tom="neutro" className="mt-4">
              {config.rules_text}
            </Aviso>
          )}

          <div className="mt-8 space-y-2 text-center text-sm">
            {config.bar_address && (
              <p className="flex items-center justify-center gap-2 text-giz-fraco">
                <MapPin className="size-4" /> {config.bar_address}
              </p>
            )}
            {config.bar_phone && (
              <a
                href={`https://wa.me/${config.bar_phone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-brasa underline"
              >
                <MessageCircle className="size-4" /> Falar com o bar no WhatsApp
              </a>
            )}
          </div>
        </>
      )}

      <p className="mt-12 text-center text-xs text-giz-fraco/50">
        <Link href="/admin" className="hover:text-giz-fraco">
          Área da equipe
        </Link>
      </p>
    </main>
  );
}
