import { z } from "zod";

/**
 * Padroniza um nome para comparação: minúsculas, sem acentos, sem pontuação, espaços únicos.
 * "Sub-Redes", "sub redes" e "SUB  REDES" viram "sub redes".
 */
export function normalizeTerm(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const catalogSettingsSchema = z.object({
  /** Usuários distintos usando um termo para ele virar sugestão ao admin. */
  suggestMinUsers: z.number().int().positive(),
  /** Usuários distintos para o termo entrar no catálogo automaticamente. */
  autoApproveMinUsers: z.number().int().positive(),
  maxInterestAreas: z.number().int().positive(),
  maxFollowedTopics: z.number().int().positive(),
  maxGoalTags: z.number().int().positive(),
  /** Mínimo de participantes para um recorte de ranking aparecer. */
  rankingMinParticipants: z.number().int().positive(),
  /** Mínimo de alunos ativos para uma instituição entrar no ranking entre instituições. */
  institutionMinActive: z.number().int().positive(),
  /** Intervalo mínimo entre trocas de instituição. */
  institutionChangeDays: z.number().int().min(0),
});
export type CatalogSettings = z.infer<typeof catalogSettingsSchema>;

export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  suggestMinUsers: 5,
  autoApproveMinUsers: 20,
  maxInterestAreas: 5,
  maxFollowedTopics: 10,
  maxGoalTags: 3,
  rankingMinParticipants: 5,
  institutionMinActive: 10,
  institutionChangeDays: 90,
};

/** Grandes áreas da Tabela de Áreas do Conhecimento (CAPES/CNPq) + Preparatórios. */
export const KNOWLEDGE_AREAS: { id: string; name: string; source: "capes" | "focus" }[] = [
  { id: "exatas", name: "Ciências Exatas e da Terra", source: "capes" },
  { id: "biologicas", name: "Ciências Biológicas", source: "capes" },
  { id: "engenharias", name: "Engenharias", source: "capes" },
  { id: "saude", name: "Ciências da Saúde", source: "capes" },
  { id: "agrarias", name: "Ciências Agrárias", source: "capes" },
  { id: "sociais_aplicadas", name: "Ciências Sociais Aplicadas", source: "capes" },
  { id: "humanas", name: "Ciências Humanas", source: "capes" },
  { id: "letras_artes", name: "Linguística, Letras e Artes", source: "capes" },
  { id: "multidisciplinar", name: "Multidisciplinar", source: "capes" },
  { id: "preparatorios", name: "Preparatórios (ENEM, concursos, certificações, idiomas)", source: "focus" },
];

/** Tags de objetivo do perfil (lista curada, sem texto livre). */
export const GOAL_TAGS: { id: string; label: string }[] = [
  { id: "enem", label: "ENEM / Vestibular" },
  { id: "concurso", label: "Concurso público" },
  { id: "graduacao", label: "Graduação" },
  { id: "pos", label: "Pós-graduação" },
  { id: "certificacao", label: "Certificação" },
  { id: "idiomas", label: "Idiomas" },
  { id: "oab", label: "OAB" },
  { id: "residencia", label: "Residência" },
  { id: "carreira", label: "Desenvolvimento profissional" },
];
