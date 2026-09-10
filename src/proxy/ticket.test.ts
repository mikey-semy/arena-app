import { describe, expect, it } from "vitest";
import { checkTicket, issueTicket } from "./ticket.js";

const secret = "секрет-для-теста";
const ticket = { room: "arena", name: "Витя", nonce: "abc123", expires: 2_000_000_000 };

describe("билет", () => {
  it("свой билет проходит и данные не теряются", () => {
    const result = checkTicket(issueTicket(ticket, secret), secret);
    expect(result).toEqual({ ticket });
  });

  it("чужой ключ не подходит", () => {
    const result = checkTicket(issueTicket(ticket, secret), "другой-ключ");
    expect(result).toEqual({ error: "подпись не сходится" });
  });

  it("подделанные данные не проходят", () => {
    const raw = issueTicket(ticket, secret);
    const forged = issueTicket({ ...ticket, name: "Не Витя" }, "любой").split(".")[0];
    expect(checkTicket(`${forged}.${raw.split(".")[1]}`, secret)).toEqual({
      error: "подпись не сходится",
    });
  });

  it("просроченный не проходит", () => {
    const raw = issueTicket({ ...ticket, expires: 1000 }, secret);
    expect(checkTicket(raw, secret, 1001)).toEqual({ error: "просрочен" });
  });

  it("билет без метки не проходит: гасить было бы нечего", () => {
    const raw = issueTicket({ ...ticket, nonce: undefined } as never, secret);
    expect(checkTicket(raw, secret)).toEqual({ error: "не хватает полей" });
  });

  it("мусор не роняет проверку", () => {
    for (const junk of ["", ".", "нет-точки", "a.b", "..", "..."])
      expect(checkTicket(junk, secret)).toHaveProperty("error");
  });
});
