import { describe, expect, it } from "vitest";
import { localHour, secondsByLocalHour } from "@/domain/time";

describe("Minutos por hora (filtro Hoje)", () => {
  it("divide o estudo entre as horas locais", () => {
    // 14:40 → 15:20 em São Paulo (UTC−3)
    const m = secondsByLocalHour([{ start: new Date("2026-10-17T17:40:00Z"), end: new Date("2026-10-17T18:20:00Z") }], "America/Sao_Paulo");
    expect(Object.fromEntries(m)).toEqual({ 14: 1200, 15: 1200 });
    expect(localHour(new Date("2026-10-17T21:04:00Z"), "America/Sao_Paulo")).toBe(18);
  });
});
