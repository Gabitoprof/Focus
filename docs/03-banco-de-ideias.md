# Banco de ideias — Focus

Ideias para evoluir a plataforma. Não são compromissos: cada uma é avaliada e priorizada antes de entrar no plano.
Legenda: 💡 ideia · 🔍 em avaliação · 📋 aprovada para o plano

---

## 🌐 Focus como rede social 💡

Transformar a Focus num lugar onde estudantes se encontram, se acompanham e se motivam — não só um cronômetro com ranking.

**Possíveis peças**
- **Perfil público**: nome de exibição, foto, tags (áreas, temas, objetivos), instituição, sequência, medalhas e horas por área.
- **Seguir pessoas**: acompanhar colegas e amigos; ranking "entre quem eu sigo".
- **Feed de atividade**: "Ana concluiu 4 ciclos de Sub-redes", "Bruno bateu 30 dias de sequência", conquistas desbloqueadas — com reações (sem virar distração durante o estudo).
- **Grupos de estudo**: por turma, curso, concurso ou instituição; ranking e feed do grupo; convite por link.
- **Salas de estudo ao vivo**: ver quem está estudando agora e "estudar junto" em silêncio.
- **Desafios entre amigos**: "quem estuda mais Cálculo esta semana".
- **Mural de dicas/materiais** por tema do catálogo (curadoria da comunidade).

**Regras de acesso (definidas)**
- **Só usa a rede social quem tem CPF verificado e vinculado** à conta (o mesmo do ranking de instituição: CPF + nascimento conferidos, uma conta por CPF). Sem CPF, a pessoa continua usando estudo, dashboard e ranking geral normalmente.
- **Mensagem direta só para maiores de 18 anos** — tanto para enviar quanto para receber (um adulto não pode iniciar conversa com um menor).
- **Decidido — maioridade:** guardar o **ano e o mês** de nascimento (nunca a data completa) e liberar a mensagem direta a partir do **primeiro dia do mês seguinte** ao 18º aniversário. Ex.: nascido em 15/03/2008 → liberado em 01/04/2026. Assim ninguém é liberado antes de completar 18 anos, sem armazenar o dia do nascimento.

**Cuidados antes de construir**
- **Privacidade por padrão**: o usuário escolhe o que é público (perfil fechado, só seguidores, público); categorias pessoais nunca aparecem.
- **Menores de idade**: regras específicas (sem mensagens diretas com desconhecidos, perfil restrito) — pedir avaliação jurídica (LGPD art. 14, ECA).
- **Moderação**: denúncias, bloqueio de usuários, filtros de conteúdo ofensivo, fila no painel admin.
- **Foco em primeiro lugar**: nada de notificações ou feed durante uma sessão de estudo; o social deve puxar o usuário de volta para estudar, não tirá-lo do estudo.
- **Custo/infra**: feed e tempo real exigem estrutura extra (fila de eventos, cache, possivelmente WebSockets).

**Possível monetização**: grupos privados e desafios personalizados no premium; perfil e feed básicos gratuitos.

---

## 🏢 Focus para empresas — espaços e projetos 🔍

Ampliar a Focus do meio acadêmico para o pessoal e o corporativo, sem misturar os contextos.

**Espaços (uma conta por pessoa, vários contextos)** — em vez de "tipos de perfil", que obrigariam a ter duas contas (e a regra é uma conta por CPF):

| Espaço | Uso | Ranking | Quem vê |
|---|---|---|---|
| Estudos | Acadêmico (como hoje) | Rankings atuais | Só a pessoa (ranking mostra só o nome de exibição) |
| Pessoal | Produtividade particular | Nenhum | Só a pessoa |
| Empresa (CNPJ) | Trabalho em projetos | Opcional, só entre colegas | A pessoa e os gestores daquela empresa |

Cada sessão pertence a um espaço; o tempo de um espaço nunca aparece em outro. A "categoria pessoal" atual evolui para o espaço Pessoal.

