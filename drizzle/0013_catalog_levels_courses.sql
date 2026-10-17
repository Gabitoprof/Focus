ALTER TABLE "catalog_topics" ADD COLUMN "levels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_topics" ADD COLUMN "courses" text[] DEFAULT '{}'::text[] NOT NULL;