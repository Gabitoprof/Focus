import { describe, expect, it } from "vitest";
import { computeScore } from "@/domain/score";

describe("Score de foco", () => {
  it("estudo dentro do planejado vale 1/min; excedente vale metade", () => {
    // 25 min planejados, estudou 35: 25 + 10×0,5 = 30
    expect(computeScore({ activeSeconds: 35 * 60, overtimeSeconds: 10 * 60, pausedSeconds: 0, cleanBreaks: 0, breakOverrunSeconds: 0 })).toMatchObject({
      total: 30,
      planned: 25,
      overtime: 5,
    });
  });

  it("intervalo no tempo dá bônus; pausas e atraso no intervalo tiram pontos", () => {
    const s = computeScore({ activeSeconds: 50 * 60, overtimeSeconds: 0, pausedSeconds: 10 * 60, cleanBreaks: 2, breakOverrunSeconds: 4 * 60 });
    expect(s).toEqual({ total: 50 + 10 - 5 - 4, planned: 50, overtime: 0, cleanBreaks: 10, paused: -5, breakOverrun: -4 });
  });

  it("nunca fica negativo", () => {
    expect(computeScore({ activeSeconds: 60, overtimeSeconds: 0, pausedSeconds: 3 * 3600, cleanBreaks: 0, breakOverrunSeconds: 0 }).total).toBe(0);
  });
});