**Modelo por projetos (não é ponto eletrônico)**
- A empresa (CNPJ verificado em base pública) cadastra **projetos**: nome, cliente (opcional), descrição, prazo, **horas previstas** (total e/ou por membro), status (ativo, pausado, concluído).
- **Funcionários são vinculados aos projetos** em que trabalham (convite por link, e-mail ou domínio da empresa).
- O funcionário escolhe o projeto no cronômetro e **registra a atividade** da sessão (ex.: "Revisão do contrato", "Deploy da versão 2.1"), opcionalmente por tipo de atividade definido pela empresa.
- Lançamento manual de horas (esqueceu de ligar o cronômetro), com marcação de "manual" e, se a empresa quiser, aprovação do gestor.
- Mede-se **trabalho entregue por projeto**, não presença: sem horário de entrada/saída, sem controle de jornada (afasta as regras de ponto da Portaria 671/2021 do MTE).

**Painel da empresa (administrador/gestor)**
- Horas **previstas × realizadas** por projeto e por membro; projetos acima do previsto em destaque.
- Atividades registradas por projeto (linha do tempo), filtros por período, membro e tipo.
- Relatórios exportáveis (CSV/PDF) — úteis para faturar clientes por hora.
- Papéis: dono (cobrança e configurações), gestor (projetos e equipe), membro.

**Cuidados**
- Transparência: o funcionário vê exatamente o que o gestor vê sobre ele; nada de vigilância (captura de tela, teclado).
- Os espaços Estudos e Pessoal do funcionário são invisíveis para a empresa; ao sair da empresa, o histórico dele continua com ele.
- XP/ranking no trabalho: opcional e desligado por padrão.
- Avaliação jurídica (LGPD e trabalhista) antes do lançamento.

**Monetização**: cobrança por usuário/mês para empresas (maior potencial de receita); estudo e pessoal seguem com plano gratuito + premium.

**Recomendação de execução**: depois da base atual (onboarding, painel admin, Stripe); deixar o banco preparado para espaços desde já.

---

## 🔑 Console master (operação interna) 💡

Uma área **totalmente separada** das telas vendidas (outro endereço/subdomínio, outro layout, fora do menu do produto), só para o dono da plataforma.

**O que teria**
- **Visão de tudo**: usuários, contextos Acadêmico, Pessoal e Profissional, organizações, projetos, assinaturas, XP e rankings.
- **Painel de instituições/empresas**: toda organização que se cadastra entra num painel próprio de estatísticas — pedidos (pendentes, aprovados, recusados), checagens do CNPJ, membros ativos, horas e projetos por organização, crescimento ao longo do tempo.
- Ferramentas de operação: aprovar/recusar organizações (hoje em /admin/organizacoes), ajustes de XP, liberação de CPF em disputa, catálogo e moderação.

**Cuidados antes de construir**
- **Acesso**: login próprio com segundo fator (2FA/chave de segurança), lista fechada de contas, sessão curta e, se possível, restrição de rede/IP. Nunca o mesmo login das telas do produto.
- **Privacidade (LGPD)**: o produto promete que organizações não veem a vida pessoal nem os estudos de ninguém. Para o console master, preferir **estatísticas agregadas** por padrão; acesso a dados individuais (principalmente do contexto Pessoal) só com motivo registrado (suporte, disputa, ordem legal) e **log de auditoria** de cada consulta. Rever termos de uso e política de privacidade para deixar claro esse acesso.
- **Separação técnica**: rotas e permissões próprias (papel "master" acima de "admin"), sem reaproveitar componentes que possam vazar para o produto.

---

## 🏫 Personalização por organização verificada 💡

Cada instituição/empresa verificada (CNPJ aprovado) pode adaptar a Focus à sua realidade **dentro do espaço dela**, sem mudar a proposta principal nem os rankings gerais.

