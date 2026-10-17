// Confere a chave da CNPJá com uma consulta (CNPJ público do Banco do Brasil). Nunca imprime a chave.
// Uso: node --env-file=.env.local scripts/check-cnpja.mjs
const key = process.env.CNPJ_API_KEY;
const base = key ? "https://api.cnpja.com" : "https://open.cnpja.com";
const res = await fetch(`${base}/office/00000000000191`, { headers: key ? { Authorization: key } : {} });
const body = await res.json().catch(() => null);
console.log(
  JSON.stringify({
    api: key ? "comercial" : "pública (sem chave)",
    http: res.status,
    encontrado: Boolean(body?.taxId),
    situacao: body?.status?.text ?? null,
    erro: res.ok ? null : (body?.message ?? null),
  }),
);
