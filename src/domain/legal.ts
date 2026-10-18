/**
 * Versão vigente dos Termos de Uso e da Política de Privacidade. Ao mudar o texto de forma
 * relevante, troque a versão: quem já aceitou a anterior verá o pedido de aceite de novo.
 */
export const TERMS_VERSION = "2026-10-18";
export const TERMS_UPDATED_AT = "18 de outubro de 2026";
export const LEGAL_CONTACT_EMAIL = "focus.developer@outlook.com";

export const needsTermsAcceptance = (accepted: string | null | undefined) => accepted !== TERMS_VERSION;
