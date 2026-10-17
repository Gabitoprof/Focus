CREATE TABLE "cpf_verification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_identity" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "user_identity" ADD COLUMN "verification_provider" text;--> statement-breakpoint
ALTER TABLE "user_identity" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cpf_verification_attempts" ADD CONSTRAINT "cpf_verification_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cpf_verification_attempts_user_idx" ON "cpf_verification_attempts" USING btree ("user_id","created_at");