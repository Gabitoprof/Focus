# Focus — Etapa 1: Planejamento e arquitetura

> Nome provisório. Documento vivo: atualize quando uma decisão mudar.

## 1. Requisitos

### Funcionais (base — esta versão)
- Cadastro, login, logout, recuperação e alteração de senha; perfil com nome de exibição e fuso horário.
- Categorias e temas do próprio usuário, sem limite de quantidade; editar, arquivar, restaurar e excluir (exclusão lógica — o histórico permanece).
- Métodos de estudo: **Pomodoro clássico**, **Estudo personalizado** e **Deep Work** (regras guardadas no banco, editáveis pelo admin).
- Cronômetro regressivo → alarme MP3 → tempo excedente crescente; pausar, retomar, finalizar; intervalos com excedente e penalidade.
- Estado do cronômetro persistido no servidor e recalculado a partir de timestamps (sobrevive a atualização da página, fechamento do navegador e troca de dispositivo).
- Dashboard: totais (geral, hoje, semana, mês), sessões, XP, maior sequência, tempo por categoria e por tema, filtros de período, gráficos.
- XP por ciclo concluído, penalidade única por intervalo excedido, histórico de transações de XP.

### Funcionais (próximas etapas)
- Ranking (geral, por método, semanal, mensal, evolução de posição) — exclusivo para assinantes e admin.
- Assinatura (Stripe em modo de teste) e painel administrativo.
- **Premium (futuro): lembretes de estudo pelo WhatsApp.** O usuário define dias, horários e o texto do lembrete; recebe mensagens para estudar. Requer opt-in explícito e verificação do número, opção de parar a qualquer momento, e um provedor oficial (WhatsApp Business Platform/Cloud API ou BSP como Twilio/Zenvia) com modelos de mensagem aprovados. Personalização exclusiva do plano premium.
- Ideias para o futuro (rede social, ligas, trilhas, metas, medalhas etc.): ver [03-banco-de-ideias.md](03-banco-de-ideias.md).

### Não funcionais
- Regras de tempo e XP **sempre no servidor**, dentro de transação; o navegador só exibe.
- Idempotência: cliques repetidos, requisições duplicadas e atualizações de página não criam sessões nem XP duplicados (garantido também por restrições únicas no banco).
- Isolamento por usuário em toda consulta; dados de outros usuários nunca são retornados.
- Responsivo (celular, tablet, desktop), acessível (contraste, teclado, rótulos), em português.
- Tempo de relatório diário segue o fuso horário do perfil.

## 2. Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Web + API | Next.js 16 (App Router) + TypeScript | Um projeto só para telas, Server Actions e webhooks. |
| UI | Tailwind CSS 4 + componentes próprios acessíveis | Sem dependência pesada; pode migrar para shadcn/ui sem retrabalho. |
| Gráficos | Recharts | Simples e suficiente. |
| Banco | PostgreSQL | Relacional, transações, índices parciais. |
| Acesso a dados | Drizzle ORM + migrações SQL versionadas | SQL explícito, tipado, migrações em `drizzle/`. |
| Banco em desenvolvimento | PGlite (Postgres em WASM, gravado em `.data/`) | Roda sem Docker e sem conta externa. |
| Banco em produção | Postgres gerenciado (Supabase, Neon, RDS…) via `DATABASE_URL` | Mesmas migrações. |
| Autenticação | Better Auth (e-mail e senha, sessões no banco) | Integra com Drizzle, recuperação de senha, cookies seguros. |
| Validação | Zod | Toda entrada de Server Action é validada. |
| Testes | Vitest + PGlite em memória | Testa as regras contra um Postgres real. |
| Pagamentos (Etapa 7) | Stripe Billing atrás de uma interface `PaymentProvider` | Modo de teste completo, webhooks, portal do cliente; Mercado Pago pode virar outro adaptador. |
| Hospedagem | Vercel + Postgres gerenciado (região São Paulo) | Escala sem mudar a arquitetura. |

**Mudança em relação à proposta inicial (Supabase):** a máquina de desenvolvimento não tem Docker, então o Supabase local não roda. O Postgres continua sendo o banco; o Supabase pode ser usado em produção apenas como Postgres gerenciado. Como não usamos o RLS do Supabase, o isolamento é feito numa camada de serviços no servidor: toda função recebe o `userId` da sessão autenticada (nunca do navegador) e filtra por ele.

## 3. Arquitetura

