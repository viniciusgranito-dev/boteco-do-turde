import {
  capitalizar,
  formatDataLonga,
  formatHora,
  telefoneWhatsapp,
} from "@/lib/format";

export type VariaveisMensagem = {
  nome: string;
  codigo: string;
  data: string;
  hora: string;
  pessoas: number;
  /** Número da mesa que o bar separou — só existe no painel. */
  mesa: string | number;
  motivo?: string;
  link?: string;
};

/**
 * Troca {nome}, {data}, {hora}... pelos valores reais.
 * Chave desconhecida vira string vazia — nunca deixa "{motivo}" cru
 * escapar para a mensagem do cliente.
 */
export function preencherTemplate(
  template: string,
  vars: Partial<VariaveisMensagem>,
): string {
  return template
    .replace(/\{(\w+)\}/g, (_, chave: string) => {
      const valor = (vars as Record<string, unknown>)[chave];
      return valor === undefined || valor === null ? "" : String(valor);
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function variaveisDaReserva(r: {
  customer_name: string;
  code: string;
  starts_at: string;
  party_size: number;
  table_number?: number | null;
}): VariaveisMensagem {
  return {
    nome: r.customer_name.split(" ")[0],
    codigo: r.code,
    data: capitalizar(formatDataLonga(r.starts_at)),
    hora: formatHora(r.starts_at),
    pessoas: r.party_size,
    mesa: r.table_number ?? "",
  };
}

/** Link wa.me com a mensagem já escrita. Um clique humano dispara o envio. */
export function linkWhatsapp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefoneWhatsapp(telefone)}?text=${encodeURIComponent(mensagem)}`;
}

/** Link para o cliente mandar o resumo para si mesmo ou para o grupo. */
export function linkCompartilhar(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}
