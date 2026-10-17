import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { subscriptionGrantsAccess } from "@/domain/entitlements";
import { normalizeTerm } from "@/domain/catalog";
import { catalogTopics, user, userRoles } from "@/server/db/schema";
import { setProfileTags } from "@/server/services/catalog";
import { createCategory, createTopic } from "@/server/services/categories";
import { getAccess, grantManualSubscription, setSubscriptionStatus } from "@/server/services/entitlements";
import { ensureProfile } from "@/server/services/profile";
import { getFilterOptions, getLeaderboard, getViewerGlobalPosition } from "@/server/services/ranking";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  // Terça-feira, 10/03/2026 12:00 UTC.
  env.clock.set("2026-03-10T12:00:00.000Z");
});

async function newUser(name: string, opts: { area?: string; catalog?: string; premium?: boolean; admin?: boolean } = {}) {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name, email: `${name.toLowerCase()}-${id}@segredo.local` });
  await ensureProfile(env.db, id, name);
  const c = await createCategory(env.ctx, id, { name: "Estudos", areaId: opts.area ?? null });
  // A área do ranking vem do tema do catálogo: com `area`, usa um tema oficial daquela área.
  const AREA_TOPIC: Record<string, string> = { exatas: "Matemática", humanas: "História" };
  // Sem área: tema oficial "neutro" (Multidisciplinar) — tema inventado não pontua em ranking.
  const topicName = opts.catalog ?? (opts.area ? AREA_TOPIC[opts.area] : "Metodologia Científica");
  const t = await createTopic(env.ctx, id, { categoryId: c.id, name: topicName });
  if (opts.premium) await grantManualSubscription(env.ctx, id, new Date("2030-01-01"));
  if (opts.admin) await env.db.insert(userRoles).values({ userId: id, role: "admin" });
  return { id, topicId: t.id };
}

/** Um ciclo: estuda `minutes` (planejado `planned`) com heartbeats a cada 5 min. */
async function cycle(u: { id: string; topicId: string }, planned = 30, minutes = planned, methodId = "custom") {
  const s = await startSession(env.ctx, u.id, { topicId: u.topicId, methodId, plannedMinutes: planned });
  let left = minutes;
  while (left > 0) {
    const step = Math.min(5, left);
    env.clock.advance(step * 60);
    left -= step;
    await heartbeat(env.ctx, u.id, s.session!.id);
  }
  await finishSession(env.ctx, u.id, s.session!.id);
  env.clock.advance(60);
}

const week = { scope: "global" as const, period: "week" as const };

describe("Acesso premium", () => {
  it("11. administrador acessa o ranking sem assinatura", async () => {
    const admin = await newUser("Admin", { admin: true });
    expect((await getAccess(env.ctx, admin.id, "ranking")).reason).toBe("admin");
    const lb = await getLeaderboard(env.ctx, admin.id, week);
    expect(lb.status).toBe("ok");
  });

  it("12. usuário gratuito não acessa o ranking por chamada direta", async () => {
    const free = await newUser("Gratis");
    await expect(getLeaderboard(env.ctx, free.id, week)).rejects.toThrow(/assinantes/);
    await expect(getFilterOptions(env.ctx, free.id, "week")).rejects.toThrow(/assinantes/);
    expect(await getViewerGlobalPosition(env.ctx, free.id)).toBeNull();
  });

  it("13. assinatura libera ou bloqueia conforme o status real", async () => {
    const u = await newUser("Assinante");
    const sub = await grantManualSubscription(env.ctx, u.id, new Date("2026-04-10T00:00:00Z"));
    const allowed = async () => (await getAccess(env.ctx, u.id, "ranking")).allowed;
    expect(await allowed()).toBe(true);

    await setSubscriptionStatus(env.ctx, sub.id, "past_due");
    expect(await allowed()).toBe(true); // período pago ainda vale

    await setSubscriptionStatus(env.ctx, sub.id, "canceled");
    expect(await allowed()).toBe(true); // cancelada: acesso até o fim do período
    env.clock.set("2026-04-11T00:00:00Z");
    expect(await allowed()).toBe(false); // período acabou

    await setSubscriptionStatus(env.ctx, sub.id, "active", new Date("2026-05-11T00:00:00Z"));
    expect(await allowed()).toBe(true); // renovada
    await setSubscriptionStatus(env.ctx, sub.id, "expired");
    expect(await allowed()).toBe(false);
    await setSubscriptionStatus(env.ctx, sub.id, "incomplete");
    expect(await allowed()).toBe(false);
  });

  it("regra pura de status", () => {
    const now = new Date("2026-03-10");
    const future = new Date("2026-04-10");
    const past = new Date("2026-02-10");
    expect(subscriptionGrantsAccess({ status: "trialing", currentPeriodEnd: future }, now)).toBe(true);
    expect(subscriptionGrantsAccess({ status: "active", currentPeriodEnd: past }, now)).toBe(false);
    expect(subscriptionGrantsAccess({ status: "canceled", currentPeriodEnd: null }, now)).toBe(false);
  });
});

