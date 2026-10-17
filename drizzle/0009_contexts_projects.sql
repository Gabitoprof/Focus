CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"invited_by" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_minutes" integer,
	"assignee_user_id" text,
	"done_at" timestamp with time zone,
	"done_by" text,
	"created_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tasks_target_positive" CHECK ("project_tasks"."target_minutes" is null or "project_tasks"."target_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"context" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#274DEA' NOT NULL,
	"target_minutes" integer,
	"due_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_target_positive" CHECK ("projects"."target_minutes" is null or "projects"."target_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "context" text DEFAULT 'academic' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "active_context" text DEFAULT 'academic' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "context" text DEFAULT 'academic' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_sessions_project_idx" ON "study_sessions" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_one_subject" CHECK (("study_sessions"."topic_id" is not null and "study_sessions"."category_id" is not null and "study_sessions"."project_id" is null and "study_sessions"."task_id" is null) or ("study_sessions"."topic_id" is null and "study_sessions"."category_id" is null and "study_sessions"."project_id" is not null));--> statement-breakpoint
-- Categorias pessoais viram o contexto Pessoal; as sessões delas também.
UPDATE "categories" SET "context" = 'personal' WHERE "is_personal" = true;--> statement-breakpoint
UPDATE "study_sessions" SET "context" = 'personal' WHERE "category_id" IN (SELECT "id" FROM "categories" WHERE "is_personal" = true);
