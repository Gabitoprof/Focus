-- A área da categoria deixa de ser escolhida à mão: passa a ser a dos temas do catálogo.
-- Áreas escolhidas antes (que podiam contradizer os temas) são descartadas.
UPDATE "categories" SET "area_id" = NULL;
