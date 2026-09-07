/**
 * As funções do Postgres levantam erros com chaves estáveis
 * (ex.: "MESA_INDISPONIVEL"). Aqui viram texto de gente.
 */
const MENSAGENS: Record<string, string> = {
  SPAM: "Não foi possível enviar. Recarregue a página e tente de novo.",
  MUITAS_TENTATIVAS:
    "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  NOME_INVALIDO: "Escreva seu nome e sobrenome.",
  TELEFONE_INVALIDO: "Confira o WhatsApp: precisa ser DDD + número.",
  TELEFONE_BLOQUEADO:
    "Não conseguimos concluir a reserva por aqui. Chame o bar no WhatsApp, por favor.",
  GRUPO_INVALIDO: "Essa quantidade de pessoas não é aceita pelo site.",
  DATA_FORA_JANELA: "Essa data está fora do período liberado para reserva.",
  BAR_FECHADO: "O bar não abre nesse dia.",
  HORARIO_INVALIDO: "Esse horário não está mais disponível. Escolha outro.",
  SEM_MESA:
    "Não temos mesa livre para esse tamanho de grupo nesse horário. Tente outro horário ou outro dia.",
  LIMITE_RESERVAS:
    "Você já tem reservas em aberto com esse telefone. Cancele uma delas ou fale com o bar.",
  MESA_INDISPONIVEL:
    "As mesas desse horário acabaram enquanto você preenchia. Escolha outro horário, por favor.",
  RESERVA_NAO_ENCONTRADA: "Não encontramos essa reserva.",
  RESERVA_NAO_CANCELAVEL: "Essa reserva não pode mais ser cancelada.",
  RESERVA_JA_COMECOU:
    "O horário da reserva já começou. Fale direto com o bar no WhatsApp.",
};

/** Quando o cliente precisa voltar e escolher outro horário. */
export const ERROS_DE_CONFLITO = new Set([
  "MESA_INDISPONIVEL",
  "HORARIO_INVALIDO",
  "SEM_MESA",
]);

export function chaveDoErro(erro: unknown): string {
  const bruto =
    (erro as { message?: string })?.message ??
    (typeof erro === "string" ? erro : "");
  const achou = Object.keys(MENSAGENS).find((chave) => bruto.includes(chave));
  return achou ?? "DESCONHECIDO";
}

export function mensagemDoErro(erro: unknown): string {
  const chave = chaveDoErro(erro);
  return (
    MENSAGENS[chave] ??
    "Deu ruim aqui do nosso lado. Tente de novo em instantes ou chame o bar no WhatsApp."
  );
}