describe("Classificação", () => {
  it("ordena por XP; empate por tempo estudado e depois por quem chegou primeiro", async () => {
    const viewer = await newUser("Viewer", { premium: true });
    const a = await newUser("Ana");
    const b = await newUser("Bia");
    const c = await newUser("Caio");
    const d = await newUser("Duda");
    await cycle(a, 30);
    await cycle(a, 30); // 60 XP
    await cycle(b, 30, 30); // 30 XP, 30 min
    await cycle(d, 30, 30); // 30 XP, 30 min, mas depois de Bia
    await cycle(c, 30, 45); // 30 XP, 45 min (excedente desempata)

    const lb = await getLeaderboard(env.ctx, viewer.id, week);
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(lb.rows.map((r) => [r.displayName, r.xp])).toEqual([
      ["Ana", 60],
      ["Caio", 30],
      ["Bia", 30],
      ["Duda", 30],
    ]);
    expect(lb.viewer).toBeNull(); // sem XP, não aparece
  });

  it("expõe apenas dados públicos (sem e-mail nem identificadores)", async () => {
    const viewer = await newUser("Viewer", { premium: true });
    const a = await newUser("Ana");
    await cycle(a);
    await cycle(viewer);
    const lb = await getLeaderboard(env.ctx, viewer.id, week);
    const json = JSON.stringify(lb);
    expect(json).not.toContain("@segredo.local");
    expect(json).not.toContain(a.id);
    expect(json).not.toContain(viewer.id);
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(Object.keys(lb.rows[0]).sort()).toEqual(["change", "displayName", "goals", "institution", "isViewer", "platformSeconds", "position", "publicCode", "studiedSeconds", "title", "xp"]);
    expect(lb.viewer?.isViewer).toBe(true);
  });

  it("semana e mês reiniciam a contagem; 'sempre' acumula", async () => {
    const viewer = await newUser("Viewer", { premium: true });
    const a = await newUser("Ana");
    env.clock.set("2026-03-02T12:00:00.000Z"); // semana anterior
    await cycle(a);
    env.clock.set("2026-03-10T12:00:00.000Z");
    await cycle(viewer);

    const w = await getLeaderboard(env.ctx, viewer.id, week);
    const all = await getLeaderboard(env.ctx, viewer.id, { scope: "global", period: "all" });
    if (w.status !== "ok" || all.status !== "ok") throw new Error("status");
    expect(w.rows.map((r) => r.displayName)).toEqual(["Viewer"]);
    expect(all.rows.map((r) => r.displayName).sort()).toEqual(["Ana", "Viewer"]);
  });

  it("mostra a evolução da posição em relação a 24h atrás", async () => {
    const viewer = await newUser("Viewer", { premium: true });
    const a = await newUser("Ana");
    await cycle(a);
    await cycle(viewer, 20);
    env.clock.advance(25 * 3600);
    await cycle(viewer, 30); // passa a Ana
    const lb = await getLeaderboard(env.ctx, viewer.id, week);
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(lb.rows[0]).toMatchObject({ displayName: "Viewer", change: 1 });
    expect(lb.rows[1]).toMatchObject({ displayName: "Ana", change: -1 });
  });
});

