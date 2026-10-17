CREATE TABLE "project_move_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"approver" text NOT NULL,
	"target_context" text NOT NULL,
	"target_organization_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "moved_from_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "moved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "moved_by" text;--> statement-breakpoint
ALTER TABLE "project_move_requests" ADD CONSTRAINT "project_move_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_move_requests" ADD CONSTRAINT "project_move_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_move_requests" ADD CONSTRAINT "project_move_requests_target_organization_id_organizations_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_move_requests_project_idx" ON "project_move_requests" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_move_requests_one_pending" ON "project_move_requests" USING btree ("project_id","requested_by") WHERE "project_move_requests"."status" = 'pending';