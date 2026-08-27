"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  Send,
  Users,
} from "lucide-react";
import { buscarDia, criarReserva } from "./actions";
import { diasDoCalendario, primeiroDiaAberto } from "./dias";
import { Sucesso } from "./sucesso";
import { Button } from "@/components/ui/button";
import {
  Ajuda,
  ErroCampo,
  Input,
  Label,
  Textarea,
} from "@/components/ui/field";
import { Aviso, Card, CardBody, Carregando } from "@/components/ui/surface";
import { maiorGrupoDoDia, slotTemMesa } from "@/lib/availability";
import { ERROS_DE_CONFLITO } from "@/lib/errors";
import {
  capitalizar,
  formatDataCurta,
  formatDataLonga,
  formatDiaSemana,
  formatHora,
  formatTelefone,
  fromYmd,
  nomeValido,
  telefoneValido,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type BookingConfig,
  type CreatedReservation,
  type DayAvailability,
} from "@/lib/types";

const ETAPAS = ["Quando", "Horário", "Seus dados"] as const;

export function FluxoReserva({ config }: { config: BookingConfig }) {
  const dias = useMemo(() => diasDoCalendario(config), [config]);

  const [etapa, setEtapa] = useState(0);
  const [data, setData] = useState<string | null>(() => primeiroDiaAberto(dias));
  const [pessoas, setPessoas] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [tocouNome, setTocouNome] = useState(false);
  const [tocouTelefone, setTocouTelefone] = useState(false);

  const [dia, setDia] = useState<DayAvailability | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reserva, setReserva] = useState<CreatedReservation | null>(null);
  const [enviando, iniciarEnvio] = useTransition();

  // Sempre que a data muda, recarrega a disponibilidade e zera o horário.
  useEffect(() => {
    if (!data) return;
    let cancelado = false;
    setCarregandoDia(true);
    setSlot(null);

    buscarDia(data).then((r) => {
      if (cancelado) return;
      setCarregandoDia(false);
      if (r.ok) {
        setDia(r.dados);
        setErro(null);
      } else {
        setDia(null);
        setErro(r.erro);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [data]);

  // Mudou o tamanho do grupo? O horário escolhido pode não servir mais.
  useEffect(() => {
    if (slot && dia?.is_open && !slotTemMesa(dia, slot, pessoas)) {
      setSlot(null);
    }
  }, [pessoas, dia, slot]);

  const horariosComMesa = useMemo(() => {
    if (!dia?.is_open) return [];
    return dia.slots.filter((s) => slotTemMesa(dia, s, pessoas));
  }, [dia, pessoas]);

  const maiorGrupo = dia?.is_open ? maiorGrupoDoDia(dia) : 0;
  const grupoGrandeDemais = maiorGrupo > 0 && pessoas > maiorGrupo;

  if (reserva) {
    return <Sucesso reserva={reserva} config={config} />;
  }

  const podeAvancar =
    (etapa === 0 && Boolean(data) && pessoas >= 1) ||
    (etapa === 1 && Boolean(slot));

  const dadosOk = nomeValido(nome) && telefoneValido(telefone);

  function voltar() {
    setErro(null);
    setEtapa((e) => Math.max(0, e - 1));
  }

  function avancar() {
    setErro(null);
    setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1));
  }

  function enviar() {
    if (!slot || !dadosOk) return;
    setErro(null);

    iniciarEnvio(async () => {
      // O último lugar daquele horário pode ter ido embora enquanto o
      // formulário estava aberto: reconsulta antes de gravar.
      const conferencia = await buscarDia(data!);
      if (conferencia.ok) {
        setDia(conferencia.dados);
        if (!slotTemMesa(conferencia.dados, slot, pessoas)) {
          setSlot(null);
          setEtapa(1);
          setErro(
            "As mesas desse horário acabaram enquanto você preenchia. Escolha outro, por favor.",
          );
          return;
        }
      }

      const r = await criarReserva({
        starts_at: slot,
        nome,
        telefone,
        pessoas,
        observacao,
        sobrenome_do_meio: armadilha,
      });

      if (r.ok) {
        setReserva(r.dados);
        return;
      }

      setErro(r.erro);
      if (ERROS_DE_CONFLITO.has(r.chave)) {
        // Volta para os horários com o resto do formulário preservado.
        setSlot(null);
        setEtapa(1);
        const novo = await buscarDia(data!);
        if (novo.ok) setDia(novo.dados);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-6">
      <Passos atual={etapa} />

      {erro && (
        <Aviso tom="erro" className="mb-4">
          {erro}
        </Aviso>
      )}

      {/* ---------------- Etapa 1: quando ---------------- */}
      {etapa === 0 && (
        <section aria-labelledby="t-quando" className="space-y-6">
          <div>
            <h2 id="t-quando" className="display mb-1 text-2xl">
              Quando você vem?
            </h2>
            <p className="text-sm text-giz-fraco">
              Escolha o dia e diga quantas pessoas são.
            </p>
          </div>

          <div>
            <Label>Dia</Label>
            <div className="rolagem-x -mx-1 flex gap-2 px-1 pb-2">
              {dias.map((d) => (
                <button
                  key={d.data}
                  type="button"
                  disabled={!d.aberto}
                  onClick={() => setData(d.data)}
                  aria-pressed={data === d.data}
                  className={cn(
                    "flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 transition-colors",
                    !d.aberto &&
                      "cursor-not-allowed border-linha/50 bg-transparent text-giz-fraco/40 line-through",
                    d.aberto &&
                      data !== d.data &&
                      "border-linha bg-madeira text-giz hover:border-brasa/50",
                    data === d.data &&
                      "border-brasa bg-brasa text-noite shadow-[0_2px_0_0_rgba(0,0,0,0.35)]",
                  )}
                >
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider">
                    {formatDiaSemana(fromYmd(d.data))}
                  </span>
                  <span className="text-lg font-extrabold leading-none">
                    {formatDataCurta(fromYmd(d.data)).slice(0, 2)}
                  </span>
                  <span className="text-[0.6rem] opacity-70">
                    {formatDataCurta(fromYmd(d.data)).slice(3)}
                  </span>
                </button>
              ))}
            </div>
            <Ajuda>Segunda-feira o bar não abre.</Ajuda>
          </div>

          {data && (
            <p className="flex items-center gap-2 text-sm text-brasa">
              <CalendarDays className="size-4" />
              {capitalizar(formatDataLonga(fromYmd(data)))}
            </p>
          )}

          <div>
            <Label htmlFor="pessoas">Quantas pessoas?</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="secundario"
                size="icone"
                aria-label="Menos uma pessoa"
                onClick={() => setPessoas((p) => Math.max(1, p - 1))}
              >
                –
              </Button>
              <Input
                id="pessoas"
                type="number"
                inputMode="numeric"
                min={1}
                max={config.max_party_size}
                value={pessoas}
                onChange={(e) =>
                  setPessoas(
                    Math.min(
                      config.max_party_size,
                      Math.max(1, Number(e.target.value) || 1),
                    ),
                  )
                }
                className="text-center text-lg font-extrabold"
              />
              <Button
                variant="secundario"
                size="icone"
                aria-label="Mais uma pessoa"
                onClick={() =>
                  setPessoas((p) => Math.min(config.max_party_size, p + 1))
                }
              >
                +
              </Button>
            </div>
            <Ajuda>
              A gente separa a mesa certa para o seu grupo — você não precisa
              escolher.
            </Ajuda>
          </div>

          {grupoGrandeDemais && (
            <Aviso tom="alerta">
              Nossa maior mesa comporta {maiorGrupo} pessoas. Para um grupo desse
              tamanho, chame o bar no WhatsApp que a gente junta mesas para
              vocês.
            </Aviso>
          )}
        </section>
      )}

      {/* ---------------- Etapa 2: horário ---------------- */}
      {etapa === 1 && (
        <section aria-labelledby="t-hora" className="space-y-5">
          <div>
            <h2 id="t-hora" className="display mb-1 text-2xl">
              Que horas chegam?
            </h2>
            <p className="text-sm text-giz-fraco">
              A mesa fica reservada por{" "}
              {Math.round((dia?.duration_minutes ?? 120) / 60)} horas a partir do
              horário escolhido.
            </p>
          </div>

          {carregandoDia && <Carregando texto="Vendo o que está livre…" />}

          {!carregandoDia && dia && !dia.is_open && (
            <Aviso tom="alerta">
              {dia.label
                ? `${dia.label}: o bar não abre nesse dia.`
                : "O bar não abre nesse dia. Escolha outra data."}
            </Aviso>
          )}

          {!carregandoDia && dia?.is_open && horariosComMesa.length === 0 && (
            <Aviso tom="alerta">
              Não sobrou horário para {pessoas}{" "}
              {pessoas === 1 ? "pessoa" : "pessoas"} nesse dia. Tente outra data,
              ou chame o bar no WhatsApp que a gente dá um jeito.
            </Aviso>
          )}

          {!carregandoDia && dia?.is_open && horariosComMesa.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {horariosComMesa.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={cn(
                    "rounded-xl border py-3 text-base font-extrabold transition-colors",
                    slot === s
                      ? "border-brasa bg-brasa text-noite"
                      : "border-linha bg-madeira text-giz hover:border-brasa/50",
                  )}
                >
                  {formatHora(s)}
                </button>
              ))}
            </div>
          )}

          {dia?.label && dia.is_open && (
            <Aviso tom="alerta">
              <strong>{dia.label}</strong> nesse dia. Pode lotar mais rápido que
              o normal.
            </Aviso>
          )}
        </section>
      )}

      {/* ---------------- Etapa 3: dados ---------------- */}
      {etapa === 2 && (
        <section aria-labelledby="t-dados" className="space-y-5">
          <div>
            <h2 id="t-dados" className="display mb-1 text-2xl">
              Quase lá
            </h2>
            <p className="text-sm text-giz-fraco">
              Só precisamos do seu nome e de um WhatsApp para confirmar com você.
            </p>
          </div>

          <Card>
            <CardBody className="space-y-1.5 text-sm">
              <Resumo
                icone={<CalendarDays className="size-4" />}
                texto={capitalizar(formatDataLonga(slot ?? ""))}
              />
              <Resumo
                icone={<Clock className="size-4" />}
                texto={`Chegada às ${formatHora(slot ?? "")}`}
              />
              <Resumo
                icone={<Users className="size-4" />}
                texto={`${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`}
              />
            </CardBody>
          </Card>

          <div>
            <Label htmlFor="nome">Nome e sobrenome</Label>
            <Input
              id="nome"
              autoComplete="name"
              placeholder="Ex.: João da Silva"
              value={nome}
              erro={tocouNome && !nomeValido(nome)}
              onBlur={() => setTocouNome(true)}
              onChange={(e) => setNome(e.target.value)}
            />
            <ErroCampo>
              {tocouNome && !nomeValido(nome)
                ? "Escreva nome e sobrenome."
                : null}
            </ErroCampo>
          </div>

          <div>
            <Label htmlFor="telefone">WhatsApp</Label>
            <Input
              id="telefone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="(14) 99999-9999"
              value={telefone}
              erro={tocouTelefone && !telefoneValido(telefone)}
              onBlur={() => setTocouTelefone(true)}
              onChange={(e) => setTelefone(formatTelefone(e.target.value))}
            />
            <ErroCampo>
              {tocouTelefone && !telefoneValido(telefone)
                ? "Confira o DDD e o número."
                : null}
            </ErroCampo>
            <Ajuda>É por aqui que a gente confirma a sua reserva.</Ajuda>
          </div>

          <div>
            <Label htmlFor="obs">Alguma observação? (opcional)</Label>
            <Textarea
              id="obs"
              maxLength={300}
              placeholder="Aniversário, cadeirinha de bebê, preferência de lugar…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          {/* Honeypot — invisível de propósito. */}
          <div className="armadilha" aria-hidden="true">
            <label htmlFor="sobrenome_do_meio">Não preencha este campo</label>
            <input
              id="sobrenome_do_meio"
              name="sobrenome_do_meio"
              tabIndex={-1}
              autoComplete="off"
              value={armadilha}
              onChange={(e) => setArmadilha(e.target.value)}
            />
          </div>

          <Aviso tom="alerta">
            Este é um <strong>pedido</strong> de reserva. O bar confirma no seu
            WhatsApp em até {config.pending_hold_hours} horas — a mesa fica
            guardada até lá.
          </Aviso>
        </section>
      )}

      {/* ---------------- Barra de ação ---------------- */}
      <div className="fixed inset-x-0 bottom-0 border-t border-linha bg-noite/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {etapa > 0 && (
            <Button variant="contorno" size="lg" onClick={voltar} aria-label="Voltar">
              <ArrowLeft />
            </Button>
          )}

          {etapa < ETAPAS.length - 1 ? (
            <Button size="lg" full disabled={!podeAvancar} onClick={avancar}>
              Continuar
            </Button>
          ) : (
            <Button
              size="lg"
              full
              disabled={!dadosOk || enviando}
              onClick={enviar}
            >
              {enviando ? (
                <>
                  <Loader2 className="animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Send /> Pedir reserva
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="mb-6 flex items-center gap-1.5" aria-label="Etapas">
      {ETAPAS.map((nome, i) => (
        <li key={nome} className="flex flex-1 flex-col gap-1.5">
          <span
            className={cn(
              "h-1 rounded-full transition-colors",
              i <= atual ? "bg-brasa" : "bg-linha",
            )}
          />
          <span
            className={cn(
              "text-[0.65rem] font-bold uppercase tracking-wider",
              i === atual ? "text-brasa" : "text-giz-fraco/60",
            )}
            aria-current={i === atual ? "step" : undefined}
          >
            {nome}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Resumo({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <p className="flex items-center gap-2.5 text-giz">
      <span className="text-brasa">{icone}</span>
      {texto}
    </p>
  );
}
