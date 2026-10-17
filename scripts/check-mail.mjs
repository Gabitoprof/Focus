// Envia um e-mail de teste pelo Resend e mostra a resposta (nunca imprime a chave).
// Uso: node --env-file=.env.local scripts/check-mail.mjs destinatario@exemplo.com
const to = process.argv[2];
if (!to) throw new Error("Informe o destinatário: node --env-file=.env.local scripts/check-mail.mjs voce@exemplo.com");
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject: "Focus — teste de envio", text: "Se você recebeu, o envio de e-mails está funcionando." }),
});
console.log(JSON.stringify({ http: res.status, remetente: process.env.MAIL_FROM, resposta: await res.text() }));
