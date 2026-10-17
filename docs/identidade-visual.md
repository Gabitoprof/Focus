# Identidade visual — Focus

## Marca

- **O nome é a marca.** Logotipo tipográfico: "Focus" em **Poppins SemiBold**, espaçamento entre letras −2%. Não há símbolo.
- Cor do logotipo: **azul #274DEA**. Sobre fundos azuis, use a versão branca.
- Arquivos vetoriais (contornos gerados da própria fonte, não dependem da fonte instalada):
  - `public/brand/focus-azul.svg` (padrão)
  - `public/brand/focus-preto.svg`
  - `public/brand/focus-branco.svg`
- Ícone da aba do navegador (`src/app/icon.svg`): letra **F** em Poppins Bold, azul sobre quadrado preto. É uma redução do logotipo, não um símbolo novo.
- Para regenerar os arquivos: `node scripts/build-brand-assets.mjs`.

## Cores

| Papel | Cor | Uso |
|---|---|---|
| Azul Focus | `#274DEA` | Logotipo, botões principais, item ativo, progresso do cronômetro, destaques |
| Preto | `#0A0A0A` | Barra lateral, cabeçalho, áreas de marca, texto principal (modo claro) |
| Branco | `#FFFFFF` | Fundos (modo claro), texto sobre azul e sobre preto |
| Azul claro (texto) | `#8FA4F7` | Links e textos azuis sobre fundo preto (o azul da marca fica com contraste baixo para texto pequeno no preto) |

Contraste verificado: branco sobre `#274DEA` = 6,3:1 · `#274DEA` sobre branco = 6,3:1 · `#8FA4F7` sobre `#0A0A0A` ≈ 7,6:1. O azul da marca sobre preto (≈3,3:1) só é usado em textos grandes (logotipo e títulos).

Cores de estado (sucesso, atenção, erro) e as cores das categorias são funcionais e ficam fora da paleta da marca.

## Tipografia

- **Poppins** em toda a interface (400 texto, 500 rótulos e botões, 600 títulos e logotipo).
- Títulos grandes: espaçamento entre letras −3%, entrelinha 1,05.
- Dígitos do cronômetro: **Geist Mono**, para os números não "pularem" a cada segundo.

## Princípios de interface

- Minimalista: muito espaço em branco, poucas bordas, sem sombras pesadas nem gradientes.
- O preto estrutura (navegação, áreas de marca); o azul indica ação e progresso — nunca decoração.
- Botões em formato pílula; campos com cantos levemente arredondados.
- Modo claro e escuro: no escuro o fundo é preto puro e as superfícies quase pretas.
