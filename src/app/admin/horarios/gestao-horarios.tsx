"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarPlus, Loader2, Save, Trash2 } from "lucide-react";
import {
  apagarDataEspecial,
  salvarDataEspecial,
  salvarHorario,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Ajuda, Input, Label } from "@/components/ui/field";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import { hoje } from "@/lib/dia";

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export type LinhaHorario = {
  weekday: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
};

export type LinhaEspecial = {
  id: string;
  date: string;
  label: string;
  closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

function hhmm(v: string | null | undefined) {
  return v?.slice(0, 5) ?? "";
}

export function GestaoHorarios({
  horarios,
  especiais,
}: {
  horarios: LinhaHorario[];
  especiais: LinhaEspecial[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const novaRef = useRef<HTMLFormElement>(null);

  const porDia = new Map(horarios.map((h) => [h.weekday, h]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl">Horários</h1>
        <p className="mt-1 text-sm text-giz-fraco">
          O horário da semana vale para sempre. As datas especiais mandam mais
          que ele naquele dia.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {/* ---- Semana ---- */}
      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-extrabold text-giz">Semana normal</h2>

          {DIAS.map((nome, weekday) => {
            const linha = porDia.get(weekday);
            return (
              <form
                key={weekday}
                action={(fd) => {
                  setErro(null);
                  iniciar(async () => {
                    const r = await salvarHorario(fd);
                    if (!r.ok) setErro(r.erro ?? "Não deu certo.");
                  });
                }}
                className="grid grid-cols-2 items-end gap-3 border-b border-linha pb-3 last:border-b-0 sm:grid-cols-5"
              >
                <input type="hidden" name="weekday" value={weekday} />

                <p className="col-span-2 text-sm font-semibold text-giz sm:col-span-1">
                  {nome}
                </p>

                <div>
                  <Label htmlFor={`abre-${weekday}`}>Abre</Label>
                  <Input
                    id={`abre-${weekday}`}
                    name="opens_at"
                    type="time"
                    step={300}
                    defaultValue={hhmm(linha?.opens_at) || "17:30"}
                  />
                </div>
                <div>
                  <Label htmlFor={`fecha-${weekday}`}>Fecha</Label>
                  <Input
                    id={`fecha-${weekday}`}
                    name="closes_at"
                    type="time"
                    step={300}
                    defaultValue={hhmm(linha?.closes_at) || "22:30"}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-giz">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={linha?.active ?? false}
                      className="size-4 accent-[#E9A33C]"
                    />
                    Abre
                  </label>
                  <Button type="submit" variant="secundario" size="sm" disabled={ocupado}>
                    <Save />
                  </Button>
                </div>
              </form>
            );
          })}
        </CardBody>
      </Card>

      {/* ---- Nova data especial ---- */}
      <Card className="border-brasa/40">
        <CardBody>
          <h2 className="mb-4 font-extrabold text-giz">
            Data especial ou fechamento
          </h2>

          <form
            ref={novaRef}
            action={(fd) => {
              setErro(null);
              iniciar(async () => {
                const r = await salvarDataEspecial(fd);
                if (r.ok) novaRef.current?.reset();
                else setErro(r.erro ?? "Não deu certo.");
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="e-data">Data</Label>
                <Input id="e-data" name="date" type="date" min={hoje()} required />
              </div>
              <div>
                <Label htmlFor="e-nome">Nome</Label>
                <Input
                  id="e-nome"
                  name="label"
                  placeholder="Ex.: Show do Zé"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="e-abre">Abre (opcional)</Label>
                <Input id="e-abre" name="opens_at" type="time" step={300} />
              </div>
              <div>
                <Label htmlFor="e-fecha">Fecha (opcional)</Label>
                <Input id="e-fecha" name="closes_at" type="time" step={300} />
              </div>
            </div>
            <Ajuda>
              Deixe os horários em branco para manter o horário normal daquele
              dia da semana.
            </Ajuda>

            <label className="flex items-center gap-2 text-sm text-giz">
              <input
                type="checkbox"
                name="closed"
                className="size-4 accent-[#E9A33C]"
              />
              Bar fechado nesse dia
            </label>

            <Button type="submit" full disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              Salvar data
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* ---- Lista de datas especiais ---- */}
      {especiais.length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <h2 className="mb-2 font-extrabold text-giz">Datas cadastradas</h2>
            {especiais.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 border-b border-linha py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-giz">
                    {e.label}
                  </p>
                  <p className="text-xs text-giz-fraco">
                    {e.date.split("-").reverse().join("/")}
                    {e.closed
                      ? " · fechado"
                      : e.opens_at
                        ? ` · ${hhmm(e.opens_at)}–${hhmm(e.closes_at)}`
                        : " · horário normal"}
                  </p>
                </div>
                <Button
                  variant="fantasma"
                  size="icone"
                  aria-label={`Apagar ${e.label}`}
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await apagarDataEspecial(e.id);
                      if (!r.ok) setErro(r.erro ?? "Não deu certo.");
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
