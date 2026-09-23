// app/api/leads/route.ts
// POST /api/leads  — recibe envíos de la landing y los guarda en Google Sheets.
// OPTIONS /api/leads — responde el preflight de CORS.

import { NextRequest, NextResponse } from "next/server";
import { validateLead } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rateLimit";
import { appendLead } from "@/lib/googleSheets";

// La landing es un HTML estático servido en otro dominio; esta ruta necesita
// ejecutarse en el runtime de Node (googleapis usa APIs de Node, no Edge).
export const runtime = "nodejs";
// Nunca cachear: cada POST es una escritura.
export const dynamic = "force-dynamic";

/**
 * Cabeceras CORS. El origen permitido se configura por variable de entorno.
 *
 * ALLOWED_ORIGIN por defecto es "*" para facilitar las pruebas.
 * EN PRODUCCIÓN restríngelo a tu dominio propio, p. ej.:
 *   ALLOWED_ORIGIN=https://landing.comunik2.pe
 * Un "*" permite que cualquier sitio invoque este endpoint.
 */
function corsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Respuesta JSON con las cabeceras CORS ya incluidas. */
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

/** Intenta obtener la IP real del cliente detrás de proxies (Vercel, etc.). */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Preflight CORS.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  // 1) Parsear JSON.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido." }, 400);
  }

  // 2) Rate limiting por IP (429).
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return json(
      {
        ok: false,
        error: "Demasiados envíos. Intenta de nuevo en un minuto.",
      },
      429,
    );
  }

  // 3) Validación (400). Incluye honeypot, source y teléfono peruano.
  const result = validateLead(body);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  // 4) Guardar en Google Sheets (500 si falla).
  try {
    await appendLead(result.data, {
      ip,
      userAgent: req.headers.get("user-agent") || undefined,
    });
  } catch (err) {
    // Loguear el detalle SOLO en el servidor; nunca exponerlo al cliente.
    console.error("[/api/leads] Error al escribir en Google Sheets:", err);
    return json(
      {
        ok: false,
        error: "No se pudo registrar tu solicitud. Inténtalo más tarde.",
      },
      500,
    );
  }

  return json({ ok: true }, 200);
}
