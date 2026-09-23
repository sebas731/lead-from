# ComuniK2 · Leads API

Backend mínimo en **Next.js 14 (App Router, TypeScript)** cuyo único propósito
es recibir los envíos de formularios de la landing de ComuniK2 (distribuidor
autorizado Claro) y guardarlos como filas en una **Google Sheet**, usando la
Google Sheets API con una **cuenta de servicio** (no OAuth de usuario).

La landing aprobada (HTML estático con Tailwind por CDN) vive **dentro de este
mismo proyecto** en `public/landing.html` y se sirve en la raíz `/` mediante un
rewrite de Next (ver `next.config.mjs`). Así los formularios hacen `fetch` a
`/api/leads` en el **mismo origen** (sin CORS). El formulario de prueba de
desarrollo quedó en **`/test`**.

La landing tiene 3 puntos de captura de leads (ya conectados a la API). Cada
envío indica de cuál vino mediante el campo `source`:

| `source`          | Formulario en la landing                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `hero`            | Formulario flotante del hero ("¡Contrátalo ya!" / botón "Llámenme")              |
| `modal_contratar` | Modal de contacto (header "Contáctanos", footer "Llámanos ahora", banner Liga1MAX) |
| `modal_promo`     | Popup promocional automático (aparece 800 ms después de cargar) + campo Distrito  |

> `cobertura` sigue siendo un `source` válido en el backend por si se agrega ese
> formulario más adelante, pero la landing actual no lo usa.

No usa base de datos ni Prisma: **todo el almacenamiento es la Google Sheet.**

---

## Índice

