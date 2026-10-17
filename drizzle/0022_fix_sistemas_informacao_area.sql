-- "Sistemas de Informação" estava em Ciências Sociais Aplicadas por engano. Na tabela do CNPq
-- (1.03.03.04) é subárea de Ciência da Computação, em Ciências Exatas e da Terra.
-- Corrige o catálogo e o histórico (sessões e XP), para os rankings por área ficarem certos.
UPDATE "catalog_topics" SET "area_id" = 'exatas'
WHERE "normalized_name" = 'sistemas de informacao';
--> statement-breakpoint
UPDATE "study_sessions" SET "area_id" = 'exatas'
WHERE "catalog_topic_id" IN (SELECT "id" FROM "catalog_topics" WHERE "normalized_name" = 'sistemas de informacao');
--> statement-breakpoint
UPDATE "xp_transactions" SET "area_id" = 'exatas'
WHERE "catalog_topic_id" IN (SELECT "id" FROM "catalog_topics" WHERE "normalized_name" = 'sistemas de informacao');
--> statement-breakpoint
UPDATE "catalog_term_usage" SET "area_id" = 'exatas'
WHERE "normalized_name" = 'sistemas de informacao' AND "area_id" = 'sociais_aplicadas';
--> statement-breakpoint
-- Buscar pelo curso "Sistemas de Informação" passa a trazer as disciplinas de computação dele.
UPDATE "catalog_topics"
SET "courses" = (SELECT array(SELECT DISTINCT unnest("courses" || ARRAY['Sistemas de Informação'])))
WHERE "normalized_name" IN ('sistemas de informacao', 'programacao', 'banco de dados', 'engenharia de software', 'redes de computadores', 'seguranca da informacao');
