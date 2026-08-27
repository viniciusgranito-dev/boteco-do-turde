import { addDays } from "@/lib/format";
import type { BookingConfig } from "@/lib/types";

export type DiaDoCalendario = {
  data: string;
  aberto: boolean;
  label: string | null;
};

/**
 * Monta a lista de dias que aparecem no calendário: da data de hoje
 * até o fim da janela, marcando quais estão fechados. As datas especiais
 * mandam mais que o horário padrão da semana.
 */
export function diasDoCalendario(config: BookingConfig): DiaDoCalendario[] {
  const especiais = new Map(config.special_dates.map((d) => [d.date, d]));
  const semana = new Map(config.weekdays.map((d) => [d.weekday, d]));
  const dias: DiaDoCalendario[] = [];

  for (let i = 0; i <= config.booking_window_days; i++) {
    const data = addDays(config.today, i);
    const [y, m, d] = data.split("-").map(Number);
    const diaDaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    const especial = especiais.get(data);
    const padrao = semana.get(diaDaSemana);

    let aberto = Boolean(padrao?.active);
    if (especial) {
      aberto = !especial.closed;
    }

    dias.push({
      data,
      aberto,
      label: especial?.label ?? null,
    });
  }

  return dias;
}

/** Primeiro dia aberto da lista — é o que o formulário já abre selecionado. */
export function primeiroDiaAberto(dias: DiaDoCalendario[]): string | null {
  return dias.find((d) => d.aberto)?.data ?? null;
}
