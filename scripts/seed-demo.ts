/**
 * Cenário de demonstração com contas fictícias (e-mails @focus.demo) para conhecer todas as telas:
 * alunos aceitos e pendentes, professor-gestor, reitoria, empresa com gestores e funcionários,
 * pessoas sem vínculo, amigos, projetos (inclusive pedidos de transferência), histórico de
 * sessões das últimas semanas (rankings, medalhas e conquistas) e um pedido de cadastro na fila.
 *
 *   npm run demo:seed            (com o servidor parado — o PGlite aceita um processo por vez)
 *   npm run demo:seed -- --reset (apaga as contas de demonstração e cria tudo de novo)
 *
 * A senha das contas é gerada na hora e gravada em data/demo/CONTAS-DEMO.md (pasta fora do Git).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { and, eq, ilike, inArray, like } from "drizzle-orm";
import { normalizeTerm } from "../src/domain/catalog";
import { getDb } from "../src/server/db";
import {
  account,
  appSettings,
  institutionMemberships,
  institutions,
  organizationMembers,
  organizations,
  profiles,
  projects,
  user,
  userIdentity,
} from "../src/server/db/schema";
import { enrollmentHmac } from "../src/server/identity-crypto";
import { createCategory, createTopic } from "../src/server/services/categories";
import type { Ctx } from "../src/server/services/common";
import { grantManualSubscription } from "../src/server/services/entitlements";
import { respondFriendRequest, sendFriendRequest } from "../src/server/services/friends";
import { joinInstitution } from "../src/server/services/institutions";
import { addToRoster, requestCompanyLink } from "../src/server/services/membership";
import { assignToOrgProject, createOrgProject, updateOrgPublicPage } from "../src/server/services/organizations";
import { ensureProfile, setActiveContext } from "../src/server/services/profile";
import { moveProject } from "../src/server/services/project-moves";
import { createProject, createTask, inviteMember, respondInvite, setTaskDone, updateProject } from "../src/server/services/projects";
import { finishSession, heartbeat, startSession } from "../src/server/services/timer";
import { applyDemoSchedule, demoScheduleSessions } from "./demo-schedule";

const DOMAIN = "focus.demo";
const DAY = 86_400_000;

/** Gerador pseudoaleatório com semente (o cenário sai igual a cada execução). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** CNPJ válido a partir de 12 dígitos. */
function cnpj(base12: string) {
  const calc = (d: string, w: number[]) => {
    const r = w.reduce((a, x, i) => a + Number(d[i]) * x, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

const CHECKS = {
  cnpjActive: true,
  educationActivity: true,
  corporateDomain: true,
  domainMatchesCnpj: true,
  requesterIsMember: true,
  emailConfirmed: true,
};

async function main() {
  const reset = process.argv.includes("--reset");
  const db = await getDb();
  const clock = { t: Date.now() };
  const ctx: Ctx = { db, now: () => new Date(clock.t) };
  const realNow = Date.now();

  const existing = await db.select({ id: user.id }).from(user).where(like(user.email, `%@${DOMAIN}`));
  if (existing.length) {
    if (!reset) throw new Error(`Já existem ${existing.length} contas de demonstração. Use --reset para recriar.`);
    const ids = existing.map((u) => u.id);
    await db.delete(projects).where(inArray(projects.ownerUserId, ids));
    await db.delete(organizations).where(inArray(organizations.requesterUserId, ids));
    await db.delete(user).where(inArray(user.id, ids));
    console.log(`${ids.length} contas de demonstração apagadas.`);
  }

  // Com poucas contas de demonstração, as instituições entram no ranking com 5 alunos ativos.
  const [catalogRow] = await db.select().from(appSettings).where(eq(appSettings.key, "catalog"));
  const previousMin = (catalogRow?.value as { institutionMinActive?: number })?.institutionMinActive;

  const password = `Demo-${randomBytes(6).toString("hex")}`;
  const hash = await hashPassword(password);
  const people: { email: string; name: string; role: string }[] = [];

  async function person(slug: string, name: string, role: string, opts: { cpf?: boolean; premium?: boolean } = {}) {
    const id = randomUUID();
    const email = `${slug}@${DOMAIN}`;
    await db.insert(user).values({ id, name, email, emailVerified: true });
    await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    await ensureProfile(db, id, name);
    if (opts.cpf !== false) {
      await db.insert(userIdentity).values({
        userId: id,
        cpfHmac: `demo-${randomUUID()}`,
        cpfLastDigits: String(Math.floor(Math.random() * 90) + 10),
        birthYear: 2000,
        verificationProvider: "demo",
        verifiedAt: new Date(),
      });
    }
    if (opts.premium !== false) await grantManualSubscription(ctx, id, new Date(realNow + 365 * DAY));
    people.push({ email, name, role });
    return id;
  }
  const codeOf = async (id: string) =>
    (await db.select({ c: profiles.publicCode }).from(profiles).where(eq(profiles.userId, id)))[0].c!;

  // ---------------------------------------------------------------- Instituições (base e-MEC)
  async function findInstitution(pattern: string, fallback: { name: string; acronym: string; city: string }) {
    const [i] = await db
      .select()
      .from(institutions)
      .where(and(eq(institutions.kind, "higher"), ilike(institutions.normalizedName, `%${normalizeTerm(pattern)}%`)))
      .limit(1);
    if (i) return i;
    const [created] = await db
      .insert(institutions)
      .values({ kind: "higher", source: "admin", sourceCode: `demo-${fallback.acronym}`, name: fallback.name, acronym: fallback.acronym, normalizedName: normalizeTerm(fallback.name), city: fallback.city, uf: "MG" })
      .returning();
    return created;
  }
  const puc = await findInstitution("catolica de minas gerais", { name: "Pontifícia Universidade Católica de Minas Gerais", acronym: "PUC Minas", city: "Belo Horizonte" });
  const ufmg = await findInstitution("universidade federal de minas gerais", { name: "Universidade Federal de Minas Gerais", acronym: "UFMG", city: "Belo Horizonte" });

  // ---------------------------------------------------------------- Pessoas
  const reitora = await person("reitoria.puc", "Helena Duarte", "Dona da organização PUC Minas (instituição verificada)");
  const clovis = await person("clovis.professor", "Clóvis Andrade", "Professor — gestor na PUC Minas (cria projetos e designa alunos)");
  const pucNames = ["Ana Lima", "Bruno Costa", "Carla Souza", "Daniel Rocha", "Eduarda Melo", "Felipe Nunes"];
  const pucStudents: string[] = [];
  for (const [i, n] of pucNames.entries()) {
    pucStudents.push(await person(`aluno${i + 1}.puc`, n, i === 0 ? "Aluna aceita na PUC Minas (Turma A) — veja o perfil Acadêmico" : "Aluno(a) aceito(a) na PUC Minas"));
  }
  const pendente = await person("aluno.pendente", "Diego Pereira", "Aluno com vínculo PENDENTE na PUC Minas (aparece na fila da instituição)");
  const ufmgNames = ["Gabriela Torres", "Henrique Alves", "Isabela Ramos", "Júlio Martins", "Larissa Pinto"];
  const ufmgStudents: string[] = [];
  for (const [i, n] of ufmgNames.entries()) ufmgStudents.push(await person(`aluno${i + 1}.ufmg`, n, "Aluno(a) da UFMG (vínculo declarado: UFMG não tem conta na Focus)"));
  const rafael = await person("rafael.ceo", "Rafael Moreira", "Dono da empresa Acme Tecnologia (empresa verificada)");
  const paula = await person("paula.gestora", "Paula Ribeiro", "Gestora na Acme (cria e designa projetos; moveu um projeto para o Pessoal)");
  const lucas = await person("lucas.dev", "Lucas Ferreira", "Funcionário aceito na Acme — pediu para mover um projeto (veja a fila do Rafael)");
  const marina = await person("marina.qa", "Marina Castro", "Funcionária aceita na Acme (área Qualidade)");
  const joao = await person("joao.novo", "João Teixeira", "Funcionário com pedido PENDENTE na Acme");
  const sofia = await person("sofia.semvinculo", "Sofia Mendes", "Sem vínculo: estuda pela área Acadêmica do Pessoal (ranking geral + amigos)");
  const pedro = await person("pedro.concurso", "Pedro Lopes", "Sem vínculo, sem assinatura: vê o convite para o Premium no ranking", { premium: false });
  const escola = await person("diretora.escola", "Marta Silva", "Pediu cadastro de uma escola — está na fila de análise do admin/master");

  // ---------------------------------------------------------------- Organizações verificadas
  async function org(kind: "institution" | "company", owner: string, alias: string, legalName: string, base12: string, email: string, institutionId?: string) {
    const [o] = await db
      .insert(organizations)
      .values({
        kind,
        cnpj: cnpj(base12),
        legalName,
        alias,
        institutionId: institutionId ?? null,
        requesterUserId: owner,
        requesterRole: kind === "institution" ? "Reitora" : "CEO",
        contactEmail: email,
        message: "Organização de demonstração da Focus.",
        status: "approved",
        checks: { ...CHECKS, educationActivity: kind === "institution" ? true : null },
        approvedAt: new Date(realNow - 60 * DAY),
        reviewNote: "Demonstração",
      })
      .returning();
    await db.insert(organizationMembers).values({ organizationId: o.id, userId: owner, role: "owner", status: "active", joinedAt: new Date(realNow - 60 * DAY) });
    return o.id;
  }
  const pucOrg = await org("institution", reitora, "PUC Minas", "SOCIEDADE MINEIRA DE CULTURA (DEMO)", "990000010001", "reitoria@pucminas.demo", puc.id);
  await updateOrgPublicPage(ctx, reitora, pucOrg, {
    about: "Uma das maiores universidades católicas do país, com campi em Belo Horizonte e no interior de Minas. (Texto de demonstração.)",
    whyStudy: "Laboratórios abertos, projetos integradores desde o 1º período e parceria com empresas da região. (Texto de demonstração.)",
    website: "https://www.pucminas.br",
  });
  const acme = await org("company", rafael, "Acme Tecnologia", "ACME TECNOLOGIA LTDA (DEMO)", "990000020001", "rh@acme.demo");
  await db.insert(organizations).values({
    kind: "institution",
    cnpj: cnpj("990000030001"),
    legalName: "COLÉGIO HORIZONTE (DEMO)",
    alias: "Colégio Horizonte",
    requesterUserId: escola,
    requesterRole: "Diretora",
    // Domínio reservado para exemplos (RFC 2606): não pertence a ninguém.
    contactEmail: "diretoria@colegiohorizonte.example",
    message: "Somos uma escola de ensino médio e queremos acompanhar os alunos no ENEM. (Demonstração.)",
    status: "pending_review",
    checks: { ...CHECKS, corporateDomain: false, domainMatchesCnpj: false },
  });

  const joined = new Date(realNow - 50 * DAY);
  const member = async (orgId: string, userId: string, role: "manager" | "member", area: string | null) =>
    db.insert(organizationMembers).values({ organizationId: orgId, userId, role, area, status: "active", joinedAt: joined });

  // PUC: professor gestor + alunos aceitos (vínculo da instituição ativo) em duas turmas.
  await member(pucOrg, clovis, "manager", "Engenharia de Software");
  for (const [i, s] of pucStudents.entries()) {
    await db.insert(institutionMemberships).values({ userId: s, institutionId: puc.id, enrollmentHmac: enrollmentHmac(puc.id, `2026${100 + i}`), status: "active", joinedAt: joined });
    await member(pucOrg, s, "member", i < 3 ? "Turma A" : "Turma B");
  }
  // UFMG sem conta: vínculo declarado, ativo direto.
  for (const [i, s] of ufmgStudents.entries()) {
    await db.insert(institutionMemberships).values({ userId: s, institutionId: ufmg.id, enrollmentHmac: enrollmentHmac(ufmg.id, `UF${300 + i}`), status: "active", joinedAt: joined });
  }
  // Lista de matrículas da PUC (aceite automático) e um aluno pendente fora da lista.
  await addToRoster(ctx, reitora, pucOrg, ["2026100", "2026101", "2026102", "2026103", "2026104", "2026105", "2026200", "2026201"]);
  await joinInstitution(ctx, pendente, { institutionId: puc.id, enrollment: "2026-999" });

  // Acme: gestora + funcionários aceitos, um pendente.
  await member(acme, paula, "manager", "Produto");
  await member(acme, lucas, "member", "Desenvolvimento");
  await member(acme, marina, "member", "Qualidade");
  await addToRoster(ctx, rafael, acme, ["ACM-01", "ACM-02", "ACM-03"]);
  await requestCompanyLink(ctx, joao, acme, "ACM-77");

  // ---------------------------------------------------------------- Categorias e temas
  async function studyTopics(userId: string, context: "academic" | "personal", names: string[]) {
    const c = await createCategory(ctx, userId, { name: context === "academic" ? "Faculdade" : "Estudos", context, usage: "academic" });
    const out: string[] = [];
    for (const n of names) out.push((await createTopic(ctx, userId, { categoryId: c.id, name: n })).id);
    return out;
  }
  const topicSets = [
    ["Algoritmos", "Cálculo I", "Banco de Dados"],
    ["Genética", "Bioquímica", "Anatomia Humana"],
    ["Direito Civil", "Direito Constitucional", "Filosofia do Direito"],
    ["Estequiometria", "Logaritmos", "Revolução Francesa"],
  ];
  const plan: { userId: string; topics: string[]; intensity: number }[] = [];
  for (const [i, s] of pucStudents.entries()) plan.push({ userId: s, topics: await studyTopics(s, "academic", topicSets[i % 4]), intensity: 1.2 - i * 0.12 });
  for (const [i, s] of ufmgStudents.entries()) plan.push({ userId: s, topics: await studyTopics(s, "personal", topicSets[(i + 1) % 4]), intensity: 0.9 - i * 0.1 });
  plan.push({ userId: pendente, topics: await studyTopics(pendente, "personal", topicSets[0]), intensity: 0.6 });
  plan.push({ userId: sofia, topics: await studyTopics(sofia, "personal", topicSets[3]), intensity: 1.0 });
  plan.push({ userId: pedro, topics: await studyTopics(pedro, "personal", ["Direito Administrativo", "Raciocínio Lógico", "Língua Portuguesa"]), intensity: 0.7 });
  // Um hobby (área pessoal) da Sofia: conta nas horas, fora dos rankings.
  const hobbyCat = await createCategory(ctx, sofia, { name: "Violão", context: "personal", usage: "personal" });
  const hobby = await createTopic(ctx, sofia, { categoryId: hobbyCat.id, name: "Escalas" });

  // ---------------------------------------------------------------- Projetos
  const integrador = await createOrgProject(ctx, clovis, pucOrg, { name: "Projeto Integrador 2026/1", targetMinutes: 60 * 120, dueDate: new Date(realNow + 30 * DAY).toISOString().slice(0, 10) });
  for (const s of pucStudents.slice(0, 4)) await assignToOrgProject(ctx, clovis, pucOrg, integrador.id, s);
  const tLev = await createTask(ctx, clovis, integrador.id, { title: "Levantamento de requisitos", targetMinutes: 600, assigneeUserId: pucStudents[0] });
  const tProto = await createTask(ctx, clovis, integrador.id, { title: "Protótipo navegável", targetMinutes: 900, assigneeUserId: pucStudents[1] });
  await createTask(ctx, clovis, integrador.id, { title: "Apresentação final", targetMinutes: 300 });

  const site = await createOrgProject(ctx, paula, acme, { name: "Novo site institucional", targetMinutes: 60 * 200 });
  for (const f of [lucas, marina]) await assignToOrgProject(ctx, paula, acme, site.id, f);
  const tFront = await createTask(ctx, paula, site.id, { title: "Front-end das páginas", targetMinutes: 2400, assigneeUserId: lucas });
  await createTask(ctx, paula, site.id, { title: "Testes de acessibilidade", targetMinutes: 900, assigneeUserId: marina });
  const app = await createOrgProject(ctx, rafael, acme, { name: "App de pedidos", targetMinutes: 60 * 80 });
  await assignToOrgProject(ctx, rafael, acme, app.id, lucas);
  await updateProject(ctx, rafael, app.id, { status: "done" });

  const enem = await createProject(ctx, sofia, { context: "personal", name: "Preparação ENEM 2026", targetMinutes: 60 * 300 });
  await inviteMember(ctx, sofia, enem.id, await codeOf(pedro));
  await respondInvite(ctx, pedro, enem.id, true);
  await createTask(ctx, sofia, enem.id, { title: "Redação: 1 por semana", targetMinutes: 1200 });
  await createTask(ctx, pedro, enem.id, { title: "Lista de matemática" });
  const leitura = await createProject(ctx, sofia, { context: "personal", name: "Ler 12 livros", targetMinutes: 60 * 60 });
  await inviteMember(ctx, sofia, leitura.id, await codeOf(pucStudents[0]));

  // ---------------------------------------------------------------- Histórico de sessões (6 semanas)
  const random = rng(42);
  async function session(userId: string, input: { topicId?: string; projectId?: string; taskId?: string | null }, startAt: number, minutes: number, methodId = "custom") {
    if (startAt + minutes * 60_000 > realNow - 5 * 60_000) return;
    clock.t = startAt;
    const s = await startSession(ctx, userId, { ...input, methodId, plannedMinutes: methodId === "custom" ? minutes : undefined });
    let left = methodId === "pomodoro_classic" ? 25 : minutes;
    while (left > 0) {
      const step = Math.min(8, left);
      clock.t += step * 60_000;
      left -= step;
      await heartbeat(ctx, userId, s.session!.id);
    }
    await finishSession(ctx, userId, s.session!.id);
  }
  const dayStart = (daysAgo: number, hour: number) => {
    const d = new Date(realNow - daysAgo * DAY);
    d.setHours(hour, Math.floor(random() * 50), 0, 0);
    return d.getTime();
  };
  let sessions = 0;
  for (const p of plan) {
    for (let daysAgo = 42; daysAgo >= 0; daysAgo--) {
      if (random() > 0.55 * p.intensity + 0.15) continue;
      const count = 1 + Math.floor(random() * 3 * p.intensity);
      let hour = 7 + Math.floor(random() * 10);
      for (let k = 0; k < count && hour < 23; k++) {
        const pomodoro = random() < 0.4;
        const minutes = pomodoro ? 25 : 25 + Math.floor(random() * 4) * 10;
        await session(p.userId, { topicId: p.topics[Math.floor(random() * p.topics.length)] }, dayStart(daysAgo, hour), minutes, pomodoro ? "pomodoro_classic" : "custom");
        sessions++;
        hour += 1 + Math.floor(random() * 2);
      }
    }
  }
  // Projetos: integrador (alunos), site (funcionários), ENEM (amigos), hobby da Sofia.
  for (let daysAgo = 30; daysAgo >= 1; daysAgo -= 2) {
    await session(pucStudents[0], { projectId: integrador.id, taskId: tLev.id }, dayStart(daysAgo, 20), 40);
    await session(pucStudents[1], { projectId: integrador.id, taskId: tProto.id }, dayStart(daysAgo, 21), 50);
    await session(lucas, { projectId: site.id, taskId: tFront.id }, dayStart(daysAgo, 10), 50);
    await session(marina, { projectId: site.id }, dayStart(daysAgo, 14), 40);
    await session(paula, { projectId: site.id }, dayStart(daysAgo, 16), 30);
    await session(sofia, { projectId: enem.id }, dayStart(daysAgo, 19), 45);
    await session(sofia, { topicId: hobby.id }, dayStart(daysAgo, 22), 30);
    sessions += 7;
  }
  await setTaskDone(ctx, pucStudents[0], integrador.id, tLev.id, true);
  // Cronograma (Gantt) do projeto integrador: fases, datas e dependências.
  const sched = await applyDemoSchedule(ctx, integrador.id);
  await demoScheduleSessions({ ...ctx, setNow: (t: number) => (clock.t = t) }, integrador.id, sched.ids, sched.start);

  // ---------------------------------------------------------------- Mudanças de perfil e pedidos
  clock.t = realNow;
  // Paula (gestora) tira um projeto dela da empresa: a Acme vê riscado.
  const pesquisa = await createOrgProject(ctx, paula, acme, { name: "Pesquisa de mercado (antiga)" });
  await session(paula, { projectId: pesquisa.id }, dayStart(10, 9), 40);
  clock.t = realNow;
  await moveProject(ctx, paula, pesquisa.id, { context: "personal", organizationId: null });
  // Lucas (não criou) pede para levar o "Novo site" para o Pessoal: pedido na fila da Paula.
  await moveProject(ctx, lucas, site.id, { context: "personal", organizationId: null });

  // ---------------------------------------------------------------- Amigos
  await sendFriendRequest(ctx, sofia, await codeOf(pucStudents[0]));
  await respondFriendRequest(ctx, pucStudents[0], await codeOf(sofia), true);
  await sendFriendRequest(ctx, sofia, await codeOf(pedro));
  await respondFriendRequest(ctx, pedro, await codeOf(sofia), true);
  await sendFriendRequest(ctx, pucStudents[1], await codeOf(sofia)); // pedido aguardando a Sofia
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, "focus.developer@outlook.com"));
  if (owner) await sendFriendRequest(ctx, sofia, await codeOf(owner.id)).catch(() => undefined);

  // Perfis em uso ao entrar: aluna e funcionário já abrem no perfil liberado.
  await setActiveContext(ctx, pucStudents[0], "academic");
  await setActiveContext(ctx, clovis, "academic");
  await setActiveContext(ctx, reitora, "academic");
  await setActiveContext(ctx, lucas, "professional");
  await setActiveContext(ctx, paula, "professional");
  await setActiveContext(ctx, rafael, "professional");

  // ---------------------------------------------------------------- Credenciais
  mkdirSync("data/demo", { recursive: true });
  const lines = [
    "# Contas de demonstração da Focus (fictícias)",
    "",
    "Todas usam a mesma senha. Geradas por `npm run demo:seed`; rode de novo com `--reset` para recriar.",
    "",
    `**Senha:** \`${password}\``,
    "",
    "| E-mail | Nome | Papel / o que observar |",
    "|---|---|---|",
    ...people.map((p) => `| ${p.email} | ${p.name} | ${p.role} |`),
    "",
    `Sessões de foco criadas: ${sessions} (últimas 6 semanas).`,
    previousMin && previousMin > 5
      ? "Obs.: o mínimo de alunos ativos para o ranking entre instituições foi reduzido para 5 (só no banco local) para as duas universidades aparecerem."
      : "",
  ];
  writeFileSync("data/demo/CONTAS-DEMO.md", lines.join("\n"));
  if (catalogRow && (previousMin ?? 10) > 5) {
    await db.update(appSettings).set({ value: { ...(catalogRow.value as object), institutionMinActive: 5 } }).where(eq(appSettings.key, "catalog"));
  }
  console.log(`${people.length} contas criadas, ${sessions} sessões. Credenciais em data/demo/CONTAS-DEMO.md`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
