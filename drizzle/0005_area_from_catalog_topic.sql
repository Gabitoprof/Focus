-- Regra corrigida: a área de uma sessão (e do XP dela) vem do tema do catálogo, nunca da categoria.
-- Recalcula os registros já existentes; temas personalizados ficam sem área.
UPDATE "study_sessions" s
SET "area_id" = ct."area_id"
FROM "catalog_topics" ct
WHERE ct."id" = s."catalog_topic_id" AND ct."status" = 'approved';
--> statement-breakpoint
UPDATE "study_sessions"
SET "area_id" = NULL, "catalog_topic_id" = NULL
WHERE "catalog_topic_id" IS NULL
   OR "catalog_topic_id" NOT IN (SELECT "id" FROM "catalog_topics" WHERE "status" = 'approved');
--> statement-breakpoint
UPDATE "xp_transactions" x
SET "area_id" = ct."area_id"
FROM "catalog_topics" ct
WHERE ct."id" = x."catalog_topic_id" AND ct."status" = 'approved';
--> statement-breakpoint
UPDATE "xp_transactions"
SET "area_id" = NULL, "catalog_topic_id" = NULL
WHERE "catalog_topic_id" IS NULL
   OR "catalog_topic_id" NOT IN (SELECT "id" FROM "catalog_topics" WHERE "status" = 'approved');
