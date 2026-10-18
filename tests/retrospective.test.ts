import { describe, expect, it } from "vitest";
import { buildInsights, changeVsPrevious, type RetroSummary } from "@/domain/retrospective";

const base: RetroSummary = {
  studied: 10 * 3600,
  planned: 10 * 3600,
  overtime: 0,
  paused: 0,
  sessions: 10,
  cycles: 10,
  xp: 250,
  score: 600,
  breaks: 8,
  cleanBreaks: 8,
  lateBreaks: 0,
  overrun: 0,
  activeDays: 6,
  days: 7,
  bestDay: { day: "2026-10-14", seconds: 3 * 3600 },
  peakHour: 19,
  topCategory: { name: "Faculdade", seconds: 6 * 3600 },
  topTopic: { name: "Cálculo I", seconds: 4 * 3600 },
};
const codes = (xs: { code: string }[]) => xs.map((x) => x.code);

describe("Retrospectiva", () => {
  it("semana boa: cresceu, constante, concluiu ciclos, poucas pausas, intervalos no tempo", () => {
    const r = buildInsights(base, { ...base, studied: 8 * 3600 });
    expect(codes(r.highlights)).toEqual(["studiedUp", "consistency", "completion", "lowPauses", "cleanBreaks"]);
    expect(r.highlights[0]).toEqual({ code: "studiedUp", pct: 25 });
    expect(codes(r.improvements)).toEqual(["keepGoing"]);
  });

  it("aponta o que melhorar: queda, pouca constância, pausas, atraso no intervalo, ciclos incompletos, excedente", () => {
    const r = buildInsights(
      { ...base, studied: 5 * 3600, activeDays: 2, paused: 3600, cycles: 4, lateBreaks: 2, overrun: 25 * 60, cleanBreaks: 0, overtime: 2 * 3600 },
      base,
    );
    expect(codes(r.improvements)).toEqual(["studiedDown", "lowConsistency", "lowCompletion", "highPauses", "lateBreaks", "highOvertime"]);
    expect(r.improvements.find((x) => x.code === "lateBreaks")).toEqual({ code: "lateBreaks", n: 2, minutes: 25 });
  });

  it("primeiro período com foco e período vazio", () => {
    expect(codes(buildInsights(base, { ...base, studied: 0 }).highlights)).toContain("firstFocus");
    expect(buildInsights({ ...base, studied: 0 }, base)).toEqual({ highlights: [], improvements: [] });
  });

  it("variação em relação ao anterior", () => {
    expect(changeVsPrevious(120 * 60, 100 * 60)).toBe(20);
    expect(changeVsPrevious(100, 0)).toBeNull();
  });
});
