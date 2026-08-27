import { TZ, addDays } from "@/lib/format";

/**
 * Diferença, em minutos, entre o fuso do bar e o UTC num dado instante.
 * Feito com Intl para não depender de biblioteca de fuso horário.
 */
export function offsetMinutos(instante: Date, tz: string = TZ): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const partes = Object.fromEntries(
    dtf.formatToParts(instante).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );

  return (comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60000;
}

/** Instante exato da meia-noite daquele dia no fuso do bar. */
export function inicioDoDia(data: string, tz: string = TZ): Date {
  const [y, m, d] = data.split("-").map(Number);
  const palpite = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = offsetMinutos(new Date(palpite), tz);
  return new Date(palpite - offset * 60_000);
}

/** Meia-noite do dia seguinte — o fim exclusivo da faixa do dia. */
export function fimDoDia(data: string, tz: string = TZ): Date {
  return inicioDoDia(addDays(data, 1), tz);
}

/** Junta "2026-08-29" + "19:30" num instante no fuso do bar. */
export function instanteLocal(
  data: string,
  hora: string,
  tz: string = TZ,
): Date {
  const [h, min] = hora.split(":").map(Number);
  const base = inicioDoDia(data, tz);
  return new Date(base.getTime() + ((h ?? 0) * 60 + (min ?? 0)) * 60_000);
}

/** Hoje, no fuso do bar, no formato YYYY-MM-DD. */
export function hoje(tz: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
