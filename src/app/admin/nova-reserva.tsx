"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { criarReservaManual } from "./actions";
import { Button } from "@/components/ui/button";
import { Ajuda, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import type { BarTable } from "@/lib/types";

export function NovaReserva({
  mesas,
  dia,
}: {
  mesas: BarTable[];
  dia: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!aberto) {
    return (
      <Button variant="secundario" size="sm" onClick={() => setAberto(true)}>
        <Plus /> Reserva na porta
      </Button>
    );
  }

  return (
    <Card className="border-brasa/40">
      <CardBody>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-extrabold text-giz">Nova reserva manual</h3>
          <Button
            variant="fantasma"
            size="icone"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
          >
            <X />
          </Button>
        </div>

        {erro && (
          <Aviso tom="erro" className="mb-4">
            {erro}
          </Aviso>
        )}

        <form
          ref={formRef}
          action={(formData) => {
            setErro(null);
            iniciar(async () => {
              const r = await criarReservaManual(formData);
              if (r.ok) {
                formRef.current?.reset();
                setAberto(false);
              } else {
                setErro(r.erro ?? "Não deu certo.");
              }
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="m-data">Data</Label>
              <Input id="m-data" name="data" type="date" defaultValue={dia} required />
            </div>
            <div>
              <Label htmlFor="m-hora">Hora</Label>
              <Input id="m-hora" name="hora" type="time" step={900} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="m-mesa">Mesa</Label>
              <Select id="m-mesa" name="table_id" required defaultValue="">
                <option value="" disabled>
                  Escolha…
                </option>
                {mesas
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      Mesa {m.number} · {m.capacity} lugares
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="m-pessoas">Pessoas</Label>
              <Input
                id="m-pessoas"
                name="pessoas"
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={2}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="m-nome">Nome</Label>
            <Input id="m-nome" name="nome" placeholder="Nome do cliente" required />
          </div>

          <div>
            <Label htmlFor="m-tel">WhatsApp (opcional)</Label>
            <Input
              id="m-tel"
              name="telefone"
              type="tel"
              inputMode="numeric"
              placeholder="(14) 99999-9999"
            />
            <Ajuda>Sem telefone a gente não consegue avisar de mudança.</Ajuda>
          </div>

          <div>
            <Label htmlFor="m-obs">Observação</Label>
            <Textarea id="m-obs" name="observacao" maxLength={300} />
          </div>

          <Button type="submit" size="lg" full disabled={ocupado}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Plus />}
            Criar reserva confirmada
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
