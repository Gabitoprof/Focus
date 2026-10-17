ALTER TABLE "categories" ADD COLUMN "usage" text DEFAULT 'academic' NOT NULL;--> statement-breakpoint
-- Categorias existentes: a área de utilização segue o perfil (Pessoal → pessoal; Profissional → profissional).
UPDATE "categories" SET "usage" = CASE "context" WHEN 'personal' THEN 'personal' WHEN 'professional' THEN 'professional' ELSE 'academic' END;
