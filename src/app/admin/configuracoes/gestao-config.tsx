"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, Save } from "lucide-react";
import {
  bloquearTelefone,
  desbloquearTelefone,
  salvarConfiguracoes,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Ajuda, Input, Label, Textarea } from "@/components/ui/field";
import { Aviso, Card, CardBody } from "@/components/ui/surface";
import { formatTelefone } from "@/lib/format";

export type Bloqueado = { phone: string; reason: string | null };

const NUMERICAS: { chave: string; rotulo: string; ajuda: string }[] = [
  {
    chave: "pending_hold_hours",
    rotulo: "Horas para você aprovar",
    ajuda:
      "Toda reserva espera a sua aprovação. Passou o prazo sem resposta, a mesa é liberada sozinha.",
  },
  {
    chave: "reservation_duration_minutes",
    rotulo: "Duração da reserva (minutos)",
    ajuda: "Por quanto tempo a mesa fica bloqueada a partir da chegada.",
  },
  {
    chave: "slot_minutes",
    rotulo: "Intervalo entre horários (minutos)",
    ajuda: "De quanto em quanto tempo o cliente pode escolher.",
  },
  {
    chave: "last_slot_offset_minutes",
    rotulo: "Último horário antes de fechar (minutos)",
    ajuda: "Fechando 22:30 com 60 aqui, o último horário oferecido é 21:30.",
  },
  {
    chave: "min_lead_minutes",
    rotulo: "Antecedência mínima (minutos)",
    ajuda: "Impede reserva para daqui a cinco minutos.",
  },
  {
    chave: "booking_window_days",
    rotulo: "Reservar com até quantos dias de antecedência",
    ajuda: "Tamanho do calendário que o cliente enxerga.",
  },
  {
    chave: "max_party_size",
    rotulo: "Maior grupo aceito pelo site",
    ajuda: "Grupos maiores precisam falar direto com o bar.",
  },
  {
    chave: "max_active_per_phone",
    rotulo: "Reservas em aberto por telefone",
    ajuda: "Segura quem reserva cinco mesas 'por garantia'.",
  },
];

const MENSAGENS: { chave: string; rotulo: string }[] = [
  { chave: "msg_confirm", rotulo: "Mensagem de confirmação" },
  { chave: "msg_decline", rotulo: "Mensagem de recusa" },
  { chave: "msg_reminder", rotulo: "Mensagem de lembrete" },
];

export function GestaoConfig({
  config,
  bloqueados,
}: {
  config: Record<string, string | number>;
  bloqueados: Bloqueado[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [novoTelefone, setNovoTelefone] = useState("");
  const [motivo, setMotivo] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-giz-fraco">
          Muda a regra sem mexer no código. Vale na hora, para todo mundo.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {salvo && <Aviso tom="ok">Salvo.</Aviso>}

      <form
        action={(fd) => {
          setErro(null);
          setSalvo(false);
          iniciar(async () => {
            const r = await salvarConfiguracoes(fd);
            if (r.ok) setSalvo(true);
            else setErro(r.erro ?? "Não deu certo.");
          });
        }}
        className="space-y-6"
      >
        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-extrabold text-giz">O bar</h2>

            <div>
              <Label htmlFor="bar_name">Nome</Label>
              <Input
                id="bar_name"
                name="bar_name"
                defaultValue={String(config.bar_name ?? "")}
              />
            </div>
            <div>
              <Label htmlFor="bar_address">Endereço</Label>
              <Input
                id="bar_address"
                name="bar_address"
                defaultValue={String(config.bar_address ?? "")}
              />
            </div>
            <div>
              <Label htmlFor="bar_phone">WhatsApp do bar</Label>
              <Input
                id="bar_phone"
                name="bar_phone"
                inputMode="numeric"
                defaultValue={String(config.bar_phone ?? "")}
              />
              <Ajuda>
                Com o 55 na frente: 55 + DDD + número. É o link que aparece para
                o cliente.
              </Ajuda>
            </div>
            <div>
              <Label htmlFor="rules_text">Regras que o cliente lê</Label>
              <Textarea
                id="rules_text"
                name="rules_text"
                defaultValue={String(config.rules_text ?? "")}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-extrabold text-giz">Regras de reserva</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {NUMERICAS.map(({ chave, rotulo, ajuda }) => (
                <div key={chave}>
                  <Label htmlFor={chave}>{rotulo}</Label>
                  <Input
                    id={chave}
                    name={chave}
                    type="number"
                    min={0}
                    defaultValue={String(config[chave] ?? "")}
                  />
                  <Ajuda>{ajuda}</Ajuda>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-extrabold text-giz">Mensagens de WhatsApp</h2>
            <Ajuda>
              Use {"{nome}"}, {"{codigo}"}, {"{data}"}, {"{hora}"},{" "}
              {"{pessoas}"}, {"{mesa}"} e {"{motivo}"}. O painel troca pelos
              valores da reserva quando você clica em WhatsApp. O {"{mesa}"} é a
              mesa que o sistema separou — só use se quiser avisar o cliente.
            </Ajuda>

            {MENSAGENS.map(({ chave, rotulo }) => (
              <div key={chave}>
                <Label htmlFor={chave}>{rotulo}</Label>
                <Textarea
                  id={chave}
                  name={chave}
                  rows={5}
                  className="min-h-32 font-mono text-xs"
                  defaultValue={String(config[chave] ?? "")}
                />
              </div>
            ))}
          </CardBody>
        </Card>

        <Button type="submit" size="lg" full disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar ajustes
        </Button>
      </form>

      {/* ---- Telefones bloqueados ---- */}
      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-extrabold text-giz">Telefones bloqueados</h2>
          <Ajuda>
            Quem está aqui não consegue reservar pelo site. Use com parcimônia,
            para reincidente de furo mesmo.
          </Ajuda>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="(14) 99999-9999"
              inputMode="numeric"
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(formatTelefone(e.target.value))}
              aria-label="Telefone para bloquear"
            />
            <Input
              placeholder="Motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-label="Motivo do bloqueio"
            />
            <Button
              variant="perigo"
              disabled={ocupado || !novoTelefone}
              onClick={() =>
                iniciar(async () => {
                  const r = await bloquearTelefone(novoTelefone, motivo);
                  if (r.ok) {
                    setNovoTelefone("");
                    setMotivo("");
                    setErro(null);
                  } else {
                    setErro(r.erro ?? "Não deu certo.");
                  }
                })
              }
            >
              <Ban /> Bloquear
            </Button>
          </div>

          {bloqueados.length === 0 ? (
            <p className="text-sm text-giz-fraco">Nenhum telefone bloqueado.</p>
          ) : (
            <ul className="space-y-2">
              {bloqueados.map((b) => (
                <li
                  key={b.phone}
                  className="flex items-center justify-between gap-3 border-b border-linha py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-giz">
                      {formatTelefone(b.phone)}
                    </p>
                    {b.reason && (
                      <p className="truncate text-xs text-giz-fraco">
                        {b.reason}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="fantasma"
                    size="sm"
                    disabled={ocupado}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await desbloquearTelefone(b.phone);
                        if (!r.ok) setErro(r.erro ?? "Não deu certo.");
                      })
                    }
                  >
                    Desbloquear
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
