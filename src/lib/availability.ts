import type { AvailabilityTable, DayAvailability } from "@/lib/types";

/**
 * Fim da ocupação de uma mesa: chegada + duração padrão, no máximo até
 * a hora de fechar. Mesma conta que o Postgres faz em create_reservation.
 */
export function fimDaOcupacao(
  inicioIso: string,
  duracaoMinutos: number,
  fechamentoIso?: string,
): number {
  const inicio = Date.parse(inicioIso);
  const fim = inicio + duracaoMinutos * 60_000;
  if (!fechamentoIso) return fim;
  return Math.min(fim, Date.parse(fechamentoIso));
}

/** A mesa está livre no intervalo que essa reserva ocuparia? */
export function mesaLivre(
  mesa: AvailabilityTable,
  slotIso: string,
  duracaoMinutos: number,
  fechamentoIso?: string,
): boolean {
  const inicio = Date.parse(slotIso);
  const fim = fimDaOcupacao(slotIso, duracaoMinutos, fechamentoIso);
  return !mesa.busy.some(
    (b) => Date.parse(b.s) < fim && inicio < Date.parse(b.e),
  );
}

/**
 * Um horário só aparece para o cliente se sobrou pelo menos uma mesa que
 * comporte o grupo. Qual mesa é, o cliente não precisa saber — quem
 * escolhe é o banco, na hora de gravar.
 */
export function slotTemMesa(
  dia: DayAvailability,
  slotIso: string,
  pessoas: number,
): boolean {
  const duracao = dia.duration_minutes ?? 120;
  return dia.tables.some(
    (mesa) =>
      mesa.capacity >= pessoas &&
      mesaLivre(mesa, slotIso, duracao, dia.closes_at),
  );
}

/** Maior grupo que ainda cabe em algum horário do dia. */
export function maiorGrupoDoDia(dia: DayAvailability): number {
  return dia.tables.reduce((maior, m) => Math.max(maior, m.capacity), 0);
}
