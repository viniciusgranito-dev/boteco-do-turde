import { describe, expect, it } from "vitest";
import {
  formatTelefone,
  nomeValido,
  somenteDigitos,
  telefoneValido,
  telefoneWhatsapp,
} from "@/lib/format";
import { inicioDoDia, fimDoDia, instanteLocal } from "@/lib/dia";
import {
  fimDaOcupacao,
  maiorGrupoDoDia,
  mesaLivre,
  slotTemMesa,
} from "@/lib/availability";
import { preencherTemplate, variaveisDaReserva } from "@/lib/whatsapp";
import type { AvailabilityTable, DayAvailability } from "@/lib/types";

describe("telefone", () => {
  it("aceita celular e fixo brasileiros", () => {
    expect(telefoneValido("(14) 99123-4567")).toBe(true);
    expect(telefoneValido("1433221100")).toBe(true);
  });

  it("recusa DDD inválido, tamanho errado e celular sem o 9", () => {
    expect(telefoneValido("0991234567")).toBe(false);
    expect(telefoneValido("1499123")).toBe(false);
    expect(telefoneValido("14891234567")).toBe(false);
  });

  it("formata e limpa", () => {
    expect(formatTelefone("14991234567")).toBe("(14) 99123-4567");
    expect(somenteDigitos("(14) 99123-4567")).toBe("14991234567");
    expect(telefoneWhatsapp("14991234567")).toBe("5514991234567");
    expect(telefoneWhatsapp("5514991234567")).toBe("5514991234567");
  });
});

describe("nome", () => {
  it("exige nome e sobrenome", () => {
    expect(nomeValido("João da Silva")).toBe(true);
    expect(nomeValido("João")).toBe(false);
    expect(nomeValido("Jo")).toBe(false);
  });
});

describe("fuso do bar", () => {
  it("meia-noite local vira 03:00 UTC", () => {
    expect(inicioDoDia("2026-08-29").toISOString()).toBe(
      "2026-08-29T03:00:00.000Z",
    );
    expect(fimDoDia("2026-08-29").toISOString()).toBe(
      "2026-08-30T03:00:00.000Z",
    );
  });

  it("junta data e hora no fuso certo", () => {
    expect(instanteLocal("2026-08-29", "19:30").toISOString()).toBe(
      "2026-08-29T22:30:00.000Z",
    );
  });
});

describe("ocupação de mesa", () => {
  const mesa: AvailabilityTable = {
    capacity: 4,
    busy: [{ s: "2026-08-29T22:00:00Z", e: "2026-08-30T00:00:00Z" }],
  };

  it("a reserva não passa da hora de fechar", () => {
    const fim = fimDaOcupacao(
      "2026-08-29T23:30:00Z",
      120,
      "2026-08-30T00:30:00Z",
    );
    expect(new Date(fim).toISOString()).toBe("2026-08-30T00:30:00.000Z");
  });

  it("marca ocupado quando os intervalos se cruzam", () => {
    expect(mesaLivre(mesa, "2026-08-29T23:00:00Z", 120)).toBe(false);
    expect(mesaLivre(mesa, "2026-08-29T21:00:00Z", 120)).toBe(false);
  });

  it("libera quando encosta sem sobrepor", () => {
    // Reserva anterior termina exatamente quando a nova começa.
    expect(mesaLivre(mesa, "2026-08-30T00:00:00Z", 120)).toBe(true);
    // Reserva anterior começa exatamente quando a nova acabaria.
    expect(mesaLivre(mesa, "2026-08-29T20:00:00Z", 120)).toBe(true);
  });
});

describe("horários oferecidos", () => {
  const dia: DayAvailability = {
    date: "2026-08-29",
    is_open: true,
    duration_minutes: 120,
    closes_at: "2026-08-30T02:30:00Z",
    slots: ["2026-08-29T22:30:00Z"],
    tables: [
      { capacity: 2, busy: [] },
      {
        capacity: 8,
        busy: [{ s: "2026-08-29T22:00:00Z", e: "2026-08-30T00:00:00Z" }],
      },
    ],
  };

  it("some com o horário quando nenhuma mesa serve o grupo", () => {
    expect(slotTemMesa(dia, "2026-08-29T22:30:00Z", 2)).toBe(true);
    // Grupo de 6: só a mesa de 8 comporta, e ela está ocupada.
    expect(slotTemMesa(dia, "2026-08-29T22:30:00Z", 6)).toBe(false);
  });

  it("sabe qual é o maior grupo que o bar aceita", () => {
    expect(maiorGrupoDoDia(dia)).toBe(8);
  });
});

describe("templates de WhatsApp", () => {
  it("troca as chaves e não deixa placeholder vazio na mensagem", () => {
    const texto = preencherTemplate(
      "Oi {nome}, mesa {mesa} às {hora}. {motivo}",
      { nome: "Ana", mesa: 3, hora: "19:30" },
    );
    expect(texto).toBe("Oi Ana, mesa 3 às 19:30.");
  });

  it("monta as variáveis a partir da reserva", () => {
    const vars = variaveisDaReserva({
      customer_name: "Ana Paula Ribeiro",
      code: "TURDE-4K7Q",
      starts_at: "2026-08-28T22:30:00Z",
      party_size: 4,
      table_number: 7,
    });
    expect(vars.nome).toBe("Ana");
    expect(vars.hora).toBe("19:30");
    expect(vars.mesa).toBe(7);
  });

  it("sem mesa atribuída, {mesa} sai vazio em vez de 'undefined'", () => {
    const vars = variaveisDaReserva({
      customer_name: "Ana Paula Ribeiro",
      code: "TURDE-4K7Q",
      starts_at: "2026-08-28T22:30:00Z",
      party_size: 4,
    });
    expect(preencherTemplate("Mesa {mesa}!", vars)).toBe("Mesa !");
  });
});
