CREATE TABLE "catalog_aliases" (
	"normalized_name" text PRIMARY KEY NOT NULL,
	"catalog_topic_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_term_usage" (
	"normalized_name" text NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"area_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_term_usage_normalized_name_user_id_pk" PRIMARY KEY("normalized_name","user_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" text,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_topics_approved_has_area" CHECK ("catalog_topics"."status" <> 'approved' or "catalog_topics"."area_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "knowledge_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_followed_topics" (
	"user_id" text NOT NULL,
	"catalog_topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_followed_topics_user_id_catalog_topic_id_pk" PRIMARY KEY("user_id","catalog_topic_id")
);
--> statement-breakpoint
CREATE TABLE "user_goal_tags" (
	"user_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_goal_tags_user_id_tag_id_pk" PRIMARY KEY("user_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_interest_areas" (
	"user_id" text NOT NULL,
	"area_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_interest_areas_user_id_area_id_pk" PRIMARY KEY("user_id","area_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "area_id" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "area_id" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "catalog_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "catalog_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD COLUMN "area_id" text;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD COLUMN "catalog_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_aliases" ADD CONSTRAINT "catalog_aliases_catalog_topic_id_catalog_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."catalog_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_term_usage" ADD CONSTRAINT "catalog_term_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_term_usage" ADD CONSTRAINT "catalog_term_usage_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_topics" ADD CONSTRAINT "catalog_topics_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_followed_topics" ADD CONSTRAINT "user_followed_topics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_followed_topics" ADD CONSTRAINT "user_followed_topics_catalog_topic_id_catalog_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."catalog_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goal_tags" ADD CONSTRAINT "user_goal_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interest_areas" ADD CONSTRAINT "user_interest_areas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interest_areas" ADD CONSTRAINT "user_interest_areas_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_topics_normalized_uq" ON "catalog_topics" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_topics_area_idx" ON "catalog_topics" USING btree ("area_id","status");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_catalog_topic_id_catalog_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."catalog_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_catalog_topic_id_catalog_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."catalog_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_catalog_topic_id_catalog_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."catalog_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_catalog_idx" ON "topics" USING btree ("catalog_topic_id");--> statement-breakpoint
CREATE INDEX "topics_unlinked_normalized_idx" ON "topics" USING btree ("normalized_name") WHERE "topics"."catalog_topic_id" is null and "topics"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "xp_transactions_area_created_idx" ON "xp_transactions" USING btree ("area_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_transactions_topic_created_idx" ON "xp_transactions" USING btree ("catalog_topic_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_transactions_method_created_idx" ON "xp_transactions" USING btree ("method_id","created_at");