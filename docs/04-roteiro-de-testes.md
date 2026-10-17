# Roteiro de testes pendentes

Tudo o que foi implementado e ainda não foi testado por você. Senha das contas demo: [data/demo/CONTAS-DEMO.md](../data/demo/CONTAS-DEMO.md). Servidor: `localhost:3000`.

> Dica: use uma janela anônima por conta para comparar papéis lado a lado (ex.: aluno × professor).

## 0. Revisar as contas de demonstração (primeiro passo)
Entrar em cada conta e ver se o papel e os dados fazem sentido (lista completa em [CONTAS-DEMO.md](../data/demo/CONTAS-DEMO.md)).
- [ ] **PUC Minas (instituição verificada):** `reitoria.puc` (dona), `clovis.professor` (gestor), `aluno1.puc` … `aluno6.puc` (alunos aceitos), `aluno.pendente` (vínculo aguardando aceite).
- [ ] **UFMG (sem conta na Focus):** `aluno1.ufmg` … `aluno5.ufmg` — vínculo declarado, valendo na hora.
- [ ] **Acme Tecnologia (empresa verificada):** `rafael.ceo` (dono), `paula.gestora` (gestora), `lucas.dev` e `marina.qa` (funcionários), `joao.novo` (pedido pendente).
- [ ] **Sem vínculo:** `sofia.semvinculo` (Pessoal + ranking geral + amigos), `pedro.concurso` (sem assinatura, vê o Premium).
- [ ] **Fila do admin:** `diretora.escola` (pediu cadastro de escola).
- [ ] Em cada conta: nome, perfis liberados/bloqueados, Painel com horas das últimas 6 semanas, posição no ranking, organização e conquistas.
- [ ] Anotar o que faltou ou ficou estranho (papel que você esperava e não existe, dados pouco realistas, nomes) para eu ajustar.

## 1. Correção de sessões (novo) — `aluno1.puc` (Ana)
- [ ] Painel → fim da página → "Corrigir sessões desta semana" lista as sessões da semana.
- [ ] **Reduzir tempo**: informe menos minutos → popup mostra tempo e XP removidos → confirmar. Sessão mostra "era Xmin".
- [ ] Tente informar o mesmo tempo ou mais → recusa ("Não é possível acrescentar horas").
- [ ] Reduzir de novo a mesma sessão → só aparece "Excluir sessão".
- [ ] Reduzir abaixo do planejado → XP do ciclo some (veja o saldo no menu e o Histórico → extrato de XP).
- [ ] **Excluir** → some do Painel, do Histórico e das contagens; horas da semana e ranking caem.
- [ ] Sessão de projeto corrigida → Registro → Projetos → projeto → "Atividade recente" mostra "Ana removeu…" ou "(era…)".

## 2. Cronograma (Gantt) — `aluno1.puc` ou `clovis.professor`
- [ ] Registro → Projetos → "Projeto Integrador 2026/1" → aba **Cronograma**.
- [ ] Fases, barras, setas de dependência, linha "hoje", marcos de início e entrega; "Banco de dados" em vermelho (atrasada).
- [ ] Alternar **Semanas / Meses**.
- [ ] Como dono (Clóvis): Visão geral → **Editar** numa tarefa → mudar datas, fase e dependências → conferir no gráfico.
- [ ] Tentar prazo antes do início e uma dependência em ciclo → recusa.
- [ ] Tarefa sem datas aparece na lista abaixo do gráfico.

## 3. Perfis e contextos (Pessoal / Acadêmico / Profissional)
- [ ] `aluno1.puc`: alterna entre Acadêmico e Pessoal; Profissional aparece bloqueado.
- [ ] `lucas.dev`: Profissional liberado; Acadêmico bloqueado.
- [ ] `sofia.semvinculo`: só Pessoal; estuda pela área Acadêmica e entra no ranking geral marcada "sem vínculo".
- [ ] Registro (antes "Categoria"): modos **Estude** e **Projetos**; área do registro vem dos temas (não dá para escolher livremente); filtro escola / vestibular / faculdade no catálogo (inclui tabela CNPq).

## 4. Projetos e mover entre perfis
- [ ] Criar projeto, convidar pelo código público, aceitar convite em outra conta, criar tarefas.
- [ ] `lucas.dev`: pedido de mover projeto → `rafael.ceo` aprova/recusa na fila; popup duplo ao levar do Pessoal para a empresa.
- [ ] `paula.gestora`: projeto movido aparece riscado "movido por" na organização.
- [ ] Banco de horas do perfil no Painel (Pessoal/Profissional).

## 5. Organizações
- [ ] `reitoria.puc`: Organização → painel admin: pedidos de vínculo (aceitar `aluno.pendente`), lista de matrículas (roster), vínculo e-MEC, página pública.
- [ ] `aluno.pendente`: antes do aceite, aparece "pendente" no perfil e fora do ranking da instituição; depois do aceite, Acadêmico liberado.
- [ ] `joao.novo` pendente na Acme → `rafael.ceo` aceita.
- [ ] Cadastrar organização nova (Organização → nova) com um CNPJ real → checagens CNPJá + e-mail de confirmação (Resend só entrega para o e-mail da sua conta Resend).
- [ ] Privacidade: empresa só vê o perfil Profissional dos funcionários.

## 6. Rankings
- [ ] Ranking: períodos **dia / semana / mês / total**; colunas horas na plataforma, horas do perfil, XP compacto, título.
- [ ] Aba instituições: ordenar por média e por total; medalhas semanais; clicar na instituição abre a página dela.
- [ ] Ranking de amigos.
- [ ] `pedro.concurso`: vê o convite Premium no lugar da posição.

## 7. Amigos — conta do seu perfil e `sofia.semvinculo`
- [ ] Perfil → Amigos: há um pedido pendente da Sofia para você → aceitar.
- [ ] Adicionar alguém pelo código público (FCS-…), recusar, desfazer amizade.

## 8. Conquistas — qualquer conta
- [ ] Aba **Conquistas**: 28 conquistas em 6 grupos, com progresso e "como desbloquear".

## 9. Console Master — `focus.developer@outlook.com` (sua conta)
- [ ] Item **Master** aparece só para você (não aparece em contas demo).
- [ ] Visão geral, Empresas e Instituições com estatísticas.
- [ ] Fila de análise de organizações: `diretora.escola` (escola) aguardando → aprovar/recusar.
- [ ] Abrir `/master` logado numa conta demo → acesso negado, sem cabeçalho.

## 10. Textos e idiomas
- [ ] Menu: "Foque" (antes "Estudar") e "Painel" (antes "Dashboard").
- [ ] Landing: "Foque no que importa. Evolua todo dia." com "Para você, sua turma ou sua empresa." em destaque.
- [ ] Trocar idioma (EN / ES) no rodapé do menu e conferir as telas novas.

## 11. Conta e e-mail
- [ ] "Esqueci a senha" com focus.developer@outlook.com → e-mail chega via Resend.
- [ ] Login com a nova senha.

---
Comandos úteis (com o servidor **parado**):
- `npm run demo:seed -- --reset` — recria as contas e dados de demonstração.
- `npm run demo:schedule` — refaz o cronograma da demo com datas a partir de hoje.
