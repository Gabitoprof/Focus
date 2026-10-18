/**
 * Trata os ícones das conquistas e das categorias (PNG 1024x1024 com fundo escuro) para a página de
 * Conquistas: fundo transparente, recorte no limite do ícone e versões 128px (1x) e 256px (2x).
 *
 *   node scripts/process-achievement-icons.mjs [pasta-de-origem]
 *   (padrão: C:\Users\Gabriel Moura\Downloads\Focus-icons-achiv)
 *
 * Como o fundo é removido (sem cortar partes escuras do próprio ícone):
 *  1. Cor de fundo = mediana dos pixels das bordas.
 *  2. Preenchimento a partir das bordas: só vira fundo o que é parecido com essa cor E está ligado
 *     às bordas (o céu escuro dentro de uma moldura continua opaco).
 *  3. Dentro dessa região a transparência é gradual (pela distância de cor ao fundo), para o brilho
 *     (glow) e a borda saírem suaves; a cor dos pixels semitransparentes é "descontaminada" do fundo.
 *  4. Suavização de ~1px na borda; recorte no conteúdo visível com margem igual de 4%; canvas quadrado.
 * Também gera prévias sobre #0a0a0a e branco em .icon-previews/ (fora do Git) para conferir halos.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = process.argv[2] ?? "C:\\Users\\Gabriel Moura\\Downloads\\Focus-icons-achiv";
const OUT_ACH = path.join("public", "achievements");
const OUT_CAT = path.join("public", "achievement-categories");
const PREVIEW = ".icon-previews";

/** Número do arquivo → id da conquista (mesma ordem da lista em src/domain/achievements.ts). */
const ACHIEVEMENTS = [
  "primeiro_foco", "primeiro_ciclo", "dez_ciclos", "cem_ciclos",
  "sequencia_3", "sequencia_7", "sequencia_30", "sequencia_100",
  "horas_10", "horas_50", "horas_100", "horas_500", "horas_1000", "maratona",
  "pomodoro_25", "deep_work", "deep_work_10", "intervalo_em_dia", "madrugador", "coruja",
  "explorador", "polimata", "catalogo",
  "projeto_concluido", "em_equipe", "primeiro_amigo", "turma", "vinculo_institucional",
];
const CATEGORIES = ["inicio", "constancia", "horas", "metodo", "explorar", "equipe"];

// Limiares de distância de cor ao fundo (0–441): abaixo de LOW é fundo puro; acima de HIGH é ícone.
const LOW = Number(process.env.ICON_LOW ?? 22);
const HIGH = Number(process.env.ICON_HIGH ?? 100);
const PAD = 0.04;

function findFile(dir, prefix) {
  const hit = (d) => (existsSync(d) ? readdirSync(d).find((f) => f.startsWith(prefix) && f.endsWith(".png") && !f.includes("(1)")) : null);
  for (const d of [dir, path.join(dir, "icons-per-category"), path.join(dir, "..")]) {
    const f = hit(d);
    if (f) return path.join(d, f);
  }
  return null;
}

