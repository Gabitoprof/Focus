CREATE TABLE "institution_memberships" (
	"user_id" text PRIMARY KEY NOT NULL,
	"institution_id" uuid NOT NULL,
	"enrollment_hmac" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"uf" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_code" text NOT NULL,
	"name" text NOT NULL,
	"acronym" text,
	"normalized_name" text NOT NULL,
	"city" text,
	"uf" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"cpf_hmac" text NOT NULL,
	"cpf_last_digits" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identity_cpf_hmac_unique" UNIQUE("cpf_hmac")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "public_code" text;--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_requests" ADD CONSTRAINT "institution_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identity" ADD CONSTRAINT "user_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_memberships_enrollment_uq" ON "institution_memberships" USING btree ("institution_id","enrollment_hmac");--> statement-breakpoint
CREATE INDEX "institution_memberships_institution_idx" ON "institution_memberships" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "institution_requests_status_idx" ON "institution_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_source_code_uq" ON "institutions" USING btree ("source","source_code");--> statement-breakpoint
CREATE INDEX "institutions_kind_name_idx" ON "institutions" USING btree ("kind","normalized_name");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_public_code_unique" UNIQUE("public_code");