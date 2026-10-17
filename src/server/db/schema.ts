import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CONTEXTS, PROJECT_STATUSES, USAGES } from "@/domain/contexts";
import type { Feature, SubscriptionStatus } from "@/domain/entitlements";
import { ORG_ROLES, ORGANIZATION_KINDS, ORGANIZATION_STATUSES, type OrgChecks } from "@/domain/organizations";
import type { MethodRules } from "@/domain/methods";

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------------------
// Better Auth (nomes de modelo/campos esperados pela biblioteca)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tsz("created_at").notNull().defaultNow(),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: tsz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tsz("access_token_expires_at"),
    refreshTokenExpiresAt: tsz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tsz("expires_at").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Aplicação
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** Código público e exclusivo da conta (ex.: FCS-7K2Q9XMP). Nunca revela o id interno. */
    publicCode: text("public_code").unique(),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    /** Idioma preferido (e-mails e próxima sessão). */
    locale: text("locale").notNull().default("pt-BR"),
    alarmVolume: smallint("alarm_volume").notNull().default(80),
    /** Contexto em uso (Acadêmico, Pessoal ou Profissional): filtra Categoria, Foque, Painel e Histórico. */
    activeContext: text("active_context", { enum: CONTEXTS }).notNull().default("academic"),
    /** Saldo de XP. Só o servidor altera, junto com uma linha em xp_transactions. */
    xpBalance: integer("xp_balance").notNull().default(0),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("profiles_xp_balance_non_negative", sql`${t.xpBalance} >= 0`),
    check("profiles_alarm_volume_range", sql`${t.alarmVolume} between 0 and 100`),
    index("profiles_xp_balance_idx").on(t.xpBalance),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "master"] }).notNull(),
    grantedAt: tsz("granted_at").notNull().defaultNow(),
    grantedBy: text("granted_by"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const studyMethods = pgTable("study_methods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  rules: jsonb("rules").$type<MethodRules>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    /** Área principal (organização/sugestões). Nos rankings vale a área do tema do catálogo. */
    areaId: text("area_id").references(() => knowledgeAreas.id),
    /**
     * Contexto da categoria. Só "academic" entra nos rankings gerais. Sair do Acadêmico é mão única:
     * uma categoria pessoal ou profissional nunca volta para os rankings.
     */
    context: text("context", { enum: CONTEXTS }).notNull().default("academic"),
    /** Área de utilização (no perfil Pessoal: pessoal, profissional ou acadêmica). */
    usage: text("usage", { enum: USAGES }).notNull().default("academic"),
    archivedAt: tsz("archived_at"),
    deletedAt: tsz("deleted_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("categories_user_idx").on(t.userId),
    uniqueIndex("categories_user_name_uq")
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    /** Tema do catálogo vinculado (opcional). */
    catalogTopicId: uuid("catalog_topic_id").references(() => catalogTopics.id),
    /** Nome padronizado (normalizeTerm), para casar com o catálogo sem varrer a tabela. */
    normalizedName: text("normalized_name"),
    archivedAt: tsz("archived_at"),
    deletedAt: tsz("deleted_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("topics_user_idx").on(t.userId),
    index("topics_catalog_idx").on(t.catalogTopicId),
    index("topics_unlinked_normalized_idx")
      .on(t.normalizedName)
      .where(sql`${t.catalogTopicId} is null and ${t.deletedAt} is null`),
    index("topics_category_idx").on(t.categoryId),
    uniqueIndex("topics_category_name_uq")
      .on(t.categoryId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const SESSION_STATUSES = ["running", "paused", "finished", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Assunto da sessão: tema (Estude) ou projeto, com tarefa opcional (Projetos). */
    topicId: uuid("topic_id").references(() => topics.id),
    categoryId: uuid("category_id").references(() => categories.id),
    projectId: uuid("project_id").references(() => projects.id),
    taskId: uuid("task_id").references(() => projectTasks.id),
    /** Contexto no início da sessão (Acadêmico, Pessoal ou Profissional). */
    context: text("context", { enum: CONTEXTS }).notNull().default("academic"),
    methodId: text("method_id")
      .notNull()
      .references(() => studyMethods.id),
    /** Conta nos rankings gerais? Só sessões acadêmicas de Estude (gravado no início da sessão). */
    ranked: boolean("ranked").notNull().default(true),
    /** Área e tema do catálogo no início da sessão (base dos rankings por área/tema). */
    areaId: text("area_id").references(() => knowledgeAreas.id),
    catalogTopicId: uuid("catalog_topic_id").references(() => catalogTopics.id),
    /** Regras do método no momento do início: mudanças futuras não alteram o passado. */
    rulesSnapshot: jsonb("rules_snapshot").$type<MethodRules>().notNull(),
    plannedSeconds: integer("planned_seconds").notNull(),
    status: text("status", { enum: SESSION_STATUSES }).notNull(),
    startedAt: tsz("started_at").notNull(),
    endedAt: tsz("ended_at"),
    lastHeartbeatAt: tsz("last_heartbeat_at").notNull(),
    /** Preenchidos ao encerrar; durante a sessão o tempo vem dos segmentos. */
    activeSeconds: integer("active_seconds").notNull().default(0),
    overtimeSeconds: integer("overtime_seconds").notNull().default(0),
    /** Tempo em pausa (registrado à parte: não conta como estudo nem gera XP). */
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    cycleIndex: integer("cycle_index").notNull().default(1),
    endReason: text("end_reason", {
      enum: ["user_finished", "break_started", "heartbeat_timeout", "pause_timeout"],
    }),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),
    /**
     * Correção feita pela própria pessoa (só para menos): tempo reduzido ou sessão excluída.
     * A sessão excluída fica no banco (auditoria), zerada e fora das listas e contagens.
     */
    correction: text("correction", { enum: ["trimmed", "deleted"] }),
    /** Tempo efetivo antes da primeira correção. */
    originalActiveSeconds: integer("original_active_seconds"),
    correctedAt: tsz("corrected_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("study_sessions_planned_positive", sql`${t.plannedSeconds} > 0`),
    check(
      "study_sessions_one_subject",
      sql`(${t.topicId} is not null and ${t.categoryId} is not null and ${t.projectId} is null and ${t.taskId} is null) or (${t.topicId} is null and ${t.categoryId} is null and ${t.projectId} is not null)`,
    ),
    index("study_sessions_project_idx").on(t.projectId),
    check("study_sessions_seconds_non_negative", sql`${t.activeSeconds} >= 0 and ${t.overtimeSeconds} >= 0 and ${t.pausedSeconds} >= 0`),
    check(
      "study_sessions_end_consistency",
      sql`(${t.status} in ('running','paused')) = (${t.endedAt} is null)`,
    ),
    // Garante no banco: no máximo uma sessão ativa por usuário.
    uniqueIndex("study_sessions_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} in ('running','paused')`),
    index("study_sessions_user_started_idx").on(t.userId, t.startedAt),
    index("study_sessions_topic_idx").on(t.topicId),
  ],
);

export const sessionSegments = pgTable(
  "session_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startedAt: tsz("started_at").notNull(),
    endedAt: tsz("ended_at"),
  },
  (t) => [
    check("session_segments_order", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
    uniqueIndex("session_segments_one_open").on(t.sessionId).where(sql`${t.endedAt} is null`),
    index("session_segments_user_started_idx").on(t.userId, t.startedAt),
    index("session_segments_session_idx").on(t.sessionId),
  ],
);

export const BREAK_STATUSES = ["running", "finished", "abandoned"] as const;

export const breaks = pgTable(
  "breaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => studySessions.id),
    methodId: text("method_id")
      .notNull()
      .references(() => studyMethods.id),
    kind: text("kind", { enum: ["short", "long"] }).notNull(),
    plannedSeconds: integer("planned_seconds").notNull(),
    status: text("status", { enum: BREAK_STATUSES }).notNull(),
    startedAt: tsz("started_at").notNull(),
    endedAt: tsz("ended_at"),
    overrunSeconds: integer("overrun_seconds").notNull().default(0),
    penaltyXp: integer("penalty_xp").notNull().default(0),
    endReason: text("end_reason", { enum: ["user_finished", "back_to_study", "abandoned"] }),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("breaks_planned_positive", sql`${t.plannedSeconds} > 0`),
    check("breaks_end_consistency", sql`(${t.status} = 'running') = (${t.endedAt} is null)`),
    uniqueIndex("breaks_one_active_per_user").on(t.userId).where(sql`${t.status} = 'running'`),
    // Um intervalo por sessão de estudo.
    uniqueIndex("breaks_one_per_session").on(t.sessionId).where(sql`${t.sessionId} is not null`),
    index("breaks_user_started_idx").on(t.userId, t.startedAt),
  ],
);

export const XP_REASONS = ["cycle_completed", "break_overrun_penalty", "admin_adjustment", "session_trimmed", "session_deleted"] as const;

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason", { enum: XP_REASONS }).notNull(),
    methodId: text("method_id").references(() => studyMethods.id),
    areaId: text("area_id").references(() => knowledgeAreas.id),
    catalogTopicId: uuid("catalog_topic_id").references(() => catalogTopics.id),
    /** Conta nos rankings? Falso para XP de categorias pessoais. */
    ranked: boolean("ranked").notNull().default(true),
    sourceType: text("source_type", { enum: ["study_session", "break", "admin"] }).notNull(),
    sourceId: uuid("source_id"),
    balanceAfter: integer("balance_after").notNull(),
    note: text("note"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Impede XP duplicado pela mesma origem (sessão finalizada duas vezes, requisições repetidas).
    uniqueIndex("xp_transactions_source_uq")
      .on(t.sourceType, t.sourceId, t.reason)
      .where(sql`${t.sourceId} is not null`),
    index("xp_transactions_user_created_idx").on(t.userId, t.createdAt),
    index("xp_transactions_created_idx").on(t.createdAt),
    index("xp_transactions_area_created_idx").on(t.areaId, t.createdAt),
    index("xp_transactions_topic_created_idx").on(t.catalogTopicId, t.createdAt),
    index("xp_transactions_method_created_idx").on(t.methodId, t.createdAt),
  ],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Catálogo compartilhado: áreas do conhecimento e temas da comunidade
// ---------------------------------------------------------------------------

export const knowledgeAreas = pgTable("knowledge_areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source", { enum: ["capes", "focus"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const CATALOG_TOPIC_STATUSES = ["approved", "pending", "rejected"] as const;

export const catalogTopics = pgTable(
  "catalog_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Pode ser nulo enquanto pendente (área ainda desconhecida). */
    areaId: text("area_id").references(() => knowledgeAreas.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: text("status", { enum: CATALOG_TOPIC_STATUSES }).notNull(),
    source: text("source", { enum: ["seed", "community", "admin"] }).notNull(),
    /** Onde o tema aparece: escola, vestibular e/ou faculdade. */
    levels: text("levels").array().notNull().default(sql`'{}'::text[]`),
    /** Cursos de faculdade em que o tema é comum (ex.: "Medicina"); também entram na busca. */
    courses: text("courses").array().notNull().default(sql`'{}'::text[]`),
    approvedAt: tsz("approved_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("catalog_topics_normalized_uq").on(t.normalizedName),
    index("catalog_topics_area_idx").on(t.areaId, t.status),
    check("catalog_topics_approved_has_area", sql`${t.status} <> 'approved' or ${t.areaId} is not null`),
  ],
);

/** Sinônimos: "ccna" → Cisco CCNA. Termos normalizados. */
export const catalogAliases = pgTable("catalog_aliases", {
  normalizedName: text("normalized_name").primaryKey(),
  catalogTopicId: uuid("catalog_topic_id")
    .notNull()
    .references(() => catalogTopics.id, { onDelete: "cascade" }),
});

/** Uso de cada termo por usuário (conta usuários distintos para a promoção automática). */
export const catalogTermUsage = pgTable(
  "catalog_term_usage",
  {
    normalizedName: text("normalized_name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    areaId: text("area_id").references(() => knowledgeAreas.id),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.normalizedName, t.userId] })],
);

// ---------------------------------------------------------------------------
// Tags do perfil
// ---------------------------------------------------------------------------

export const userInterestAreas = pgTable(
  "user_interest_areas",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    areaId: text("area_id")
      .notNull()
      .references(() => knowledgeAreas.id),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.areaId] })],
);

export const userFollowedTopics = pgTable(
  "user_followed_topics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    catalogTopicId: uuid("catalog_topic_id")
      .notNull()
      .references(() => catalogTopics.id, { onDelete: "cascade" }),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.catalogTopicId] })],
);

export const userGoalTags = pgTable(
  "user_goal_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

// ---------------------------------------------------------------------------
// Planos e assinaturas (preenchidos pelo provedor de pagamento via webhook, ou manualmente)
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** Recursos liberados pelo plano (ex.: ["ranking"]). */
  features: jsonb("features").$type<Feature[]>().notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("BRL"),
  interval: text("interval", { enum: ["month", "year"] }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    provider: text("provider", { enum: ["manual", "stripe", "mercadopago"] }).notNull(),
    /** Id da assinatura no provedor (nulo para concessões manuais). */
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    currentPeriodEnd: tsz("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    uniqueIndex("subscriptions_provider_uq")
      .on(t.provider, t.providerSubscriptionId)
      .where(sql`${t.providerSubscriptionId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Identidade: CPF guardado apenas como HMAC (uma conta por CPF)
// ---------------------------------------------------------------------------

export const userIdentity = pgTable("user_identity", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** HMAC-SHA256 do CPF com chave secreta do servidor. O CPF em si nunca é gravado. */
  cpfHmac: text("cpf_hmac").notNull().unique(),
  /** Apenas para o usuário reconhecer o CPF informado (ex.: "•••.•••.•••-09"). */
  cpfLastDigits: text("cpf_last_digits").notNull(),
  /** Só o ano (regras para menores). A data completa é usada na verificação e descartada. */
  birthYear: integer("birth_year"),
  /** Quem confirmou CPF + nascimento ("cpfhub", ou "digits" em desenvolvimento). */
  verificationProvider: text("verification_provider"),
  verifiedAt: tsz("verified_at"),
  createdAt: tsz("created_at").notNull().defaultNow(),
});

/** Tentativas de verificação de CPF (limite diário por conta; sem CPF nem nascimento). */
export const cpfVerificationAttempts = pgTable(
  "cpf_verification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outcome: text("outcome", { enum: ["verified", "mismatch", "irregular", "deceased", "unavailable"] }).notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("cpf_verification_attempts_user_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Instituições (base nacional e-MEC/INEP) e vínculo declarado do usuário
// ---------------------------------------------------------------------------

export const INSTITUTION_KINDS = ["higher", "school"] as const;

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: INSTITUTION_KINDS }).notNull(),
    /** Origem do registro: e-MEC (faculdades), INEP (escolas) ou cadastro do admin. */
    source: text("source", { enum: ["emec", "inep", "admin"] }).notNull(),
    sourceCode: text("source_code").notNull(),
    name: text("name").notNull(),
    acronym: text("acronym"),
    normalizedName: text("normalized_name").notNull(),
    city: text("city"),
    uf: text("uf"),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("institutions_source_code_uq").on(t.source, t.sourceCode),
    index("institutions_kind_name_idx").on(t.kind, t.normalizedName),
  ],
);

export const institutionMemberships = pgTable(
  "institution_memberships",
  {
    /** Uma instituição atual por usuário. */
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    /** HMAC da matrícula (com a instituição): única dentro de cada instituição. */
    enrollmentHmac: text("enrollment_hmac").notNull(),
    /**
     * "pending": a instituição tem conta verificada na Focus e ainda não aceitou o aluno (não
     * pontua no ranking da instituição). "active": aceito, ou instituição sem conta na Focus.
     */
    status: text("status", { enum: ["active", "pending"] }).notNull().default("active"),
    /** Matrícula como digitada — só para a instituição conferir no aceite manual. */
    enrollmentDisplay: text("enrollment_display"),
    requestedAt: tsz("requested_at"),
    reviewedBy: text("reviewed_by"),
    /** Só o XP ganho a partir daqui conta para a instituição (data do aceite). */
    joinedAt: tsz("joined_at").notNull(),
  },
  (t) => [
    uniqueIndex("institution_memberships_enrollment_uq").on(t.institutionId, t.enrollmentHmac),
    index("institution_memberships_institution_idx").on(t.institutionId),
  ],
);

/** "Minha instituição não está na lista": pedidos para o admin cadastrar. */
export const institutionRequests = pgTable(
  "institution_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: INSTITUTION_KINDS }).notNull(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    uf: text("uf").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("institution_requests_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Projetos: horas a cumprir, tarefas e participantes (em qualquer contexto)
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Projeto de uma organização (designado por dono/gestor), ou nulo para projetos pessoais. */
    organizationId: uuid("organization_id").references(() => organizations.id),
    context: text("context", { enum: CONTEXTS }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#274DEA"),
    /** Horas a cumprir no projeto (soma de todos os participantes), em minutos. */
    targetMinutes: integer("target_minutes"),
    /** Prazo (AAAA-MM-DD, opcional). */
    dueDate: text("due_date"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    /** Projeto que saiu de uma organização (movido para o Pessoal): ela ainda o vê, riscado. */
    movedFromOrganizationId: uuid("moved_from_organization_id"),
    movedAt: tsz("moved_at"),
    movedBy: text("moved_by"),
    deletedAt: tsz("deleted_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerUserId),
    check("projects_target_positive", sql`${t.targetMinutes} is null or ${t.targetMinutes} > 0`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    status: text("status", { enum: ["invited", "active"] }).notNull(),
    invitedBy: text("invited_by"),
    invitedAt: tsz("invited_at").notNull().defaultNow(),
    joinedAt: tsz("joined_at"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId, t.status)],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Horas previstas para a tarefa, em minutos (opcional). */
    targetMinutes: integer("target_minutes"),
    /** Cronograma: início e prazo (AAAA-MM-DD) e fase (agrupa tarefas no gráfico). */
    startDate: text("start_date"),
    dueDate: text("due_date"),
    phase: text("phase"),
    assigneeUserId: text("assignee_user_id").references(() => user.id, { onDelete: "set null" }),
    doneAt: tsz("done_at"),
    doneBy: text("done_by"),
    createdBy: text("created_by").notNull(),
    deletedAt: tsz("deleted_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("project_tasks_project_idx").on(t.projectId),
    check("project_tasks_target_positive", sql`${t.targetMinutes} is null or ${t.targetMinutes} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Organizações (CNPJ): instituições e empresas verificadas, membros e papéis
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ORGANIZATION_KINDS }).notNull(),
    /** Só dígitos. Um CNPJ tem no máximo uma organização em andamento ou aprovada. */
    cnpj: text("cnpj").notNull(),
    legalName: text("legal_name").notNull(),
    /** Nome fantasia informado no pedido. */
    alias: text("alias").notNull(),
    /** Registro da base e-MEC/INEP correspondente (instituições de ensino, opcional). */
    institutionId: uuid("institution_id").references(() => institutions.id),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requesterRole: text("requester_role").notNull(),
    contactEmail: text("contact_email").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ORGANIZATION_STATUSES }).notNull(),
    /** Resultado das checagens automáticas (CNPJ ativo, CNAE, domínio, e-mail confirmado...). */
    checks: jsonb("checks").$type<OrgChecks>().notNull(),
    /** Dados do cadastro do CNPJ usados na análise (razão social, CNAE, domínios, cidade). */
    cnpjSnapshot: jsonb("cnpj_snapshot"),
    emailTokenHash: text("email_token_hash"),
    emailTokenExpiresAt: tsz("email_token_expires_at"),
    emailConfirmedAt: tsz("email_confirmed_at"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    approvedAt: tsz("approved_at"),
    /** Página pública (instituições): apresentação, por que estudar lá e site. */
    about: text("about"),
    whyStudy: text("why_study"),
    website: text("website"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organizations_cnpj_open_uq").on(t.cnpj).where(sql`${t.status} <> 'rejected'`),
    index("organizations_status_idx").on(t.status),
    index("organizations_requester_idx").on(t.requesterUserId),
    uniqueIndex("organizations_email_token_uq").on(t.emailTokenHash),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ORG_ROLES }).notNull(),
    /** Área/setor/turma dentro da organização (rankings internos por área). */
    area: text("area"),
    /** invited: a organização convidou; requested: a pessoa pediu para entrar; active: membro. */
    status: text("status", { enum: ["invited", "requested", "active"] }).notNull(),
    /** Matrícula/registro informado no pedido (HMAC para o aceite automático; texto para o manual). */
    enrollmentHmac: text("enrollment_hmac"),
    enrollmentDisplay: text("enrollment_display"),
    invitedBy: text("invited_by"),
    invitedAt: tsz("invited_at").notNull().defaultNow(),
    joinedAt: tsz("joined_at"),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index("organization_members_user_idx").on(t.userId, t.status),
    uniqueIndex("organization_members_enrollment_uq")
      .on(t.organizationId, t.enrollmentHmac)
      .where(sql`${t.enrollmentHmac} is not null`),
  ],
);

