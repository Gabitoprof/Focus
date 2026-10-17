/**
 * Gera os arquivos da marca a partir da fonte Poppins (contornos vetoriais, sem depender
 * da fonte instalada): logotipo "Focus" e ícone "F" da aba do navegador.
 * Uso: node scripts/build-brand-assets.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const BLUE = "#274DEA";
const BLACK = "#0A0A0A";
const root = process.cwd();
const fontFile = (w) => path.join(root, `node_modules/@fontsource/poppins/files/poppins-latin-${w}-normal.woff`);
const load = (w) => {
  const buf = readFileSync(fontFile(w));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

const semibold = load(600);
const bold = load(700);

/** Contorno de um texto, com viewBox justo. */
function textPath(font, text, size, letterSpacing = 0) {
  const p = font.getPath(text, 0, 0, size, { letterSpacing });
  const bb = p.getBoundingBox();
  return { d: p.toPathData(2), bb };
}

// Logotipo: "Focus" em Poppins SemiBold, azul.
{
  const { d, bb } = textPath(semibold, "Focus", 100, -0.02);
  const pad = 2;
  const w = Math.ceil(bb.x2 - bb.x1 + pad * 2);
  const h = Math.ceil(bb.y2 - bb.y1 + pad * 2);
  const svg = (fill) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(bb.x1 - pad).toFixed(2)} ${(bb.y1 - pad).toFixed(2)} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Focus"><path fill="${fill}" d="${d}"/></svg>\n`;
  mkdirSync(path.join(root, "public/brand"), { recursive: true });
  writeFileSync(path.join(root, "public/brand/focus-azul.svg"), svg(BLUE));
  writeFileSync(path.join(root, "public/brand/focus-preto.svg"), svg(BLACK));
  writeFileSync(path.join(root, "public/brand/focus-branco.svg"), svg("#FFFFFF"));
}

// Ícone da aba: "F" em Poppins Bold, azul sobre fundo preto.
{
  const size = 26;
  const { d, bb } = textPath(bold, "F", size);
  const gw = bb.x2 - bb.x1;
  const gh = bb.y2 - bb.y1;
  const dx = (32 - gw) / 2 - bb.x1;
  const dy = (32 - gh) / 2 - bb.y1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BLACK}"/><path transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})" fill="${BLUE}" d="${d}"/></svg>\n`;
  writeFileSync(path.join(root, "src/app/icon.svg"), svg);
}

console.log("Arquivos da marca gerados.");