```
Navegador (React, Client Components)
  └─ desenha o relógio a partir dos timestamps do servidor (Web Worker para não depender da aba ativa)
        │ Server Actions (POST) — sessão via cookie
        ▼
Next.js (servidor)
  ├─ src/server/auth/      → Better Auth; requireUser()
  ├─ src/server/services/  → regras de negócio (timer, XP, relatórios, categorias)
  ├─ src/domain/           → funções puras (cálculo de tempo, XP, regras de método)
  └─ src/server/db/        → Drizzle + schema + migrações
        ▼
PostgreSQL (PGlite em dev)
```

Princípios:
1. **O servidor é a fonte da verdade do tempo.** Início, pausas e fim são timestamps do servidor. O navegador recebe `serverNow` e corrige a diferença do relógio local.
2. **Toda transição do cronômetro roda em transação**, com trava na linha do perfil do usuário (`SELECT … FOR UPDATE`), serializando as ações do mesmo usuário.
3. **XP só é criado pelo servidor**, em `xp_transactions`, com índice único `(source_type, source_id, reason)`: o mesmo ciclo nunca gera XP duas vezes.

## 4. Modelo de dados

| Tabela | Conteúdo principal |
|---|---|
| `user`, `session`, `account`, `verification` | Tabelas do Better Auth (senha com hash fica em `account`). |
| `profiles` | `display_name`, `timezone`, `alarm_volume`, `xp_balance` (≥ 0). |
| `user_roles` | `(user_id, role)`; papel `admin`. Sem nenhuma rota que permita ao usuário alterar. |
| `study_methods` | `id` (`pomodoro_classic`, `custom`, `deep_work`), nome, `rules` (JSON), ativo, ordem. |
| `categories` | dono, nome, cor, `archived_at`, `deleted_at`. Nome único por usuário entre as não excluídas. |
| `topics` | dono, categoria, nome, `archived_at`, `deleted_at`. |
| `study_sessions` | dono, tema, categoria, método, `rules_snapshot`, `planned_seconds`, `status` (`running`/`paused`/`finished`/`abandoned`), `started_at`, `ended_at`, `last_heartbeat_at`, `active_seconds`, `overtime_seconds`, `completed`, `xp_awarded`, `cycle_index`, `end_reason`, `flagged`, `flag_reason`. Índice único parcial: **uma sessão ativa por usuário**. |
| `session_segments` | Trechos contínuos de estudo (entre iniciar/retomar e pausar/finalizar). Base dos relatórios — permite dividir corretamente sessões que passam da meia-noite. |
| `breaks` | dono, sessão anterior, método, tipo (`short`/`long`), `planned_seconds`, `started_at`, `ended_at`, `overrun_seconds`, `penalty_xp`, `status`. Índice único parcial: **um intervalo ativo por usuário**. Nunca entra no tempo de estudo. |
| `xp_transactions` | dono, `amount` (+/−), `reason`, `method_id`, `source_type`, `source_id`, `balance_after`, `created_at`. Imutável. |
| `app_settings` | Chave/valor JSON: tolerância, penalidade, limites de sessão abandonada, áudio. |
| `audit_logs` | Eventos relevantes (sessão sinalizada, ajustes, ações do admin). |
| *(Etapa 6–7)* `ranking_snapshots`, `plans`, `subscriptions`, `payments` | Ranking com evolução; planos com lista de recursos (`features`), espelho do Stripe. Nenhum dado de cartão. |
| *(Futuro)* `organizations`, `organization_members` | Ranking por organização (ex.: PUC Minas). |

## 5. Métodos de estudo e XP

Taxa única: **1 XP por minuto planejado, concedido apenas quando o ciclo é concluído** (tempo efetivo, sem pausas, ≥ tempo planejado) e a duração planejada está na faixa que gera XP do método. Assim nenhum método rende mais XP por minuto que outro, e o ranking geral é justo.

| Método | Estudo | Intervalo | XP |
|---|---|---|---|
| Pomodoro clássico | fixo 25 min | fixo 5 min; 15 min a cada 4 ciclos | 25 XP por ciclo |
| Estudo personalizado | livre 1–240 min (atalhos 30/45/50/60) | livre 1–60 min | 1 XP/min se planejado entre 20 e 60 min |
| Deep Work | 60–90 min | 10–30 min | 1 XP/min (60–90 XP) |