describe("Recortes", () => {
  async function redesId() {
    const [t] = await env.db.select().from(catalogTopics).where(eq(catalogTopics.normalizedName, normalizeTerm("Redes de Computadores")));
    return t.id;
  }

  it("recorte com menos de 5 participantes não aparece; com 5 aparece. O Geral sempre aparece", async () => {
    const viewer = await newUser("Viewer", { premium: true, area: "exatas" });
    await cycle(viewer);
    const others = [];
    for (const n of ["A", "B", "C"]) others.push(await newUser(n, { area: "exatas" }));
    for (const o of others) await cycle(o);

    const filter = { scope: "filter" as const, period: "week" as const, areaId: "exatas" };
    const few = await getLeaderboard(env.ctx, viewer.id, filter);
    expect(few).toMatchObject({ status: "insufficient", participants: 4, minParticipants: 5 });

    const e = await newUser("E", { area: "exatas" });
    await cycle(e);
    expect((await getLeaderboard(env.ctx, viewer.id, filter)).status).toBe("ok");
    expect((await getLeaderboard(env.ctx, viewer.id, week)).status).toBe("ok");
  });

  it("filtros se combinam: área + tema + método", async () => {
    const redes = await redesId();
    const viewer = await newUser("Viewer", { premium: true, area: "exatas", catalog: "Redes de Computadores" });
    const users = [viewer];
    for (const n of ["A", "B", "C", "D"]) users.push(await newUser(n, { area: "exatas", catalog: "Redes de Computadores" }));
    const outsider = await newUser("Fora", { area: "humanas" });
    for (const u of users) await cycle(u, 25, 25, "pomodoro_classic");
    await cycle(users[1], 30); // personalizado: não conta no filtro Pomodoro
    await cycle(outsider);

    const lb = await getLeaderboard(env.ctx, viewer.id, {
      scope: "filter",
      period: "week",
      areaId: "exatas",
      topicId: redes,
      methodId: "pomodoro_classic",
    });
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(lb.title).toBe("Ciências Exatas e da Terra · Redes de Computadores · Pomodoro clássico");
    expect(lb.participants).toBe(5);
    expect(lb.rows.every((r) => r.xp === 25)).toBe(true);
    expect(lb.rows.map((r) => r.displayName)).not.toContain("Fora");
  });

  it("Meu geral exige tags e soma só as áreas/temas marcados", async () => {
    const viewer = await newUser("Viewer", { premium: true, area: "exatas" });
    expect((await getLeaderboard(env.ctx, viewer.id, { scope: "mine", period: "week" })).status).toBe("needs_tags");

    await setProfileTags(env.ctx, viewer.id, { areaIds: ["exatas"], catalogTopicIds: [], goalIds: [] });
    const people = [viewer];
    for (const n of ["A", "B", "C", "D"]) people.push(await newUser(n, { area: "exatas" }));
    const humanas = await newUser("Hum", { area: "humanas" });
    for (const p of people) await cycle(p);
    await cycle(humanas);
    await cycle(humanas);

    const mine = await getLeaderboard(env.ctx, viewer.id, { scope: "mine", period: "week" });
    if (mine.status !== "ok") throw new Error(mine.status);
    expect(mine.participants).toBe(5);
    expect(mine.rows.map((r) => r.displayName)).not.toContain("Hum");

    const opts = await getFilterOptions(env.ctx, viewer.id, "week");
    expect(opts.areas).toEqual([{ id: "exatas", name: "Ciências Exatas e da Terra", participants: 5 }]);
  });
});
