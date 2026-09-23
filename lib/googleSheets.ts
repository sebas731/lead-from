// lib/googleSheets.ts
// Cliente de Google Sheets con cuenta de servicio (JWT) y función appendLead.

import { google } from "googleapis";
import type { LeadInput } from "./validate";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Metadatos del request que acompañan al lead. */
export interface LeadMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Construye un cliente autenticado de Sheets usando la cuenta de servicio.
 * Lee las credenciales de las variables de entorno. Lanza un error claro
 * (en el servidor) si falta configuración.
 */
function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    throw new Error(
      "Faltan credenciales: define GOOGLE_SHEETS_CLIENT_EMAIL y GOOGLE_SHEETS_PRIVATE_KEY.",
    );
  }

  // En archivos .env la clave privada se guarda en una sola línea con los
  // saltos escapados como \n. Hay que convertirlos de vuelta a saltos reales.
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [SHEETS_SCOPE],
  });

  return google.sheets({ version: "v4", auth });
}

/** Fecha/hora legible en Lima (GMT-5), formato dd/mm/aaaa HH:MM:SS. */
function formatLimaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get(
    "minute",
  )}:${get("second")}`;
}

/**
 * Etiqueta legible por origen, para que la hoja no muestre solo el slug.
 */
function sourceLabel(source: LeadInput["source"]): string {
  switch (source) {
    case "hero":
      return "Hero";
    case "cobertura":
      return "Cobertura";
    case "modal_contratar":
      return "Modal Contratar";
    case "modal_promo":
      return "Modal Promo";
    default:
      return source;
  }
}

/**
 * Agrega una fila a la Google Sheet con los datos del lead.
 * Lanza si falla la API (el caller decide cómo responder al cliente).
 *
 * Orden de columnas (A:J):
 *   A Fecha/Hora ISO
 *   B Fecha/Hora Lima (legible, GMT-5)
 *   C Origen
 *   D Nombre
 *   E Teléfono
 *   F Plan de interés
 *   G Términos aceptados (Sí/No)
 *   H URL de origen
 *   I IP | User-Agent  (metadatos opcionales)
 *   J Distrito (opcional; lo recoge el popup promocional)
 */
export async function appendLead(
  lead: LeadInput,
  meta: LeadMeta = {},
): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || "Leads!A:J";

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEETS_SPREADSHEET_ID.");
  }

  const now = new Date();

  const row = [
    now.toISOString(), // A
    formatLimaDate(now), // B
    sourceLabel(lead.source), // C
    lead.name ?? "", // D
    lead.phone, // E
    lead.plan ?? "", // F
    lead.acceptedTerms ? "Sí" : "No", // G
    lead.pageUrl ?? "", // H
    [meta.ip, meta.userAgent].filter(Boolean).join(" | "), // I
    lead.district ?? "", // J
  ];

  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });
}
