/**
 * Envio de e-mail. Com RESEND_API_KEY definido, usa a API do Resend; caso contrário
 * (desenvolvimento), escreve a mensagem no terminal do servidor.
 */
export async function sendMail(msg: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.info(`\n[email:dev] Para: ${msg.to}\nAssunto: ${msg.subject}\n${msg.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    // O motivo do provedor (ex.: remetente inválido) ajuda a corrigir a configuração.
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (${res.status}). ${detail.slice(0, 300)}`);
  }
}
