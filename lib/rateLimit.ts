// lib/rateLimit.ts
// Rate limiter simple en memoria, por IP. Sin base de datos externa.
//
// LIMITACIÓN CONOCIDA: el estado vive en el proceso. En despliegues
// serverless (p. ej. Vercel) cada instancia/función tiene su propia memoria,
// por lo que el límite es "best effort" para frenar abuso básico, no una
// defensa fuerte. Para algo robusto se usaría Upstash Redis o similar.

interface Bucket {
  count: number;
  resetAt: number; // timestamp (ms) en que se reinicia la ventana
}

const WINDOW_MS = 60_000; // 1 minuto
const MAX_REQUESTS = 5; // máx 5 envíos por IP por minuto

// Map global; sobrevive entre requests dentro del mismo proceso.
const buckets = new Map<string, Bucket>();

// Limpieza perezosa para no acumular IPs viejas indefinidamente.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Registra un intento para la IP dada y dice si se permite.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = ip || "unknown";
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    // Nueva ventana.
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - existing.count,
    retryAfterSeconds: 0,
  };
}
