export const TZ = "America/Sao_Paulo";

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const fmtDataLonga = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
});

const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
});

const fmtISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "19:30" */
export function formatHora(value: string | Date): string {
  return fmtHora.format(toDate(value));
}

/** "sábado, 29 de agosto" */
export function formatDataLonga(value: string | Date): string {
  return fmtDataLonga.format(toDate(value));
}

/** "29/08" */
export function formatDataCurta(value: string | Date): string {
  return fmtDataCurta.format(toDate(value));
}

/** "sáb." */
export function formatDiaSemana(value: string | Date): string {
  return fmtDiaSemana.format(toDate(value)).replace(".", "");
}

/** Data no formato YYYY-MM-DD já no fuso do bar. */
export function ymd(value: string | Date): string {
  return fmtISO.format(toDate(value));
}

/** Converte "2026-08-29" em um Date ao meio-dia, seguro contra virada de fuso. */
export function fromYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
}

/** Soma dias em cima de uma data YYYY-MM-DD, devolvendo YYYY-MM-DD. */
export function addDays(value: string, days: number): string {
  const d = fromYmd(value);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

/** "sábado, 29 de agosto às 19:30" */
export function formatDataHora(value: string | Date): string {
  return `${formatDataLonga(value)} às ${formatHora(value)}`;
}

/** Guarda só dígitos: "(14) 99123-4567" -> "14991234567" */
export function somenteDigitos(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** "14991234567" -> "(14) 99123-4567" */
export function formatTelefone(value: string): string {
  const d = somenteDigitos(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function telefoneValido(value: string): boolean {
  const d = somenteDigitos(value);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  // Celular no Brasil tem 11 dígitos e começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

/** Nome precisa ter ao menos duas palavras — evita "Jo" e "asdf". */
export function nomeValido(value: string): boolean {
  const limpo = (value ?? "").trim().replace(/\s+/g, " ");
  return limpo.length >= 3 && limpo.includes(" ");
}

/** Telefone no formato que o wa.me espera: 55 + DDD + número. */
export function telefoneWhatsapp(value: string): string {
  const d = somenteDigitos(value);
  return d.startsWith("55") ? d : `55${d}`;
}

/** "em 11 horas", "em 25 minutos", "agora" */
export function tempoRestante(value: string | Date): string {
  const ms = toDate(value).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} h`;
  return `${Math.round(horas / 24)} dias`;
}

export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
