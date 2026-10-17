ALTER TABLE "study_sessions" DROP CONSTRAINT "study_sessions_seconds_non_negative";--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "paused_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_seconds_non_negative" CHECK ("study_sessions"."active_seconds" >= 0 and "study_sessions"."overtime_seconds" >= 0 and "study_sessions"."paused_seconds" >= 0);--> statement-breakpoint
-- Preenche o tempo pausado das sessões já encerradas.
UPDATE "study_sessions" SET "paused_seconds" = greatest(0, floor(extract(epoch from ("ended_at" - "started_at")))::int - "active_seconds") WHERE "ended_at" IS NOT NULL;