- Excedente: conta como tempo estudado, **não** gera XP.
- Sessão finalizada antes do planejado: tempo é registrado, XP = 0.
- Sessões fora da faixa de XP (ex.: 5 min no personalizado): tempo registrado, XP = 0 — impede acumular XP com sessões curtas.
- O admin altera as regras; cada sessão guarda as regras vigentes (`rules_snapshot`), então mudanças não alteram o passado.
- Testes obrigatórios 1 e 2 (30 min → 30 XP; 37 min → 37 XP) usam o Estudo personalizado.

### Área e tema nos rankings
- **Categoria** (texto livre) é só organização pessoal: nunca cria ranking e não aparece para ninguém. A "área principal" da categoria apenas ordena sugestões e vota na área de temas novos da comunidade.
- **A área de uma sessão vem do tema do catálogo vinculado** (ex.: Bioquímica → Ciências Biológicas), nunca da categoria. Assim área e tema são sempre coerentes e ninguém escolhe uma área "vazia" para subir no ranking.
- Tema personalizado (sem vínculo) conta só no Geral e por método.
- **Categoria pessoal** (produtividade fora dos estudos): conta no dashboard e no saldo de XP, mas nunca entra em nenhum ranking (nem Geral nem por método). Não tem área, não se vincula ao catálogo e seus temas não votam na comunidade. É de mão única: uma categoria comum pode virar pessoal (vale para sessões futuras), uma pessoal nunca volta ao ranking. Cada sessão e lançamento de XP grava `ranked`.

### CPF (ranking de instituição)
- CPF + data de nascimento conferidos na Receita Federal via CPFHub.io (Consulta em Tempo Real) antes de vincular. Só situação `REGULAR` sem óbito é aceita; qualquer recusa mostra a mesma mensagem ("CPF inválido ou dados não conferem").
- Grava-se só o HMAC do CPF (uma conta por CPF), os 2 últimos dígitos e o ano de nascimento; nome, comprovante e data completa são descartados.
- Máximo de 3 tentativas por conta em 24 h; falha do provedor não conta e nunca vincula. CPF já usado em outra conta é recusado antes de gastar consulta.
- Verificador plugável (`CPFHUB_API_KEY`); sem chave, desenvolvimento valida só os dígitos e produção não vincula nenhum CPF.

### Penalidade de intervalo — avaliação
Proposta: tolerância de 30 s; acima disso, 5 XP uma única vez por intervalo. Avaliação: equilibrada — 5 XP é 20% de um ciclo de 25 min, sente-se a perda sem anular o ciclo. Tolerância e valor ficam configuráveis. Ressalva registrada: como pular o intervalo não tem penalidade, um usuário poderia evitá-lo para nunca arriscar os 5 XP. Por ora o sistema apenas incentiva o intervalo na interface; uma regra opcional ("o próximo ciclo só gera XP se houve intervalo") pode ser ligada depois sem migração.

O saldo nunca fica negativo: a penalidade debita `min(penalidade, saldo atual)` e registra o valor efetivamente debitado.

## 6. Estados do cronômetro

```
            iniciar                pausar
  ocioso ─────────────▶ estudando ◀──────▶ pausado
     ▲                   │  (tempo restante ≤ 0 ⇒ "excedente", mesmo estado)
     │       finalizar   │ iniciar intervalo
     ├───────────────────┤
     │                   ▼
     │   finalizar    em intervalo (regressivo → excedente)
     └────────────────── │
                         └─ voltar aos estudos ⇒ encerra intervalo + inicia nova sessão
```
Transições inválidas (ex.: pausar sessão finalizada) são recusadas pelo servidor. Repetir uma transição já feita (ex.: finalizar duas vezes) devolve o estado atual sem efeitos.

### Sessões abandonadas e interrupções
- Com a sessão em andamento, o navegador envia um *heartbeat* por minuto (também com a aba em segundo plano).
- Sem heartbeat por **10 min**, a sessão é encerrada como `abandoned` no horário do último heartbeat. O tempo até ali conta; se o ciclo já estava concluído, o XP é concedido.
- Sessão pausada por mais de **12 h** é encerrada no momento da pausa.
- Intervalo aberto além de **planejado + 120 min** é encerrado; aplica-se a penalidade (uma vez).
- Esse fechamento ocorre na próxima ação do usuário e também por uma rota de manutenção (`/api/cron/maintenance`, protegida por segredo) para agendamento em produção.
- Sessões com mais de **6 h** efetivas são sinalizadas (`flagged`) para revisão, sem descarte.