async function removeBackground(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // 1) Cor de fundo: mediana das bordas.
  const border = [];
  for (let x = 0; x < W; x++) border.push(px(x), px((H - 1) * W + x));
  for (let y = 0; y < H; y++) border.push(px(y * W), px(y * W + W - 1));
  const med = (k) => border.map((c) => c[k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [med(0), med(1), med(2)];
  const dist = (i) => Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);

  // 2) Preenchimento a partir das bordas (pixels "parecidos com o fundo", d < HIGH).
  const n = W * H;
  const region = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (!region[i] && dist(i) < HIGH) {
      region[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < W; x++) push(x), push((H - 1) * W + x);
  for (let y = 0; y < H; y++) push(y * W), push(y * W + W - 1);
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }

  // 3) Alfa gradual dentro da região + descontaminação da cor.
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!region[i]) {
      alpha[i] = 1;
      continue;
    }
    const t = Math.min(1, Math.max(0, (dist(i) - LOW) / (HIGH - LOW)));
    alpha[i] = t * t * (3 - 2 * t); // suave (smoothstep)
  }
  // 4) Suavização de ~1px no alfa (média 3x3), só onde há transição.
  const soft = new Float32Array(alpha);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let s = 0;
      let mn = 1;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = alpha[i + dy * W + dx];
          s += a;
          if (a < mn) mn = a;
          if (a > mx) mx = a;
        }
      if (mx - mn > 0.01) soft[i] = s / 9;
    }
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const a = soft[i];
    for (let k = 0; k < 3; k++) {
      const c = data[i * 4 + k];
      // c = a·cor + (1−a)·fundo  →  cor = (c − (1−a)·fundo) / a
      out[i * 4 + k] = a > 0.02 && a < 1 ? Math.max(0, Math.min(255, Math.round((c - (1 - a) * bg[k]) / a))) : c;
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }

  // 5) Recorte no conteúdo visível (alfa > ~10%) com margem igual, em canvas quadrado.
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (out[(y * W + x) * 4 + 3] > 26) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const side = Math.round(Math.max(bw, bh) * (1 + 2 * PAD));
  const cropped = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .png()
    .toBuffer();
  const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left: Math.round((side - bw) / 2), top: Math.round((side - bh) / 2) }])
    .png()
    .toBuffer();
  return { square, bg };
}

async function exportIcon(file, outDir, id, previews) {
  const { square, bg } = await removeBackground(file);
  mkdirSync(outDir, { recursive: true });
  await sharp(square).resize(128, 128, { kernel: "lanczos3" }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outDir, `${id}.webp`));
  await sharp(square).resize(256, 256, { kernel: "lanczos3" }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outDir, `${id}@2x.webp`));
  previews.push({ id, buf: await sharp(square).resize(128, 128).png().toBuffer() });
  return bg;
}

/** Prévia: todos os ícones sobre #0a0a0a (em cima) e sobre branco (embaixo). */
async function contactSheet(items, name) {
  const cols = Math.min(items.length, 7);
  const rows = Math.ceil(items.length / cols);
  const cell = 144;
  const sheet = async (bgc) =>
    sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: bgc } })
      .composite(items.map((it, k) => ({ input: it.buf, left: (k % cols) * cell + 8, top: Math.floor(k / cols) * cell + 8 })))
      .png()
      .toBuffer();
  const dark = await sheet("#0a0a0a");
  const light = await sheet("#ffffff");
  mkdirSync(PREVIEW, { recursive: true });
  await sharp({ create: { width: cols * cell, height: rows * cell * 2, channels: 4, background: "#808080" } })
    .composite([{ input: dark, left: 0, top: 0 }, { input: light, left: 0, top: rows * cell }])
    .png()
    .toFile(path.join(PREVIEW, `${name}.png`));
}

const previewsAch = [];
const missing = [];
for (let k = 0; k < ACHIEVEMENTS.length; k++) {
  const file = findFile(SRC, `focus-${String(k + 1).padStart(2, "0")}-`);
  if (!file) {
    missing.push(`focus-${String(k + 1).padStart(2, "0")} (${ACHIEVEMENTS[k]})`);
    continue;
  }
  const bg = await exportIcon(file, OUT_ACH, ACHIEVEMENTS[k], previewsAch);
  console.log(`${ACHIEVEMENTS[k].padEnd(22)} ← ${path.basename(file)}  (fundo rgb ${bg.join(",")})`);
}
const previewsCat = [];
for (let k = 0; k < CATEGORIES.length; k++) {
  const file = findFile(SRC, `focus-cat-${String(k + 1).padStart(2, "0")}-`);
  if (!file) {
    missing.push(`focus-cat-${String(k + 1).padStart(2, "0")} (${CATEGORIES[k]})`);
    continue;
  }
  await exportIcon(file, OUT_CAT, CATEGORIES[k], previewsCat);
  console.log(`categoria ${CATEGORIES[k].padEnd(12)} ← ${path.basename(file)}`);
}
if (previewsAch.length) await contactSheet(previewsAch, "conquistas");
if (previewsCat.length) await contactSheet(previewsCat, "categorias");
console.log(`\n${previewsAch.length} conquistas e ${previewsCat.length} categorias geradas. Prévias em ${PREVIEW}/`);
if (missing.length) console.log("Não encontrados:", missing.join(", "));
