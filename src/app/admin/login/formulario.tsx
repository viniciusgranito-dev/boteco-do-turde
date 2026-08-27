"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LogIn } from "lucide-react";
import { entrar, type Retorno } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Aviso } from "@/components/ui/surface";

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" full disabled={pending}>
      <LogIn /> {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function FormularioLogin() {
  const [estado, acao] = useActionState<Retorno | null, FormData>(entrar, null);

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Aviso tom="erro">{estado.erro}</Aviso>}

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
        />
      </div>

      <div>
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <BotaoEntrar />
    </form>
  );
}
