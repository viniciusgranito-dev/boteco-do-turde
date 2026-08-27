import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brasa text-noite hover:bg-brasa-2 active:bg-brasa-2 shadow-[0_2px_0_0_rgba(0,0,0,0.35)]",
        secundario:
          "bg-madeira-2 text-giz border border-linha hover:border-brasa/60 hover:text-brasa",
        contorno:
          "border border-linha text-giz hover:bg-madeira-2 hover:border-brasa/50",
        fantasma: "text-giz-fraco hover:text-giz hover:bg-madeira-2",
        perigo:
          "bg-vermelho/15 text-vermelho border border-vermelho/40 hover:bg-vermelho/25",
        sucesso:
          "bg-verde/15 text-verde border border-verde/40 hover:bg-verde/25",
      },
      size: {
        sm: "h-9 px-3 text-sm [&_svg]:size-4",
        md: "h-11 px-4 text-[0.95rem] [&_svg]:size-4",
        lg: "h-14 px-6 text-base [&_svg]:size-5",
        icone: "h-10 w-10 [&_svg]:size-4",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
