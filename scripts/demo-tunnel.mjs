/**
 * Demonstração: abre um túnel da Cloudflare (sem conta) para o localhost:3000 e mostra o endereço
 * público (https://….trycloudflare.com). Só para mostrar a Focus a outras pessoas — o app continua
 * rodando neste computador e usa o banco local.
 *
 *   npm run dev            (em um terminal)
 *   npm run demo:tunnel    (em outro; Ctrl+C desliga o túnel)
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const candidates = [
  process.env.CLOUDFLARED,
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
].filter(Boolean);
const bin = candidates.find((p) => existsSync(p)) ?? "cloudflared";
const port = process.env.PORT || "3000";

const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
let shown = false;
const onData = (buf) => {
  const text = buf.toString();
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    writeFileSync(new URL("../.data/demo-url.txt", import.meta.url), m[0] + "\n");
    console.log(`\n  Focus no ar para demonstração: ${m[0]}\n  (Ctrl+C para desligar; o endereço muda a cada vez que liga)\n`);
  }
  if (/ERR|error/i.test(text) && !/Thank you for trying/.test(text)) process.stderr.write(text);
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill());