**O que poderia personalizar**
- Identidade no espaço da organização: logo, cor de destaque, nome das áreas internas (turmas, cursos, setores, departamentos).
- Estrutura: períodos letivos/semestres, turmas e equipes; calendário (provas, entregas, feriados).
- Catálogo próprio: disciplinas da grade da instituição (ex.: "Cálculo I — Eng. Civil — 2026/1"), vinculadas a temas do catálogo oficial.
- Modelos de projeto: projetos padrão com horas e tarefas (TCC, estágio, iniciação científica, projeto integrador).
- Metas internas: horas mínimas por turma/semestre, metas por equipe.
- Avisos e comunicados para os membros; textos de boas-vindas.
- Relatórios no formato da instituição (CSV/PDF com os campos que ela usa).

**Limites (o que nunca muda)**
- Rankings gerais da Focus (Geral, áreas, temas, entre instituições) seguem as regras da plataforma: XP, métodos, intervalos e penalidades não são configuráveis pela organização.
- O ranking interno da organização pode ter filtros/visões próprias, mas usa os mesmos dados de tempo registrados.
- Privacidade igual para todos: a organização continua sem acesso aos contextos Pessoal e de outras organizações.
- Personalizações valem só para quem está vinculado àquela organização.

**Possível monetização**: personalizações avançadas como recurso dos planos para instituições/empresas.

---

## 📅 Cronograma do projeto (gráfico de Gantt) 💡

Dentro de cada projeto, uma aba **Cronograma** com as tarefas numa linha do tempo, no estilo Gantt.

**O que teria**
- Barras por tarefa com início e prazo; marco do prazo final do projeto.
- Progresso de cada barra pelas horas registradas × horas previstas da tarefa (já existem no projeto).
- Responsável na barra; cor por situação (em dia, atrasada, concluída).
- Dependências entre tarefas ("só começa depois de…") e arrastar para remarcar — numa segunda versão.
- Visão por semana/mês; linha de "hoje".
- Para organizações: o gestor vê o cronograma de todos os projetos da equipe.

**Design**: desenhar antes no Figma pelo conector do Claude (protótipo bonito no FigJam/Figma) e só depois implementar seguindo o desenho e a identidade visual da Focus.

**Precisa no banco**: data de início e de prazo por tarefa (hoje a tarefa só tem horas previstas e responsável).

---

## 📌 Referência: Toggl Track (toggl.com/track) 💡

App de controle de tempo muito usado por freelancers e empresas — principal referência para o módulo de empresas/projetos. Ideias para se espelhar (adaptando ao jeito Focus: foco, estudo e privacidade):

**Registro de tempo sem atrito**
- Timer de um clique e **"continuar a última atividade"** (repetir projeto + descrição).
- **Favoritos**: atalhos para as combinações mais usadas (projeto + atividade).
- **Lançamento manual e edição** de horários depois do fato, com registro de que foi editado.
- **Detecção de ociosidade**: perguntar o que fazer com o tempo parado ao voltar ("descartar", "manter", "mover para outra atividade").
- **Lembretes** para ligar o cronômetro em horários definidos e aviso de cronômetro esquecido ligado.
- **Atalhos de teclado** e **extensão do navegador** para iniciar o timer de dentro de outras ferramentas (ex.: Trello, GitHub, Google Docs).
- **Apps de desktop e celular com funcionamento offline**, sincronizando depois.
- **Linha do tempo** que lembra os apps/sites usados no computador para ajudar a preencher o dia (privada, só o próprio usuário vê).
- **Visão de calendário** (arrastar blocos de tempo; integração com Google Calendar/Outlook).

**Organização**
- **Clientes → Projetos → Tarefas** e **etiquetas (tags)** livres para cruzar informações.
- **Horas estimadas por projeto/tarefa** com alerta ao se aproximar do limite.
- **Horas faturáveis e valor por hora** (por projeto, por pessoa) — base para cobrança de clientes.

**Relatórios**
- Relatórios **resumido, detalhado e semanal**, com filtros salvos e compartilhamento por link.
- Exportação **CSV, Excel e PDF**; relatórios agendados por e-mail.
- **Painel da equipe**: quem está trabalhando agora e em quê (opcional, respeitando privacidade).

**Equipes e empresas**
- **Folhas de horas (timesheets) com aprovação** do gestor.
- **Papéis e permissões** (administrador, gestor, membro) e projetos privados/públicos.
- **Integrações** (faturamento, gestão de projetos) e **API pública**.

