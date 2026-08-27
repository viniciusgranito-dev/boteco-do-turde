import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type ReservationStatus } from "@/lib/types";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-linha bg-madeira/80 backdrop-blur-[1px]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-linha px-5 py-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-lg font-extrabold text-giz", className)} {...props} />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
        className,
      )}
      {...props}
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: ReservationStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(STATUS_TONE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function Aviso({
  tom = "neutro",
  className,
  children,
}: {
  tom?: "neutro" | "alerta" | "erro" | "ok";
  className?: string;
  children: React.ReactNode;
}) {
  const tons = {
    neutro: "border-linha bg-madeira-2 text-giz-fraco",
    alerta: "border-brasa/40 bg-brasa/10 text-brasa",
    erro: "border-vermelho/40 bg-vermelho/10 text-vermelho",
    ok: "border-verde/40 bg-verde/10 text-verde",
  } as const;

  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tons[tom],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-10 text-sm text-giz-fraco"
      role="status"
      aria-live="polite"
    >
      <span className="size-4 animate-spin rounded-full border-2 border-linha border-t-brasa" />
      {texto}
    </div>
  );
}
