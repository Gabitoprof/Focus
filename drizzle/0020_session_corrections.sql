ALTER TABLE "study_sessions" ADD COLUMN "correction" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "original_active_seconds" integer;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "corrected_at" timestamp with time zone;