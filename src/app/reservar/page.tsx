import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FluxoReserva } from "./fluxo-reserva";
import { buscarConfiguracao } from "./actions";
import { Aviso } from "@/components/ui/surface";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  let config;
  try {
    config = await buscarConfiguracao();
  } catch {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Aviso tom="erro">
          Não conseguimos carregar as reservas agora. Recarregue a página em
          alguns instantes ou chame o bar no WhatsApp.
        </Aviso>
      </main>
    );
  }

  return (
    <main>
      <header className="border-b border-linha bg-madeira/60">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="Voltar para a página inicial"
            className="text-giz-fraco hover:text-brasa"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div>
            <p className="text-sm font-extrabold leading-tight text-giz">
              {config.bar_name}
            </p>
            <p className="text-xs text-giz-fraco">Reserva de mesa</p>
          </div>
        </div>
      </header>

      <FluxoReserva config={config} />
    </main>
  );
}
