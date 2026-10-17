/**
 * Gera uma página HTML (com tabelas e diagramas Mermaid renderizados) a partir de um .md de docs/.
 * Uso: node scripts/render-doc.mjs docs/02-userflow.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Informe o arquivo: node scripts/render-doc.mjs docs/arquivo.md");
const md = readFileSync(input, "utf8");
const title = (md.match(/^#\s+(.+)$/m) ?? [, "Documento"])[1];
const out = input.replace(/\.md$/, ".html");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/</g, "&lt;")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { --blue: #274dea; --black: #0a0a0a; --text: #0a0a0a; --muted: #525252; --border: #e8e8e8; --soft: #f5f5f5; --bg: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --text: #fafafa; --muted: #a3a3a3; --border: #262626; --soft: #171717; --bg: #000000; --blue: #8fa4f7; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 Poppins, system-ui, sans-serif; }
  header { background: var(--black); color: #fff; padding: 20px 24px; }
  header b { color: #274dea; font-weight: 600; font-size: 22px; letter-spacing: -0.02em; }
  main { max-width: 980px; margin: 0 auto; padding: 24px 16px 80px; }
  h1 { font-size: 34px; letter-spacing: -0.03em; line-height: 1.1; }
  h2 { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); letter-spacing: -0.02em; }
  h3 { margin-top: 32px; }
  a { color: var(--blue); }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; display: block; overflow-x: auto; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; }
  code { background: var(--soft); padding: 1px 6px; border-radius: 6px; font-size: 13px; }
  .mermaid { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin: 16px 0; overflow-x: auto; }
  hr { border: 0; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<header><b>Focus</b></header>
<main id="doc">Carregando…</main>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
  const md = ${JSON.stringify(md)};
  const renderer = new marked.Renderer();
  const baseCode = renderer.code.bind(renderer);
  renderer.code = (code, lang) => lang === "mermaid" ? '<div class="mermaid">' + code + "</div>" : baseCode(code, lang);
  document.getElementById("doc").innerHTML = marked.parse(md, { renderer });
  mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { primaryColor: "#eef2fe", primaryBorderColor: "#274dea", primaryTextColor: "#0a0a0a", lineColor: "#274dea", fontFamily: "Poppins, sans-serif" } });
  mermaid.run({ querySelector: ".mermaid" });
</script>
</body>
</html>
`;
writeFileSync(out, html);
console.log(path.resolve(out));
