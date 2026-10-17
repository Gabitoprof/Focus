CREATE TABLE "organization_roster" (
	"organization_id" uuid NOT NULL,
	"key_hmac" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_roster_organization_id_key_hmac_pk" PRIMARY KEY("organization_id","key_hmac")
);
--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD COLUMN "enrollment_display" text;--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "enrollment_hmac" text;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "enrollment_display" text;--> statement-breakpoint
ALTER TABLE "organization_roster" ADD CONSTRAINT "organization_roster_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_enrollment_uq" ON "organization_members" USING btree ("organization_id","enrollment_hmac") WHERE "organization_members"."enrollment_hmac" is not null;--> statement-breakpoint
-- Perfis Acadêmico e Profissional passam a exigir aceite por uma organização verificada.
-- Quem ainda não foi aceito continua com tudo no perfil Pessoal, na área correspondente.
-- (Sessões e XP mantêm se pontuaram ou não: o ranking já disputado não muda.)
CREATE TEMP TABLE "_ctx_access" AS
SELECT DISTINCT m."user_id", o."kind"
FROM "organization_members" m JOIN "organizations" o ON o."id" = m."organization_id"
WHERE m."status" = 'active' AND o."status" = 'approved';--> statement-breakpoint
UPDATE "study_sessions" s SET "context" = 'personal'
WHERE s."context" = 'academic' AND s."category_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = s."user_id" AND a."kind" = 'institution');--> statement-breakpoint
UPDATE "study_sessions" s SET "context" = 'personal'
WHERE s."context" = 'professional' AND s."category_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = s."user_id" AND a."kind" = 'company');--> statement-breakpoint
UPDATE "categories" c SET "context" = 'personal', "usage" = 'academic'
WHERE c."context" = 'academic'
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = c."user_id" AND a."kind" = 'institution');--> statement-breakpoint
UPDATE "categories" c SET "context" = 'personal', "usage" = 'professional'
WHERE c."context" = 'professional'
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = c."user_id" AND a."kind" = 'company');--> statement-breakpoint
UPDATE "study_sessions" s SET "context" = 'personal'
FROM "projects" p
WHERE s."project_id" = p."id" AND p."organization_id" IS NULL AND p."context" <> 'personal'
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = p."owner_user_id"
    AND a."kind" = CASE p."context" WHEN 'academic' THEN 'institution' ELSE 'company' END);--> statement-breakpoint
UPDATE "projects" p SET "context" = 'personal'
WHERE p."organization_id" IS NULL AND p."context" <> 'personal'
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = p."owner_user_id"
    AND a."kind" = CASE p."context" WHEN 'academic' THEN 'institution' ELSE 'company' END);--> statement-breakpoint
UPDATE "profiles" pr SET "active_context" = 'personal'
WHERE pr."active_context" <> 'personal'
  AND NOT EXISTS (SELECT 1 FROM "_ctx_access" a WHERE a."user_id" = pr."user_id"
    AND a."kind" = CASE pr."active_context" WHEN 'academic' THEN 'institution' ELSE 'company' END);--> statement-breakpoint
DROP TABLE "_ctx_access";
