import Link from "next/link";
import { FormularioLogin } from "./formulario";
import { Card, CardBody } from "@/components/ui/surface";

export const metadata = { title: "Entrar — Painel do Boteco" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="rotulo">Boteco do Turde</p>
        <h1 className="display mt-2 text-3xl">Painel da equipe</h1>
        <p className="mt-2 text-sm text-giz-fraco">
          Só para quem trabalha no bar.
        </p>
      </div>

      <Card>
        <CardBody>
          <FormularioLogin />
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-xs text-giz-fraco/60">
        <Link href="/" className="hover:text-giz-fraco">
          Voltar para o site
        </Link>
      </p>
    </main>
  );
}
