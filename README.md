# Focus

Plataforma de estudos com Pomodoro, registro real de horas por registro e tema, XP por ciclo concluído e (nas próximas etapas) ranking competitivo com assinatura.

Planejamento completo: [docs/01-planejamento.md](docs/01-planejamento.md).

## Rodar localmente

Requisitos: Node.js 22+ (testado com Node 24). Não precisa de Docker nem de banco instalado: em desenvolvimento o Postgres roda embutido (PGlite) e grava em `.data/pglite`.

```bash
npm install
npm run dev
```

Abra http://localhost:3000, crie uma conta, cadastre um registro e um tema e comece a estudar.

- Recuperação de senha em desenvolvimento: o link aparece no terminal do `npm run dev`.
- Para zerar o banco local: pare o servidor e apague a pasta `.data/pglite`.
- **Cópias de segurança automáticas** do banco local ficam em `.data/backups/` (uma por dia, as 5 últimas). Para restaurar, pare o servidor, renomeie `.data/pglite` e rode `node -e "const {PGlite}=require('@electric-sql/pglite');const fs=require('fs');(async()=>{const db=new PGlite('.data/pglite',{loadDataDir:new Blob([fs.readFileSync(process.argv[1])])});await db.waitReady;await db.close()})()" .data/backups/ARQUIVO.tar.gz`.
- **Não rode `npm run build` com o `npm run dev` ligado** usando o banco local: o PGlite aceita um processo por vez. Em produção o banco é um Postgres de verdade e isso não se aplica.
- **Idiomas:** português (padrão), inglês e espanhol. Textos em `src/i18n/dictionaries/`; mensagens de erro do servidor em `src/i18n/errors.ts`. Para um idioma novo, crie o dicionário e inclua-o em `src/i18n/config.ts`.
- O alarme toca `public/sounds/alarm.mp3`. Para trocar, substitua o arquivo (upload pelo admin virá na Etapa 7).

### Premium manual (testes)

```bash
npm run premium:grant -- email@exemplo.com --days 30
```

Revogar: acrescente `--revoke`. Também exige o servidor parado no PGlite.

### Tornar-se administrador

Depois de criar sua conta, com o servidor parado (o PGlite aceita um processo por vez):

```bash
npm run admin:grant -- seu-email@exemplo.com
```

O admin analisa em `/admin/organizacoes` os cadastros de instituições/empresas que não passaram em todas as checagens automáticas.

### Contas de demonstração

Para ver todas as telas com dados (alunos aceitos e pendentes, professor-gestor, instituição e empresa verificadas, funcionários, pessoas sem vínculo, amigos, projetos e 6 semanas de histórico), **com o servidor parado**:

```bash
npm run demo:seed
```

As contas usam o domínio `@focus.demo`; a senha e a lista com o papel de cada uma ficam em `data/demo/CONTAS-DEMO.md` (fora do Git). `npm run demo:seed -- --reset` apaga as contas de demonstração e recria.

### Catálogo de temas (tabela do CNPq)

O catálogo já nasce com uma base curada (escola, vestibular/ENEM e faculdade). Para incluir a Tabela de Áreas do Conhecimento do CNPq/CAPES (áreas, subáreas e especialidades), com o servidor parado:

```bash
npm run catalog:import-cnpq -- data/cnpq/tabela-areas-2022.doc
```

Use `--dry-run` para só conferir a leitura. Rodar de novo não duplica temas.

### Consulta de CNPJ (CNPJá)

Com `CNPJ_API_KEY` no `.env.local`, o cadastro de organizações usa a API comercial da CNPJá; sem a chave, a API pública (com limite por minuto). Para conferir a chave sem exibi-la:

```bash
node --env-file=.env.local scripts/check-cnpja.mjs
```

## Testes

```bash
npm test
```

Rodam contra um Postgres real em memória (PGlite), com relógio simulado. Hoje são 135 testes em 18 arquivos.

| # | Cenário obrigatório | Status |
|---|---|---|
| 1 | Sessão de 30 min concede 30 XP | ✅ automatizado |
| 2 | Sessão de 37 min concede 37 XP | ✅ automatizado |
| 3 | Excedente contabilizado corretamente (sem XP extra) | ✅ automatizado |
| 4 | Intervalo não conta como estudo | ✅ automatizado |
| 5 | Intervalo excedido aplica no máximo uma penalidade | ✅ automatizado |
| 6 | Intervalo dentro da tolerância não penaliza | ✅ automatizado |
| 7 | Atualizar a página não reinicia nem duplica a sessão | ✅ automatizado |
| 8 | Finalizar duas vezes não duplica registros nem XP | ✅ automatizado |
| 9 | Usuário não altera o XP pelo frontend | ✅ automatizado (camada de serviço) |
| 10 | Usuário não consulta dados de outro | ✅ automatizado |
| 11 | Admin acessa o ranking sem assinatura | ✅ automatizado |
| 12 | Gratuito não acessa ranking via API | ✅ automatizado |
| 13 | Assinatura liberada/bloqueada pelo status | ✅ automatizado (status manual; webhooks do Stripe na Etapa 7) |
| 14 | Totais do dashboard = registros persistidos | ✅ automatizado |
| 15 | Tempo diário respeita o fuso horário | ✅ automatizado |

## Estrutura

```
src/
  domain/            regras puras: métodos e XP, configurações, datas e fuso
  server/
    db/              schema Drizzle, conexão (PGlite/Postgres), dados de referência
    auth/            Better Auth + requireUser()
    services/        timer, xp, categorias, estatísticas, perfil
  app/
    actions/         Server Actions (validação Zod, usuário sempre da sessão)
    (auth)/          login, cadastro, recuperação de senha
    (app)/           estudar (Foque), registro, dashboard (Painel), histórico, ranking, organizacao, conquistas, perfil
    api/             rotas do Better Auth e de manutenção (cron)
drizzle/             migrações SQL versionadas
tests/               testes de regras de negócio
scripts/             migração e concessão de admin
```

## Produção

1. Crie um Postgres gerenciado (Supabase, Neon…) e defina `DATABASE_URL`.
2. Defina `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET` e, para e-mails, `RESEND_API_KEY` + `MAIL_FROM` (veja `.env.example`).
3. `npm run db:migrate` (aplica migrações e dados de referência).
4. `npm run build && npm start` — ou deploy na Vercel.
5. Agende `GET /api/cron/maintenance` com `Authorization: Bearer $CRON_SECRET` a cada 10 min (fecha sessões abandonadas de quem não voltou ao app).

## Modelo de dados (gerar nova migração)

Edite `src/server/db/schema.ts` e rode `npm run db:generate`.
