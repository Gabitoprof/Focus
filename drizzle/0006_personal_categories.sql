ALTER TABLE "categories" ADD COLUMN "is_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "ranked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD COLUMN "ranked" boolean DEFAULT true NOT NULL;