### Correção pela própria pessoa (só para menos)
- No Painel ("Corrigir sessões desta semana"): **reduzir o tempo** (corta do fim da sessão — caso típico: cronômetro esquecido ligado) ou **excluir**. Nunca acrescenta horas.
- Só sessões encerradas na **semana atual** (fuso da pessoa); semanas fechadas, com pódios e medalhas, ficam congeladas. Cada sessão pode ser reduzida **uma vez**; depois, só excluir.
- Só a própria sessão: gestor, professor ou dono do projeto não mexem nas horas de outra pessoa.
- XP: se o tempo cair abaixo do planejado, o XP do ciclo é estornado (`session_trimmed` / `session_deleted`), com a mesma data do crédito — o período do ranking não muda. Horas, ranking, sequência e conquistas se recalculam porque vêm dos segmentos.
- Exclusão "suave": a sessão fica no banco zerada, com `correction`, `original_active_seconds` e `corrected_at`, fora das listas e contagens; `audit_logs` registra `session.trimmed` / `session.deleted`.
- Em projetos, a atividade recente mostra a correção ao grupo ("Ana removeu 2h", ou "20min (era 1h)").
- Popup de confirmação com o efeito (tempo e XP removidos) antes de aplicar.

## 7. Relatórios e fuso horário
- Tempo estudado = soma dos `session_segments` fechados; intervalos ficam fora.
- Períodos (hoje, 7 dias, 30 dias, mês, personalizado) são calculados no fuso do perfil e convertidos para UTC antes da consulta; segmentos são recortados nos limites do período e na meia-noite local.
- Sequência: dias (no fuso do usuário) com pelo menos 25 min de estudo (configurável).

## 8. Plano de desenvolvimento
1. ✅ Planejamento (este documento).
2. Estrutura visual — layout, navegação, telas.
3. Banco e autenticação — schema, migrações, Better Auth, perfis.
4. Cronômetro e intervalos — serviço de timer, heartbeat, áudio, recuperação de estado.
5. Dashboard e relatórios.
6. XP e ranking.
7. Assinaturas e administração.
8. Testes ponta a ponta e implantação.

As etapas 2–5 e a parte de XP da 6 formam a **base utilizável**, entregue primeiro.

## 9. Premissas
- Plataforma em português; fuso padrão `America/Sao_Paulo`.
- O alarme toca **continuamente** (em loop) durante o tempo excedente do estudo e do intervalo, até o usuário pausar, finalizar, iniciar/encerrar o intervalo ou clicar em "Silenciar alarme" (o silêncio vale só para aquela sessão/intervalo e sobrevive à recarga). Se o navegador bloquear o som após uma recarga sem clique, a tela oferece "Ativar alarme".
- O tempo de pausa é registrado à parte (`paused_seconds`): aparece no histórico e no dashboard, mas não conta como estudo nem completa o ciclo.
- O MP3 do alarme é colocado em `public/sounds/alarm.mp3`; sem o arquivo, toca-se um bipe sintetizado. Upload pelo admin vem na Etapa 7.
- E-mails (recuperação de senha) em desenvolvimento são exibidos no terminal; em produção, configurar um provedor (ex.: Resend).
- O primeiro admin é definido por script de linha de comando (`npm run admin:grant -- email`), nunca por senha fixa no código.

## 10. Contextos, projetos e organizações

Definido a partir do userflow do dono do produto (out/2026).

**Etapa 1 — implementada:** seletor de contexto no menu; Categoria com os modos Estude e Projetos; projetos com horas a cumprir, prazo, tarefas (horas e responsável), convite pelo código FCS, ranking do projeto e atividade recente (com o método usado); Foque em projeto ou tarefa; Painel, Histórico e Ranking por contexto; banco de horas no Pessoal e no Profissional; posição nas áreas do conhecimento no Painel (Acadêmico). Sessões de projeto e dos contextos Pessoal e Profissional ficam fora dos rankings gerais.

**Etapa 2 — implementada:** cadastro de instituição/empresa (conta com CPF verificado; consulta do CNPJ na CNPJá; checagens de situação ativa, CNAE de educação, domínio corporativo igual ao do CNPJ e sócio; link de confirmação por e-mail com validade de 48 h, guardado só como hash); aprovação automática quando tudo confere, senão fila em /admin/organizacoes; aviso aos e-mails do cadastro do CNPJ; dono, gestores e membros por convite (código FCS) com área/turma; projetos da organização designados a membros; ranking interno por área (só tempo nos projetos da organização); quem sai da organização sai dos projetos dela. Pendente: vincular a organização ao registro e-MEC/INEP pela tela (o campo existe) e relatórios CSV/PDF.

