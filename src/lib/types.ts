export type ReservationStatus =
  | "pendente"
  | "confirmada"
  | "recusada"
  | "cancelada"
  | "expirada"
  | "compareceu"
  | "no_show";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  pendente: "Aguardando aprovação",
  confirmada: "Confirmada",
  recusada: "Recusada",
  cancelada: "Cancelada",
  expirada: "Expirada",
  compareceu: "Compareceu",
  no_show: "Não apareceu",
};

/** Cor de cada status, no padrão de classes do Tailwind usado no projeto. */
export const STATUS_TONE: Record<ReservationStatus, string> = {
  pendente: "bg-brasa/15 text-brasa border-brasa/40",
  confirmada: "bg-verde/15 text-verde border-verde/40",
  recusada: "bg-vermelho/15 text-vermelho border-vermelho/40",
  cancelada: "bg-giz-fraco/10 text-giz-fraco border-giz-fraco/30",
  expirada: "bg-giz-fraco/10 text-giz-fraco border-giz-fraco/30",
  compareceu: "bg-azul/15 text-azul border-azul/40",
  no_show: "bg-vermelho/15 text-vermelho border-vermelho/40",
};

export type BusyInterval = { s: string; e: string };

/**
 * O que o site público sabe de cada mesa: quanta gente cabe e quando ela
 * está ocupada. Sem número, sem nome de cliente — o cliente não escolhe
 * mesa, isto serve só para calcular se ainda cabe o grupo dele.
 */
export type AvailabilityTable = {
  capacity: number;
  busy: BusyInterval[];
};

export type DayAvailability = {
  date: string;
  is_open: boolean;
  reason?: "fechado" | "fora_da_janela";
  label?: string | null;
  opens_at?: string;
  closes_at?: string;
  duration_minutes?: number;
  slot_minutes?: number;
  slots: string[];
  tables: AvailabilityTable[];
};

export type WeekdayHours = {
  weekday: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
};

export type SpecialDateInfo = {
  date: string;
  label: string;
  closed: boolean;
};

export type BookingConfig = {
  timezone: string;
  today: string;
  bar_name: string;
  bar_address: string;
  bar_phone: string;
  bar_instagram: string;
  rules_text: string;
  booking_window_days: number;
  slot_minutes: number;
  reservation_duration_minutes: number;
  max_party_size: number;
  pending_hold_hours: number;
  weekdays: WeekdayHours[];
  special_dates: SpecialDateInfo[];
};

/** Toda reserva nasce pendente, então não há número de mesa para mostrar. */
export type CreatedReservation = {
  code: string;
  manage_token: string;
  status: ReservationStatus;
  starts_at: string;
  ends_at: string;
  party_size: number;
  customer_name: string;
  expires_at: string | null;
  pending_hold_hours: number;
};

export type ReservationView = {
  code: string;
  status: ReservationStatus;
  customer_name: string;
  party_size: number;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  decline_reason: string | null;
  expires_at: string | null;
  can_cancel: boolean;
};

/** Linha completa da reserva — só o painel autenticado enxerga isto. */
export type AdminReservation = {
  id: string;
  code: string;
  table_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  notes: string | null;
  decline_reason: string | null;
  manage_token: string;
  source: "site" | "manual";
  expires_at: string | null;
  created_at: string;
  tables?: { number: number; capacity: number } | null;
};

export type BarTable = {
  id: string;
  number: number;
  capacity: number;
  active: boolean;
  sort_order: number;
};
