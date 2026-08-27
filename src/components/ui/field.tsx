import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("mb-1.5 block text-sm font-semibold text-giz", className)}
    {...props}
  />
));
Label.displayName = "Label";

const baseCampo =
  "w-full rounded-xl border bg-madeira px-4 text-giz placeholder:text-giz-fraco/60 transition-colors focus:border-brasa disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { erro?: boolean }
>(({ className, erro, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      baseCampo,
      "h-12",
      erro ? "border-vermelho" : "border-linha",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(baseCampo, "min-h-24 border-linha py-3", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(baseCampo, "h-12 border-linha pr-9", className)}
    {...props}
  />
));
Select.displayName = "Select";

export function Ajuda({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-1.5 text-xs text-giz-fraco", className)}>{children}</p>
  );
}

export function ErroCampo({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-semibold text-vermelho">
      {children}
    </p>
  );
}
