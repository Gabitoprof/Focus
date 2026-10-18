import { describe, expect, it } from "vitest";
import { retroRanges } from "@/server/services/retrospective";

describe("Retrospectiva — períodos", () => {
  // Sábado, 17/10/2026, 15h em São Paulo.
  const now = new Date("2026-10-17T18:00:00Z");
  const tz = "America/Sao_Paulo";
  it("dia, semana (seg–hoje), mês e ano, comparados ao mesmo trecho do período anterior", () => {
    expect(retroRanges("dia", tz, now)).toEqual({ cur: { from: "2026-10-17", to: "2026-10-17" }, prev: { from: "2026-10-16", to: "2026-10-16" } });
    expect(retroRanges("semana", tz, now)).toEqual({ cur: { from: "2026-10-12", to: "2026-10-17" }, prev: { from: "2026-10-05", to: "2026-10-10" } });
    expect(retroRanges("mes", tz, now)).toEqual({ cur: { from: "2026-10-01", to: "2026-10-17" }, prev: { from: "2026-09-01", to: "2026-09-17" } });
    expect(retroRanges("ano", tz, now)).toEqual({ cur: { from: "2026-01-01", to: "2026-10-17" }, prev: { from: "2025-01-01", to: "2025-10-17" } });
  });
});