/**
 * Lista de matrículas/registros enviada pela organização para o aceite automático. Guarda só o
 * HMAC (o mesmo da matrícula informada pela pessoa), nunca o número.
 */
export const organizationRoster = pgTable(
  "organization_roster",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    keyHmac: text("key_hmac").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.keyHmac] })],
);

/**
 * Pedidos para mover um projeto de perfil: de um participante para quem criou o projeto
 * ("owner") ou de quem criou para a gestão da organização ("manager").
 */
export const projectMoveRequests = pgTable(
  "project_move_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    approver: text("approver", { enum: ["owner", "manager"] }).notNull(),
    targetContext: text("target_context", { enum: CONTEXTS }).notNull(),
    targetOrganizationId: uuid("target_organization_id").references(() => organizations.id),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: tsz("decided_at"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("project_move_requests_project_idx").on(t.projectId, t.status),
    uniqueIndex("project_move_requests_one_pending").on(t.projectId, t.requestedBy).where(sql`${t.status} = 'pending'`),
  ],
);

// ---------------------------------------------------------------------------
// Amigos (ranking entre amigos e, no futuro, a rede social)
// ---------------------------------------------------------------------------

export const friendships = pgTable(
  "friendships",
  {
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
    createdAt: tsz("created_at").notNull().defaultNow(),
    respondedAt: tsz("responded_at"),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.addresseeId] }),
    // Um vínculo por par, em qualquer direção.
    uniqueIndex("friendships_pair_uq").on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`),
    index("friendships_addressee_idx").on(t.addresseeId, t.status),
  ],
);

/** Dependências do cronograma: a tarefa só começa depois de outra. */
export const projectTaskDependencies = pgTable(
  "project_task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }),
    check("project_task_dependencies_not_self", sql`${t.taskId} <> ${t.dependsOnTaskId}`),
  ],
);
