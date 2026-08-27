import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="rotulo">Boteco do Turde</p>
      <h1 className="display mt-3 text-3xl">Não achamos essa página</h1>
      <p className="mt-3 text-sm text-giz-fraco">
        O link pode ter expirado ou vindo cortado do WhatsApp. Confira se ele
        veio inteiro — ou faça uma nova reserva.
      </p>
      <Link href="/reservar" className="mt-8 w-full">
        <Button size="lg" full>
          Reservar uma mesa
        </Button>
      </Link>
    </main>
  );
}
