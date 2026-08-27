"use client";

import { useState, useTransition } from "react";
import { Loader2, XCircle } from "lucide-react";
import { cancelarReserva } from "./actions";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/surface";

export function BotaoCancelar({ token }: { token: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <>
        {erro && (
          <Aviso tom="erro" className="mb-3">
            {erro}
          </Aviso>
        )}
        <Button variant="perigo" full onClick={() => setConfirmando(true)}>
          <XCircle /> Cancelar reserva
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-vermelho/40 bg-vermelho/5 p-4">
      <p className="text-sm text-giz">
        Tem certeza? A mesa volta a ficar disponível para outras pessoas na hora.
      </p>
      <div className="flex gap-2">
        <Button
          variant="perigo"
          full
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarReserva(token);
              if (!r.ok) {
                setErro(r.erro ?? "Não deu para cancelar.");
                setConfirmando(false);
              }
            })
          }
        >
          {enviando ? <Loader2 className="animate-spin" /> : null}
          Sim, cancelar
        </Button>
        <Button
          variant="contorno"
          full
          disabled={enviando}
          onClick={() => setConfirmando(false)}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
