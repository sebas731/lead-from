// lib/validate.ts
// Validación de los datos que llegan a POST /api/leads.
// No depende de librerías externas: solo lógica pura y tipada.

/** Los 4 orígenes de captura permitidos en la landing. */
export const ALLOWED_SOURCES = [
  "hero", // Formulario del hero ("¡Contrátalo ya!" / "Llámenme")
  "cobertura", // "Valida la cobertura en tu zona"
  "modal_contratar", // Modal "Contrátalo ya" (header, planes, beneficios, footer)
  "modal_promo", // Modal promocional (popup automático)
] as const;

export type LeadSource = (typeof ALLOWED_SOURCES)[number];

/** Payload ya validado y normalizado, listo para escribir en la hoja. */
export interface LeadInput {
  phone: string;
  source: LeadSource;
  name?: string;
  plan?: string;
  district?: string; // Distrito (opcional; lo recoge el popup promocional).
  acceptedTerms: boolean;
  pageUrl?: string;
  honeypot?: string;
}

export type ValidationResult =
  | { ok: true; data: LeadInput }
  | { ok: false; error: string };

/**
 * Normaliza un teléfono peruano y valida que sea un celular razonable.
 * Acepta: "987654321", "+51987654321", "51 987 654 321", "987-654-321".
 * Regla: los celulares peruanos tienen 9 dígitos y empiezan con 9.
 * Devuelve el número en formato canónico de 9 dígitos, o null si no es válido.
 */
export function normalizePeruMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  // Quitar espacios, guiones, paréntesis y el prefijo internacional.
  let digits = raw.replace(/[\s\-().]/g, "");

  // Quitar prefijo +51 o 51 al inicio.
  if (digits.startsWith("+51")) digits = digits.slice(3);
  else if (digits.startsWith("51") && digits.length === 11) digits = digits.slice(2);

  // Debe quedar exactamente 9 dígitos y empezar con 9.
  if (!/^9\d{8}$/.test(digits)) return null;

  return digits;
}

function asOptionalString(value: unknown, maxLen = 200): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxLen);
}

/**
 * Valida el body crudo del request. Devuelve datos normalizados o un error
 * con mensaje apto para el cliente (400).
 */
export function validateLead(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "El cuerpo de la solicitud es inválido." };
  }

  const b = body as Record<string, unknown>;

  // Honeypot: campo trampa. Si viene con contenido, es un bot → rechazar.
  // Se rechaza de forma silenciosa (mensaje genérico) para no dar pistas.
  if (typeof b.honeypot === "string" && b.honeypot.trim().length > 0) {
    return { ok: false, error: "Solicitud rechazada." };
  }

  // Source: debe ser uno de los 4 valores permitidos.
  const source = b.source;
  if (
    typeof source !== "string" ||
    !ALLOWED_SOURCES.includes(source as LeadSource)
  ) {
    return {
      ok: false,
      error: "El campo 'source' es requerido y debe ser un origen válido.",
    };
  }

  // Phone: requerido y con formato de celular peruano.
  const phone = normalizePeruMobile(b.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "El teléfono es requerido y debe ser un celular peruano válido (9 dígitos).",
    };
  }

  // acceptedTerms: se normaliza a booleano (acepta true/"true"/"on"/1).
  const acceptedTerms =
    b.acceptedTerms === true ||
    b.acceptedTerms === "true" ||
    b.acceptedTerms === "on" ||
    b.acceptedTerms === 1;

  return {
    ok: true,
    data: {
      phone,
      source: source as LeadSource,
      name: asOptionalString(b.name, 120),
      plan: asOptionalString(b.plan, 120),
      district: asOptionalString(b.district, 120),
      acceptedTerms,
      pageUrl: asOptionalString(b.pageUrl, 500),
      honeypot: undefined,
    },
  };
}