1. [Cómo funciona](#cómo-funciona)
2. [Requisitos](#requisitos)
3. [Paso 1 — Proyecto en Google Cloud y habilitar la API](#paso-1--proyecto-en-google-cloud-y-habilitar-la-api)
4. [Paso 2 — Crear la cuenta de servicio y su clave JSON](#paso-2--crear-la-cuenta-de-servicio-y-su-clave-json)
5. [Paso 3 — Crear la Google Sheet y compartirla](#paso-3--crear-la-google-sheet-y-compartirla-crítico)
6. [Paso 4 — Variables de entorno](#paso-4--variables-de-entorno)
7. [Paso 5 — Correr en local](#paso-5--correr-en-local)
8. [Paso 6 — Desplegar en Vercel](#paso-6--desplegar-en-vercel)
9. [La API: `POST /api/leads`](#la-api-post-apileads)
10. [Snippet para pegar en la landing HTML](#snippet-para-pegar-en-la-landing-html)
11. [Seguridad y notas](#seguridad-y-notas)

---

## Cómo funciona

```
Landing HTML (otro dominio)
   │  fetch() POST { phone, source, ... }
   ▼
POST /api/leads  (este proyecto)
   ├─ CORS (preflight OPTIONS + Access-Control-Allow-Origin)
   ├─ Rate limit por IP (5/min, en memoria)
   ├─ Validación (teléfono peruano, source, honeypot)
   └─ googleapis → spreadsheets.values.append
        ▼
   Google Sheet  (una fila por lead)
```

---

## Requisitos

- **Node.js 18.18+** (recomendado 20+).
- Una cuenta de Google (para Google Cloud y la hoja).
- Opcional: cuenta de Vercel para el despliegue.

---

## Paso 1 — Proyecto en Google Cloud y habilitar la API

1. Entra a **[Google Cloud Console](https://console.cloud.google.com/)** con tu
   cuenta de Google.
2. Arriba, en el selector de proyectos, haz clic en **"Proyecto nuevo"**.
   - Nombre: p. ej. `comunik2-leads`. Crea el proyecto y **selecciónalo**.
3. Habilita la Google Sheets API:
   - Menú **☰ → API y servicios → Biblioteca**.
   - Busca **"Google Sheets API"**, ábrela y pulsa **Habilitar**.

> No necesitas configurar "pantalla de consentimiento OAuth": las cuentas de
> servicio no la usan.

---

## Paso 2 — Crear la cuenta de servicio y su clave JSON

1. Menú **☰ → API y servicios → Credenciales**.
2. **Crear credenciales → Cuenta de servicio**.
   - Nombre: p. ej. `leads-writer`. Continúa y **Listo** (no hace falta asignar
     roles a nivel de proyecto: el permiso se da compartiendo la hoja).
3. Abre la cuenta de servicio recién creada → pestaña **Claves**.
4. **Agregar clave → Crear clave nueva → JSON → Crear**.
   - Se descarga un archivo `.json`. **Guárdalo bien y no lo subas a git.**

Ese JSON contiene, entre otros, estos dos campos que necesitarás:

```json
{
  "client_email": "leads-writer@comunik2-leads.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
}
```

- `client_email`  → va en **`GOOGLE_SHEETS_CLIENT_EMAIL`**
- `private_key`   → va en **`GOOGLE_SHEETS_PRIVATE_KEY`**

> **Sobre la clave privada y los `\n`:** dentro del JSON los saltos de línea ya
> vienen escritos como `\n`. Cuando la pongas en `.env.local`, déjala **en una
> sola línea, entre comillas dobles, con los `\n` tal cual** (ver Paso 4). El
> código hace `.replace(/\\n/g, '\n')` para reconstruir los saltos reales.

---

## Paso 3 — Crear la Google Sheet y compartirla (¡CRÍTICO!)

Esta landing **comparte la hoja del call center** (la misma de las campañas de
TikTok). No crea pestaña ni encabezados propios: escribe **solo 2 columnas** de
la pestaña **`S6`**:

| Columna | Encabezado (ya existente) | Qué escribe la landing                          |
| ------- | ------------------------- | ----------------------------------------------- |
| **E**   | Número de teléfono        | El celular capturado (validado, 9 dígitos)      |
| **F**   | Ubicacion                 | El distrito (solo lo envía el popup; si no, vacío) |

Como A–H de S6 son una sola tabla continua, `values.append` ancla la fila en la
**primera columna (A)** aunque el rango diga E:F. Por eso la app manda la fila
con **A–D vacías** + E (teléfono) + F (ubicación), y `GOOGLE_SHEETS_RANGE=S6!A:F`.
Así no se tocan las columnas que gestiona el equipo (ID Anuncio, Campaña, Estado…)
y el dato cae exacto en E y F. La pestaña **siempre se llama `S6`**.

> Nota: con este esquema NO se guardan fecha, origen ni metadatos; solo teléfono
> y ubicación, para encajar en la hoja compartida.

4. **Compartir la hoja con la cuenta de servicio** (este es el paso que más se
   olvida):
   - Pulsa el botón **Compartir** (arriba a la derecha).
   - En "Agregar personas", pega el **`client_email`** de la cuenta de servicio
     (el que termina en `...gserviceaccount.com`).
   - Dale el rol **Editor**.
   - Envía / Guarda.

   > ⚠️ **Sin este paso, la API rechaza el guardado con un error de permisos
   > (403) aunque las credenciales estén perfectas.** La cuenta de servicio es
   > un "usuario" más: si no la invitas a la hoja, no puede escribir en ella.

### Obtener el `GOOGLE_SHEETS_SPREADSHEET_ID`

Está en la URL de la hoja, entre `/d/` y `/edit`:

```
https://docs.google.com/spreadsheets/d/1AbCdEf...GhIjKl/edit#gid=0
                                        └────────┬────────┘
                                     este es el SPREADSHEET_ID
```

---

## Paso 4 — Variables de entorno

Copia el ejemplo y rellénalo:

```bash
cp .env.local.example .env.local
```

`.env.local`:

```dotenv
GOOGLE_SHEETS_CLIENT_EMAIL=leads-writer@comunik2-leads.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=1AbCdEf...GhIjKl
GOOGLE_SHEETS_RANGE=S6!A:F
ALLOWED_ORIGIN=*
```

Notas:

- **`GOOGLE_SHEETS_PRIVATE_KEY`**: cópiala tal cual del JSON, en una sola línea,
  entre comillas dobles, con los `\n` incluidos. No la partas en varias líneas.
- **`ALLOWED_ORIGIN`**: `*` está bien para pruebas. En producción ponlo a tu
  dominio (ver [Seguridad](#seguridad-y-notas)).

---

## Paso 5 — Correr en local

```bash
npm install
npm run dev
```

Abre **http://localhost:3000** — verás la **landing real** de ComuniK2. Envía
cualquiera de sus formularios y revisa que aparezca una fila nueva en tu Google
Sheet. Si prefieres el formulario de prueba simple (con selector de `source`),
está en **http://localhost:3000/test**.

Si algo falla, mira la **consola del servidor** (la terminal donde corre
`npm run dev`): los errores de Google Sheets se loguean ahí con detalle,
mientras que al cliente solo se le devuelve un mensaje genérico.

---

## Paso 6 — Desplegar en Vercel

1. Sube este proyecto a un repositorio (GitHub/GitLab). **`.env.local` NO se
   sube** (está en `.gitignore`).
2. En **[vercel.com](https://vercel.com/)**: **Add New → Project** e importa el
   repo. Vercel detecta Next.js automáticamente.
3. Antes de desplegar (o luego en **Settings → Environment Variables**), agrega
   las mismas 5 variables:
   - `GOOGLE_SHEETS_CLIENT_EMAIL`
   - `GOOGLE_SHEETS_PRIVATE_KEY` — pega el valor **con los `\n`**, entre comillas
     como en `.env.local`. (Vercel guarda el valor literal; el código lo
     desescapa igual que en local.)
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_RANGE`
   - `ALLOWED_ORIGIN` — el dominio de tu landing en producción.
4. **Deploy.** Tu endpoint quedará en `https://<tu-proyecto>.vercel.app/api/leads`.

> El rate limiter es en memoria; en Vercel cada instancia serverless tiene su
> propia memoria, así que el límite es "best effort". Suficiente para frenar
> abuso básico; si necesitas algo estricto, usa Upstash Redis.

---

## La API: `POST /api/leads`

**Request** — `Content-Type: application/json`:

```jsonc
{
  "phone": "987654321",          // requerido; celular peruano (con o sin +51)
  "source": "hero",              // requerido; hero|cobertura|modal_contratar|modal_promo
  "name": "Juan Pérez",          // opcional
  "plan": "3 Play 200Mbps",      // opcional (útil cuando el modal viene de un plan)
  "district": "Miraflores",      // opcional (lo envía el popup promocional)
  "acceptedTerms": true,          // booleano
  "pageUrl": "https://landing...", // opcional
  "honeypot": ""                  // campo trampa anti-spam: debe ir VACÍO
}
```

**Respuestas:**

| Situación                 | Status | Body                                     |
| ------------------------- | ------ | ---------------------------------------- |
| Éxito                     | 200    | `{ "ok": true }`                          |
| Validación fallida        | 400    | `{ "ok": false, "error": "..." }`        |
| Rate limit (>5/min por IP)| 429    | `{ "ok": false, "error": "..." }`        |
| Error de Google Sheets    | 500    | `{ "ok": false, "error": "..." }` (genérico) |

**CORS:** la ruta responde al preflight `OPTIONS` y envía
`Access-Control-Allow-Origin` según `ALLOWED_ORIGIN`.

**Columnas escritas en la hoja** (pestaña `S6`, solo 2): **E** Número de teléfono
· **F** Ubicacion (distrito). El resto de columnas no se tocan.

---

## Snippet para pegar en la landing HTML

> **Nota:** desde la integración de la landing aprobada, este wiring **ya está
> implementado** al final de `public/landing.html` (los 3 formularios llaman a
> `/api/leads` en el mismo origen, con validación de celular peruano, honeypot,
> estado de carga, mensaje de éxito/error y cierre automático del modal). El
> snippet de abajo se conserva solo como referencia para otras landings.

La landing es HTML estático con Tailwind por CDN (sin React). Pega este script
antes de `</body>`. Reemplaza `ENDPOINT` por la URL real de tu despliegue.

```html
<script>
  // === ComuniK2 — envío de leads =========================================
  const LEADS_ENDPOINT = "https://TU-PROYECTO.vercel.app/api/leads";

  /**
   * Envía un lead al backend.
   * @param {Object} data
   * @param {string} data.phone   Celular (requerido)
   * @param {string} data.source  "hero"|"cobertura"|"modal_contratar"|"modal_promo"
   * @param {string} [data.name]  Nombre
   * @param {string} [data.plan]  Plan de interés (ej. "3 Play 200Mbps")
   * @param {boolean} [data.acceptedTerms]
   * @param {string} [data.honeypot]  Debe ir vacío (campo trampa)
   */
  async function enviarLead(data) {
    const res = await fetch(LEADS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: data.phone,
        source: data.source,
        name: data.name || undefined,
        plan: data.plan || undefined,
        acceptedTerms: !!data.acceptedTerms,
        pageUrl: window.location.href,
        honeypot: data.honeypot || "",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || "No se pudo enviar. Inténtalo de nuevo.");
    }
    return json;
  }

  // --- Ejemplo: botón "Llámenme" del hero --------------------------------
  // <input id="hero-phone" type="tel" />
  // <input id="hero-hp" type="text" style="display:none" tabindex="-1" autocomplete="off" />
  // <button id="hero-btn">Llámenme</button>
  const heroBtn = document.getElementById("hero-btn");
  if (heroBtn) {
    heroBtn.addEventListener("click", async () => {
      const phone = document.getElementById("hero-phone").value.trim();
      const honeypot = document.getElementById("hero-hp").value; // trampa
      if (!phone) {
        alert("Ingresa tu número de celular.");
        return;
      }
      heroBtn.disabled = true;
      try {
        await enviarLead({ phone, source: "hero", honeypot });
        alert("¡Gracias! Te llamaremos pronto.");
      } catch (e) {
        alert(e.message);
      } finally {
        heroBtn.disabled = false;
      }
    });
  }

  // Para los otros formularios cambia solo el "source":
  //   Cobertura        → source: "cobertura"
  //   Modal Contratar  → source: "modal_contratar"  (y pasa plan si aplica)
  //   Modal Promo      → source: "modal_promo"
  // Ejemplo con plan desde una tarjeta:
  //   enviarLead({ phone, source: "modal_contratar", plan: "3 Play 200Mbps", honeypot });
</script>
```

> **Campo honeypot:** agrega en cada formulario un input oculto (por CSS, no por
> `type=hidden`) que un humano nunca llena pero los bots sí. Si llega con texto,
> el backend descarta el envío.

---

## Seguridad y notas

- **Restringe `ALLOWED_ORIGIN` en producción.** Con `*` cualquier sitio puede
  llamar a tu endpoint. Ponlo al dominio real de la landing, p. ej.
  `https://landing.comunik2.pe`. (En el código, `app/api/leads/route.ts`, la
  función `corsHeaders()` documenta esto.)
- **Nunca** subas `.env.local` ni el JSON de la cuenta de servicio al repo.
- El rate limit en memoria (`lib/rateLimit.ts`) es best-effort en serverless;
  para límites estrictos usa un almacén compartido (Upstash Redis).
- Los detalles de errores de Google Sheets se loguean solo en el servidor; al
  cliente se le devuelve un mensaje genérico (no se filtra información interna).

---

## Estructura del proyecto

```
app/
  api/leads/route.ts   POST /api/leads + OPTIONS (CORS)
  test/page.tsx        Formulario de prueba (en /test)
  layout.tsx
lib/
  googleSheets.ts      Cliente JWT + appendLead()  (columnas A:J, incl. Distrito)
  validate.ts          Validación de teléfono, source, distrito y honeypot
  rateLimit.ts         Rate limiter en memoria por IP
public/
  landing.html         Landing aprobada de ComuniK2 (servida en / vía rewrite)
  assets/              Imágenes y logos de la landing
next.config.mjs        Rewrite de / → /landing.html
.env.local.example
```