**Uma conta (CPF), três contextos.** Cada contexto tem os mesmos módulos: Foque (registro de tempo), Painel, Categoria, Ranking, Histórico e Perfil.

**Categoria tem dois modos (ícones):**
- **Projetos**: ver os projetos designados a você e criar novos. Projeto tem **horas a cumprir** e **tarefas**.
- **Estude**: escolher área do conhecimento + tema (como hoje); o ranking dessas áreas aparece no Painel.

**Pessoal**
- Cria projetos próprios; pode **convidar outros usuários** para o seu projeto ou participar do projeto de outro usuário.
- Ranking pessoal: banco de horas do próprio usuário (total) e ranking por projeto entre amigos ou equipe vinculados.

**Acadêmico**
- O aluno se vincula a uma **Instituição (CNPJ)**; o ranking institucional entra como mais uma opção de ranking.
- **Administrador Institucional** (conta da instituição): cria projetos para alunos (por sala, equipe ou área) e acompanha os vinculados.
- A instituição dá permissão a **professores** (perfis CPF) para organizar equipes, designar tempos e tarefas. Ex.: a PUC dá permissão ao Clóvis; os alunos registram as horas no projeto e fica registrado o método usado.

**Profissional**
- O funcionário se vincula a uma **Empresa (CNPJ)**; a empresa dá permissão a **gestores** (perfis CPF) para designar projetos e tarefas ao próprio setor ou a outros.
- Ranking da empresa é **interno**: só funcionários, por área da empresa + geral (empresas não disputam entre si, ao contrário das instituições).

**Privacidade entre contextos**
- A empresa vê o contexto Profissional do funcionário, nunca o Pessoal nem o Acadêmico.
- Instituição e professores veem o Acadêmico, nunca o Pessoal nem o Profissional.

**Cadastro de instituição/empresa (conta CNPJ)** — só por análise, com o máximo automatizado:
1. Formulário público: CNPJ, nome fantasia, e-mail de contato, responsável (conta Focus com CPF verificado), cargo e mensagem de interesse.
2. Verificações automáticas: dígitos do CNPJ; consulta à API de CNPJ (situação ativa, razão social, CNAE compatível — ex.: 85xx para educação —, endereço, e-mail/domínio e sócios); cruzamento com e-MEC/INEP quando for instituição de ensino; confirmação por link enviado a um **e-mail do domínio oficial** (não Gmail/Hotmail); responsável no quadro de sócios conta pontos.
3. Tudo confere → aprovação automática (ou rápida); algo diverge → fila no painel admin, e-mail para a equipe só como alerta.
4. Aprovado: o responsável vira **dono** da organização na própria conta (não é um login separado) e convida gestores/professores.
5. Proteções: um CNPJ = uma organização; aviso ao e-mail do cadastro da Receita; contestação/denúncia; recursos limitados enquanto "pendente"; log de auditoria.

## 11. Perfis, áreas de utilização, mover demandas e rankings (decisões de out/2026)

**Perfil × área de utilização** — são coisas diferentes:
- *Perfil* (seletor no menu): Pessoal, Acadêmico, Profissional. Acadêmico e Profissional só ficam disponíveis para quem foi aceito por uma instituição/empresa cadastrada; até lá a pessoa usa o Pessoal.
- *Área de utilização* (dentro de Categoria, só no perfil Pessoal): Pessoal | Profissional | Acadêmica (com ou sem vínculo com instituição). É só uma separação dentro do Pessoal.

**Quem entra em qual ranking**
- *Ranking acadêmico geral*: estudo de temas do catálogo oficial, venha do perfil Acadêmico ou da área Acadêmica do perfil Pessoal. Cada pessoa aparece com a situação: instituição vinculada, "pendente de aceite" ou "sem vínculo". Com vínculo aceito, a pessoa disputa em nome da instituição.
- *Ranking da instituição*: só alunos aceitos; detalhes por área do conhecimento e por matéria da instituição.
- *Ranking profissional*: só dentro da empresa, só pelo perfil Profissional com vínculo aceito. A área Profissional do perfil Pessoal nunca entra no ranking da empresa. Empresas não disputam entre si.
- *Ranking entre amigos adicionados* (depende do recurso de amigos).
- *Ranking de empresas*: só no console master (funcionários, horas, projetos concluídos, XP, receita média mensal para a plataforma).
- Períodos: diário, semanal, mensal e total.
- Colunas — acadêmico: nome | instituição/pendente/sem vínculo | horas na plataforma | horas naquele perfil | XP (abreviado: 1,2 mil, 1M) | título. Profissional: nome | horas na plataforma | horas no perfil | XP | cargo. Instituições: nome | horas totais dos alunos | XP total | medalhas institucionais (+ página da instituição ao tocar).
- Ao tocar em uma pessoa: foto, medalhas, mensagem (regras da rede social) e "feed de estudo" (vídeos de até 30 s, fotos pequenas). Feed acadêmico ligado por padrão (a instituição só desliga com justificativa); feed profissional desligado até a empresa liberar; a empresa/setor pode desligar o ranking.

