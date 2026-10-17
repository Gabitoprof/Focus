/**
 * Gera os ícones das conquistas com o Gemini (Nano Banana Pro), no estilo de conquistas da Steam:
 * arte quadrada, pintada, um objeto central, mesma paleta escura da Focus.
 *
 *   node scripts/achievement-icons.mjs                       # gera os que faltam
 *   node scripts/achievement-icons.mjs --only primeiro_foco,coruja
 *   node scripts/achievement-icons.mjs --force               # refaz todos (custa créditos)
 *
 * Original em data/achievement-icons/<id>.png; versão do site em public/achievements/<id>.webp (256px).
 * A chave vem de GEMINI_API_KEY (ou Gemini_AI_Studio_API_KEY) no .env.local e nunca é impressa.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

const STYLE = [
  "Square video-game achievement icon, in the style of Steam achievement badges.",
  "Rich painterly digital illustration, semi-realistic, strong rim lighting, high detail, crisp silhouette readable at 64x64 pixels.",
  "One single central subject filling about 70% of the frame, slight 3/4 view.",
  "Background: deep near-black navy (#0b0d14) with a soft radial glow behind the subject.",
  "Color palette: cobalt blue (#2f5bff) as the main accent glow, warm gold highlights only for small details, everything else dark and desaturated.",
  "No text, no letters, no numbers unless stated, no border, no frame, no watermark, no UI elements.",
  "Consistent series look: same lighting, same rendering style, same background treatment.",
].join(" ");

/** Assunto de cada conquista (em inglês, que o modelo segue melhor). */
const SUBJECTS = {
  primeiro_foco: "a single candle freshly lit on a wooden study desk beside an open notebook, the first spark of concentration",
  primeiro_ciclo: "a round mechanical focus timer whose glowing blue ring has just completed one full circle",
  dez_ciclos: "ten small glowing blue rings orbiting in a neat spiral around a pocket watch",
  cem_ciclos: "a polished silver hourglass on a pedestal surrounded by a halo of one hundred tiny blue sparks",
  sequencia_3: "three small flames in a row on candle wicks, each one brighter than the previous",
  sequencia_7: "a calendar page of one week with all seven days marked by small blue flames",
  sequencia_30: "a blazing torch with a steady blue-white flame mounted on a stone wall",
  sequencia_100: "a phoenix made of blue fire rising with wings spread, majestic",
  horas_10: "a small seedling sprouting from an open book, lit by a soft blue light",
  horas_50: "a young tree growing from a stack of books, leaves glowing faint blue",
  horas_100: "a sturdy oak tree on top of a tall stack of books, glowing blue leaves",
  horas_500: "a towering library tower reaching into a starry sky, windows glowing blue",
  horas_1000: "a radiant golden crown resting on an ancient open tome, blue magical light rising from the pages",
  maratona: "a pair of running shoes with blue light trails, and a finish line ribbon",
  pomodoro_25: "a classic red tomato-shaped kitchen timer, slightly stylized, with a blue glow around it",
  deep_work: "a diver descending into deep dark blue water toward a glowing light below, calm and focused",
  deep_work_10: "a submarine with a bright blue searchlight exploring the deep abyss",
  intervalo_em_dia: "a steaming cup of coffee next to a small hourglass, both resting on a saucer, cozy and punctual",
  madrugador: "a rooster silhouette against a sunrise, blue dawn sky with a thin golden horizon",
  coruja: "a wise owl with large glowing blue eyes perched on a stack of books under a crescent moon",
  explorador: "an old brass compass on a parchment map with three glowing blue markers",
  polimata: "a crystal prism splitting a beam of light into six colored rays, each touching a different tiny symbol (atom, leaf, gear, musical note, quill, globe)",
  catalogo: "a neatly organized wooden card catalog drawer slightly open, cards glowing with blue light",
  projeto_concluido: "a rolled blueprint tied with a ribbon next to a glowing blue checkmark seal",
  em_equipe: "several hands stacked together in the center, team spirit, blue light from below",
  primeiro_amigo: "two hands doing a handshake, with a soft blue glow between them",
  turma: "a circle of five small figures seen from above holding hands around a glowing blue star",
  vinculo_institucional: "a classic university building facade with columns and a glowing blue crest above the entrance",
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only"));
const only = onlyArg ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : args[args.indexOf(onlyArg) + 1]).split(",") : null;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || env.Gemini_AI_Studio_API_KEY;
if (!key) throw new Error("Defina GEMINI_API_KEY no .env.local");

const RAW = new URL("../data/achievement-icons/", import.meta.url);
const WEB = new URL("../public/achievements/", import.meta.url);
mkdirSync(RAW, { recursive: true });
mkdirSync(WEB, { recursive: true });

async function generate(id, subject) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE}\n\nSubject: ${subject}.` }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${id}: ${res.status} ${body.error?.message ?? ""}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error(`${id}: o modelo não devolveu imagem (${body.candidates?.[0]?.finishReason ?? "?"})`);
  const png = Buffer.from(part.inlineData.data, "base64");
  writeFileSync(new URL(`${id}.png`, RAW), png);
  await sharp(png).resize(256, 256, { fit: "cover" }).webp({ quality: 88 }).toFile(new URL(`${id}.webp`, WEB).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

const ids = Object.keys(SUBJECTS).filter((id) => !only || only.includes(id));
let made = 0;
for (const id of ids) {
  if (!force && existsSync(new URL(`${id}.webp`, WEB))) continue;
  process.stdout.write(`${id}... `);
  try {
    await generate(id, SUBJECTS[id]);
    made++;
    console.log("ok");
  } catch (e) {
    console.log("falhou:", e.message);
  }
}
console.log(`${made} ícone(s) gerado(s) com ${MODEL}.`);
