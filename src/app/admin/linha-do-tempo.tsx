"use client";

import { formatHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminReservation, BarTable } from "@/lib/types";

const PX_POR_HORA = 92;
const OCUPA = new Set(["pendente", "confirmada", "compareceu"]);

export function LinhaDoTempo({
  abre,
  fecha,
  mesas,
  reservas,
}: {
  abre: string;
  fecha: string;
  mesas: BarTable[];
  reservas: AdminReservation[];
}) {
  const inicio = Date.parse(abre);
  const fim = Date.parse(fecha);
  const horas = Math.max(1, (fim - inicio) / 3_600_000);
  const largura = horas * PX_POR_HORA;

  const marcas: number[] = [];
  for (let t = inicio; t <= fim; t += 3_600_000) marcas.push(t);

  const ativas = mesas.filter((m) => m.active);
  const porMesa = new Map<string, AdminReservation[]>();
  for (const r of reservas) {
    if (!OCUPA.has(r.status)) continue;
    const lista = porMesa.get(r.table_id) ?? [];
    lista.push(r);
    porMesa.set(r.table_id, lista);
  }

  return (
    <div className="rolagem-x rounded-2xl border border-linha bg-madeira">
      <div style={{ minWidth: largura + 64 }}>
        {/* Régua de horas */}
        <div className="flex border-b border-linha">
          <div className="w-16 shrink-0 border-r border-linha px-2 py-1.5">
            <span className="rotulo">Mesa</span>
          </div>
          <div className="relative h-8 flex-1">
            {marcas.map((t) => (
              <span
                key={t}
                className="absolute top-1.5 -translate-x-1/2 text-[0.65rem] font-bold text-giz-fraco"
                style={{ left: ((t - inicio) / 3_600_000) * PX_POR_HORA }}
              >
                {formatHora(new Date(t))}
              </span>
            ))}
          </div>
        </div>

        {/* Uma linha por mesa */}
        {ativas.map((mesa, i) => {
          const doDia = porMesa.get(mesa.id) ?? [];
          return (
            <div
              key={mesa.id}
              className={cn(
                "flex border-b border-linha/60 last:border-b-0",
                i % 2 === 1 && "bg-noite/30",
              )}
            >
              <div className="flex w-16 shrink-0 flex-col justify-center border-r border-linha px-2 py-2">
                <span className="text-sm font-extrabold leading-none text-giz">
                  {mesa.number}
                </span>
                <span className="text-[0.6rem] text-giz-fraco">
                  até {mesa.capacity}
                </span>
              </div>

              <div className="relative h-12 flex-1">
                {marcas.map((t) => (
                  <span
                    key={t}
                    className="absolute inset-y-0 w-px bg-linha/50"
                    style={{ left: ((t - inicio) / 3_600_000) * PX_POR_HORA }}
                  />
                ))}

                {doDia.map((r) => {
                  const s = Math.max(Date.parse(r.starts_at), inicio);
                  const e = Math.min(Date.parse(r.ends_at), fim);
                  if (e <= s) return null;

                  return (
                    <div
                      key={r.id}
                      title={`${r.customer_name} · ${r.party_size}p · ${formatHora(r.starts_at)}`}
                      className={cn(
                        "absolute inset-y-1.5 flex items-center overflow-hidden rounded-lg border px-2 text-[0.7rem] font-bold",
                        r.status === "pendente"
                          ? "border-brasa/60 bg-brasa/20 text-brasa"
                          : r.status === "compareceu"
                            ? "border-azul/50 bg-azul/20 text-azul"
                            : "border-verde/50 bg-verde/20 text-verde",
                      )}
                      style={{
                        left: ((s - inicio) / 3_600_000) * PX_POR_HORA,
                        width: Math.max(
                          28,
                          ((e - s) / 3_600_000) * PX_POR_HORA - 4,
                        ),
                      }}
                    >
                      <span className="truncate">
                        {r.customer_name.split(" ")[0]} · {r.party_size}p
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {ativas.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-giz-fraco">
            Nenhuma mesa cadastrada ainda.
          </p>
        )}
      </div>
    </div>
  );
}
