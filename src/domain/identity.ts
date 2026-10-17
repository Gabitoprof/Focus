/** Mantém só os dígitos ("123.456.789-09" → "12345678909"). */
export function cpfDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Valida o CPF pelos dígitos verificadores. Não prova que o CPF existe nem que pertence à
 * pessoa — isso exige consulta oficial (ex.: Serpro) ou a cobrança do meio de pagamento.
 */
export function isValidCpf(input: string): boolean {
  const d = cpfDigits(input);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  return check(9) === n[9] && check(10) === n[10];
}

/** Matrícula padronizada: maiúsculas, só letras e dígitos. */
export function normalizeEnrollment(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código público da conta, ex.: "FCS-7K2Q9XMP". `random` recebe n bytes aleatórios. */
export function generatePublicCode(random: (n: number) => Uint8Array): string {
  const bytes = random(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `FCS-${code}`;
}