**O ponto vale onde foi registrado**: horas e XP ficam no perfil/área em que a sessão aconteceu (a sessão grava isso no início). Mover uma demanda depois não altera rankings já disputados.

**Mover demandas (tarefas/projetos) entre perfis**
- Mover não duplica: a demanda passa a existir só no perfil de destino.
- Só quem criou pode mover. Demanda designada por gestor/outra pessoa não mostra a opção, exceto se o gestor autorizar; outros participantes podem pedir a transferência ao criador.
- Pessoal → Acadêmico/Profissional: aviso duplo de confirmação (a instituição/gestor passará a ver).
- Acadêmico/Profissional → Pessoal: o gestor aceita ou não; na visão da empresa a demanda fica riscada com "movida por <pessoa>".
- Quem criou edita e exclui; outros participantes podem acrescentar conteúdo.

**Privacidade**: a empresa vê todo o escopo do perfil Profissional do funcionário e nada dos outros perfis; a instituição, o perfil Acadêmico. Só o console master pode acessar outros dados, quando necessário (com registro do motivo). Registro de produtividade não é folha de ponto: a empresa usa para acompanhar e delegar, sem controle de jornada.

**Implementado (out/2026)**
1. *Ranking novo*: período diário; situação de vínculo na linha (instituição, "pendente de aceite" ou "sem vínculo"); colunas "na plataforma" (todos os perfis) e "no ranking"; XP abreviado; títulos por horas acumuladas (Iniciante, Focado 5 h, Dedicado 25 h, Maratonista 100 h, Mestre do foco 300 h, Lenda 1.000 h). Área de utilização nas categorias do Pessoal (Pessoal | Profissional | Acadêmica): a Acadêmica entra no ranking geral. **Só tema do catálogo oficial pontua** (tema inventado nunca entra em ranking). Entre instituições: ordenar por média por aluno ativo (padrão) ou total, com horas/aluno, horas totais e XP total.
2. *Aceite pela organização*: Acadêmico e Profissional só abrem com aceite de uma instituição/empresa verificada (antes disso, tudo fica no Pessoal; a migração moveu categorias e projetos sem aceite para o Pessoal na área equivalente, sem mexer em pontuação). Instituição verificada ligada ao e-MEC/INEP recebe os pedidos (matrícula + CPF verificado); aceite manual em lote ou automático pela lista de matrículas (guardada só como HMAC). Instituição sem conta verificada: vínculo declarado vale direto (como antes). Funcionários pedem vínculo à empresa pelo registro.
3. *Mover projetos*: só quem criou; outros pedem ao criador; sair de uma organização exige aceite da gestão (dono/gestor move direto); aviso duplo ao levar do Pessoal para a organização; projeto movido aparece riscado para a organização ("movido para o Pessoal por…") e só o tempo anterior conta para ela. Participantes acrescentam tarefas; quem criou (ou o dono) exclui.
4. *Página da instituição* (tocar no nome no ranking) com números, posição e medalhas (pódios das últimas 12 semanas fechadas); a instituição verificada escreve "Sobre", "Por que estudar aqui" e o site.
5. *Console master* (`/master`, papel "master" concedido por `npm run admin:grant -- email --master`): visão geral agregada, ranking de empresas (receita fica vazia até existir cobrança para empresas) e painel de instituições cadastradas. Para quem não é master, a área não aparece.
6. *Amigos*: pedido pelo código FCS, ranking entre amigos no Pessoal (livre), cartão da pessoa ao tocar no nome no ranking com "adicionar amigo".

**Pendente**: mensagens diretas (exige guardar o mês de nascimento para a regra dos 18 anos) e feed de estudo (moderação e armazenamento de mídia); 2FA no console master; cobrança para empresas/instituições; "Destaques" (medalhas pessoais, notícias, fóruns); pendências com prazo por tarefa (junto do cronograma/Gantt).
