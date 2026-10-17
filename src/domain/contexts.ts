/**
 * Contextos da conta: uma pessoa (um CPF) separa o uso em Acadêmico, Pessoal e Profissional.
 * O tempo de um contexto nunca aparece em outro. Só o Acadêmico entra nos rankings gerais
 * (por área, tema e instituição); Pessoal e Profissional têm rankings próprios (projetos).
 */
export const CONTEXTS = ["academic", "personal", "professional"] as const;
export type AppContext = (typeof CONTEXTS)[number];
export const DEFAULT_CONTEXT: AppContext = "academic";

export function isAppContext(v: unknown): v is AppContext {
  return typeof v === "string" && (CONTEXTS as readonly string[]).includes(v);
}

/** Sessões e XP deste contexto entram nos rankings gerais? */
export const isRankedContext = (c: AppContext) => c === "academic";

/**
 * Área de utilização de uma categoria. No perfil Pessoal a pessoa escolhe entre Pessoal,
 * Profissional e Acadêmica; nos perfis Acadêmico e Profissional ela é fixa.
 */
export const USAGES = ["personal", "professional", "academic"] as const;
export type Usage = (typeof USAGES)[number];

/** Área de utilização obrigatória de cada perfil (o Pessoal deixa escolher). */
export const usageForContext = (c: AppContext, chosen?: Usage | null): Usage =>
  c === "academic" ? "academic" : c === "professional" ? "professional" : (chosen ?? "personal");

/**
 * A categoria pode entrar no ranking acadêmico geral? Perfil Acadêmico ou área Acadêmica do
 * perfil Pessoal. (A sessão só pontua se o tema estiver vinculado ao catálogo oficial.)
 */
export const isRankedCategory = (c: { context: AppContext; usage: Usage }) =>
  c.context !== "professional" && c.usage === "academic";

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_LIMITS = {
  /** Membros ativos + convites pendentes por projeto. */
  maxMembers: 50,
  maxTasks: 200,
  /** Horas a cumprir (em minutos): até 10.000 h. */
  maxTargetMinutes: 600_000,
} as const;

/**
 * No cronômetro, o "assunto" de uma sessão é um tema (Estude) ou um projeto, opcionalmente
 * com tarefa (Projetos). A seleção trafega como texto: tema = id; projeto = "p:<id>";
 * tarefa = "t:<id>".
 */
export type Subject = { kind: "topic"; topicId: string } | { kind: "project"; projectId: string; taskId: string | null };

export const projectKey = (projectId: string) => `p:${projectId}`;
export const taskKey = (taskId: string) => `t:${taskId}`;

/** Converte a seleção (grupo + item) do cronômetro em assunto da sessão. */
export function subjectFromSelection(groupKey: string, itemKey: string): Subject | null {
  if (groupKey.startsWith("p:")) {
    const projectId = groupKey.slice(2);
    if (!projectId) return null;
    if (itemKey.startsWith("t:")) return { kind: "project", projectId, taskId: itemKey.slice(2) || null };
    return { kind: "project", projectId, taskId: null };
  }
  return itemKey ? { kind: "topic", topicId: itemKey } : null;
}