**Onde a Focus se diferencia (não copiar, somar)**
- Método de foco (Pomodoro, Deep Work) com intervalos e alarme — o Toggl tem um Pomodoro simples.
- Gamificação e rankings no espaço Estudos.
- Espaços separados (Estudos, Pessoal, Empresa) numa só conta, com privacidade entre eles.
- Foco no Brasil: português, CPF/CNPJ, instituições do e-MEC/INEP.

---

## Competição e gamificação
- Ligas semanais por divisão (Bronze, Prata, Ouro…) com promoção e rebaixamento 💡
- Medalhas diárias (bronze/prata/ouro por horas no dia) e conquistas 💡
- Desafios semanais ("10 ciclos sem atrasar intervalo") 💡
- Perfil público com posição nos rankings 💡 *(ver rede social)*

## Estudo e produtividade
- Onboarding guiado até a primeira sessão em menos de 2 minutos 📋
- **Ícone de guia da plataforma** 💡 — um botão fixo "?" (canto da tela, em todas as páginas) que abre um guia de uso:
  - *Tour da tela atual*: destaca os elementos um a um ("Este é o seletor de perfil…", "Aqui você inicia o Foque…"), com avançar/pular; o tour de cada tela pode ser refeito a qualquer momento.
  - *Central de ajuda* com perguntas curtas por tema: perfis e áreas de utilização, Foque e métodos, XP e rankings (o que pontua e o que não), Categoria (Estude × Projetos), organizações (vincular-se, aceite, gestores), conquistas, privacidade.
  - Conteúdo conforme o papel: aluno, gestor/professor, dono de organização veem guias diferentes (ex.: gestor aprende a aceitar pedidos e designar projetos).
  - Primeiro acesso a uma tela abre o tour uma vez (dá para desligar); vídeos curtos de até 30 s ou GIFs.
  - Nos três idiomas; marcar o que já foi visto para não repetir.
- Trilhas prontas de categorias e temas (ex.: CCNA – Introduction to Networks, ENEM) 💡
- Metas diárias/semanais com saldo acumulado ("Preço da Ação") 💡
- Reflexão rápida pós-sessão (nota de foco 1–5 + anotação) 💡
- Modo foco (tela cheia, aviso ao sair da aba, sons ambientes) 💡
- Notificação do sistema quando o tempo acaba com a aba em segundo plano 💡
- Método Revisão ativa (flashcards, questões respondidas) 💡
- Separar no dashboard "estudo" e "pessoal" 💡

## Análise
- Mapa de produtividade por dia da semana × hora 💡
- Lembrete de revisão ("não estuda Sub-redes há 9 dias") 💡
- Resumo semanal por e-mail 💡

## Aparência
- Botão para alternar tema claro / escuro (e "automático", seguindo o sistema) no menu e no Perfil, salvo na conta 💡 — a base já existe: as cores são variáveis e o tema escuro segue o sistema hoje; falta o seletor manual.

## Premium
- Lembretes de estudo pelo WhatsApp (dias, horários e texto personalizados; opt-in, número verificado, provedor oficial) 💡
- **Plano mais caro (ex.: "Focus Plus"): personalizar as cores da plataforma** 💡 — escolher a cor de destaque (no lugar do azul) a partir de uma paleta pronta, com contraste conferido automaticamente nos temas claro e escuro; a marca Focus (logo) não muda. Poderia somar outros extras do plano (temas prontos, ícone do app, sons do alarme).

## Instituições
- Selo "verificado" por e-mail institucional (opcional) 💡
- Códigos de convite para escolas sem e-mail institucional 💡

---

## Já implementadas (saíram do banco de ideias)
- Ranking por organização/instituição (dentro da instituição e entre instituições) ✅
- Catálogo de áreas e temas com atualização pela comunidade ✅
- Tags no perfil (áreas, temas, objetivos) ✅
- Categoria pessoal (produtividade fora dos estudos, fora dos rankings) ✅
- CPF verificado + uma conta por CPF para rankings de instituição ✅
