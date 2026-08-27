"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { alternarMesa, salvarMesa } from "../actions";
import { Button } from "@/components/ui/button";
import { Ajuda, Input, Label } from "@/components/ui/field";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import type { BarTable } from "@/lib/types";

export function GestaoMesas({ mesas }: { mesas: BarTable[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const novaRef = useRef<HTMLFormElement>(null);

  function enviar(formData: FormData, aoConcluir?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarMesa(formData);
      if (r.ok) aoConcluir?.();
      else setErro(r.erro ?? "Não deu certo.");
    });
  }

  const capacidadeTotal = mesas
    .filter((m) => m.active)
    .reduce((s, m) => s + m.capacity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl">Mesas</h1>
        <p className="mt-1 text-sm text-giz-fraco">
          {mesas.filter((m) => m.active).length} mesas ativas ·{" "}
          {capacidadeTotal} lugares. Desative a mesa em vez de apagar — assim o
          histórico de reservas continua fazendo sentido.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {/* ---- Nova mesa ---- */}
      <Card className="border-brasa/40">
        <CardBody>
          <h2 className="mb-4 font-extrabold text-giz">Cadastrar mesa</h2>
          <form
            ref={novaRef}
            action={(fd) => enviar(fd, () => novaRef.current?.reset())}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <input type="hidden" name="active" value="true" />
            <div>
              <Label htmlFor="n-num">Número</Label>
              <Input id="n-num" name="number" type="number" min={1} required />
            </div>
            <div>
              <Label htmlFor="n-cap">Lugares</Label>
              <Input id="n-cap" name="capacity" type="number" min={1} required />
            </div>
            <div>
              <Label htmlFor="n-ordem">Ordem</Label>
              <Input
                id="n-ordem"
                name="sort_order"
                type="number"
                defaultValue={(mesas.length + 1) * 10}
              />
            </div>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <Button type="submit" full disabled={ocupado}>
                {ocupado ? <Loader2 className="animate-spin" /> : <Plus />}
                Adicionar
              </Button>
            </div>
          </form>
          <Ajuda>
            &quot;Ordem&quot; é o critério de desempate quando duas mesas do
            mesmo tamanho estão livres: a de ordem menor é separada primeiro.
          </Ajuda>
        </CardBody>
      </Card>

      {/* ---- Lista ---- */}
      <div className="space-y-3">
        {mesas.map((mesa) => (
          <Card key={mesa.id} className={mesa.active ? "" : "opacity-55"}>
            <CardBody>
              <form
                action={enviar}
                className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5"
              >
                <input type="hidden" name="id" value={mesa.id} />
                <input
                  type="hidden"
                  name="active"
                  value={String(mesa.active)}
                />

                <div>
                  <Label htmlFor={`num-${mesa.id}`}>Número</Label>
                  <Input
                    id={`num-${mesa.id}`}
                    name="number"
                    type="number"
                    min={1}
                    defaultValue={mesa.number}
                  />
                </div>
                <div>
                  <Label htmlFor={`cap-${mesa.id}`}>Lugares</Label>
                  <Input
                    id={`cap-${mesa.id}`}
                    name="capacity"
                    type="number"
                    min={1}
                    defaultValue={mesa.capacity}
                  />
                </div>
                <div>
                  <Label htmlFor={`ordem-${mesa.id}`}>Ordem</Label>
                  <Input
                    id={`ordem-${mesa.id}`}
                    name="sort_order"
                    type="number"
                    defaultValue={mesa.sort_order}
                  />
                </div>

                <Button type="submit" variant="secundario" disabled={ocupado}>
                  <Save /> Salvar
                </Button>

                <Button
                  variant={mesa.active ? "fantasma" : "sucesso"}
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await alternarMesa(mesa.id, !mesa.active);
                      if (!r.ok) setErro(r.erro ?? "Não deu certo.");
                    })
                  }
                >
                  {mesa.active ? "Desativar" : "Reativar"}
                </Button>
              </form>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
