-- Projetos criados no Registro por dono/gestor de instituição (Acadêmico) ou empresa (Profissional)
-- passam a ser da organização: os participantes entram direto, sem convite.
UPDATE "projects" AS p SET "organization_id" = m."organization_id"
FROM (
  SELECT DISTINCT ON (om."user_id", o."kind") om."user_id", o."kind", om."organization_id"
  FROM "organization_members" om
  JOIN "organizations" o ON o."id" = om."organization_id"
  WHERE om."status" = 'active' AND om."role" <> 'member' AND o."status" = 'approved'
  ORDER BY om."user_id", o."kind", om."joined_at"
) AS m
WHERE p."organization_id" IS NULL
  AND p."moved_from_organization_id" IS NULL
  AND p."deleted_at" IS NULL
  AND m."user_id" = p."owner_user_id"
  AND ((p."context" = 'academic' AND m."kind" = 'institution') OR (p."context" = 'professional' AND m."kind" = 'company'));
