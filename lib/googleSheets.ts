// lib/googleSheets.ts
// Cliente de Google Sheets con cuenta de servicio (JWT) y función appendLead.

import { google } from "googleapis";
import type { LeadInput } from "./validate";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Metadatos del request que acompañan al lead (por ahora no se escriben en la hoja). */
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

/**
 * Agrega una fila a la Google Sheet con los datos del lead.
 * Lanza si falla la API (el caller decide cómo responder al cliente).
 *
 * IMPORTANTE: esta landing comparte la hoja del call center (pestaña "S6") y
 * SOLO escribe 2 columnas de esa pestaña, en este orden:
 *   E  Número de teléfono
 *   F  Ubicacion (distrito; solo lo envía el popup promocional, si no va vacío)
 *
 * Por eso GOOGLE_SHEETS_RANGE debe apuntar a esas dos columnas, p. ej. "S6!E:F".
 * El append escribe la fila empezando en la columna E, sin tocar A–D ni G en
 * adelante (las columnas que gestiona el equipo: ID Anuncio, Campaña, Estado…).
 *
 * `meta` (ip/userAgent) se recibe por compatibilidad pero, con este esquema de
 * 2 columnas, no se escribe en la hoja.
 */
export async function appendLead(
  lead: LeadInput,
  _meta: LeadMeta = {},
): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || "S6!E:F";

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEETS_SPREADSHEET_ID.");
  }

  // Solo 2 columnas: E = teléfono, F = ubicación (distrito).
  const row = [
    lead.phone, // E · Número de teléfono
    lead.district ?? "", // F · Ubicacion
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
