import { beforeEach, describe, expect, it } from "vitest";
import { organizationMembers, organizations, userRoles } from "@/server/db/schema";
import { getCompanyStats, getInstitutionStats, getMasterOverview } from "@/server/services/master";
import { isAdmin, isMaster } from "@/server/services/profile";
import { createProject } from "@/server/services/projects";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { eq } from "drizzle-orm";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

const checks = { cnpjActive: true, educationActivity: null, corporateDomain: true, domainMatchesCnpj: true, requesterIsMember: true, emailConfirmed: true };

describe("Console master", () => {
  it("só o papel master entra; master também conta como admin", async () => {
    const u = await createUser(env.ctx, "Dono");
    await expect(getMasterOverview(env.ctx, u.id)).rejects.toThrow(/Acesso restrito/);
    await env.db.insert(userRoles).values({ userId: u.id, role: "master" });
    expect(await isMaster(env.db, u.id)).toBe(true);
    expect(await isAdmin(env.db, u.id)).toBe(true);
    const o = await getMasterOverview(env.ctx, u.id);
    expect(o.users.total).toBe(1);
    const admin = await createUser(env.ctx, "Admin");
    await env.db.insert(userRoles).values({ userId: admin.id, role: "admin" });
    await expect(getCompanyStats(env.ctx, admin.id)).rejects.toThrow(/Acesso restrito/);
  });

  it("ranking de empresas: funcionários, horas e projetos concluídos; instituições cadastradas", async () => {
    const master = await createUser(env.ctx, "Dono");
    await env.db.insert(userRoles).values({ userId: master.id, role: "master" });
    const func = await createUser(env.ctx, "Func");
    const [org] = await env.db
      .insert(organizations)
      .values({
        kind: "company", cnpj: "11444777000161", legalName: "ACME", alias: "Acme", requesterUserId: func.id,
        requesterRole: "CEO", contactEmail: "a@acme.com.br", message: "x", status: "approved", checks,
      })
      .returning();
    await env.db.insert(organizationMembers).values({ organizationId: org.id, userId: func.id, role: "owner", status: "active", joinedAt: env.clock.now() });
    const p = await createProject(env.ctx, func.id, { context: "professional", name: "Site" });
    const { projects } = await import("@/server/db/schema");
    await env.db.update(projects).set({ organizationId: org.id, status: "done" }).where(eq(projects.id, p.id));
    await env.db.update(projects).set({ status: "active" }).where(eq(projects.id, p.id));
    const s = await startSession(env.ctx, func.id, { projectId: p.id, methodId: "custom", plannedMinutes: 30 });
    for (let i = 0; i < 6; i++) {
      env.clock.advance(300);
      await heartbeat(env.ctx, func.id, s.session!.id);
    }
    await finishSession(env.ctx, func.id, s.session!.id);
    await env.db.update(projects).set({ status: "done" }).where(eq(projects.id, p.id));

    const [row] = await getCompanyStats(env.ctx, master.id);
    expect(row).toMatchObject({ name: "Acme", employees: 1, seconds: 30 * 60, projects: 1, projectsDone: 1, xp: 30, monthlyRevenueCents: null });
    expect(await getInstitutionStats(env.ctx, master.id)).toEqual([]);
  });
});
