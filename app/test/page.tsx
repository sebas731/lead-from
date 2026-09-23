"use client";

import { useState, type FormEvent } from "react";
import { ALLOWED_SOURCES } from "@/lib/validate";

// Página de prueba: formulario simple que llama a POST /api/leads.
// Solo sirve para verificar el flujo completo en local antes de conectar
// la landing real. No pretende ser bonita.

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export default function TestPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<string>(ALLOWED_SOURCES[0]);
  const [plan, setPlan] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          phone,
          source,
          plan: plan || undefined,
          acceptedTerms,
          pageUrl: window.location.href,
          honeypot: "", // campo trampa: debe ir vacío
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (res.ok && data.ok) {
        setStatus({ kind: "ok" });
        setName("");
        setPhone("");
        setPlan("");
        setAcceptedTerms(false);
      } else {
        setStatus({
          kind: "error",
          message: data.error || `Error ${res.status}`,
        });
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Error de red",
      });
    }
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "48px auto",
        padding: 24,
        background: "white",
        borderRadius: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,.1)",
      }}
    >
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Prueba · /api/leads</h1>
      <p style={{ color: "#71717a", fontSize: 14, marginTop: 0 }}>
        Formulario de prueba para verificar la escritura en Google Sheets.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <label style={labelStyle}>
          Nombre (opcional)
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
          />
        </label>

        <label style={labelStyle}>
          Teléfono (celular peruano) *
          <input
            style={inputStyle}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="987654321"
            required
          />
        </label>

        <label style={labelStyle}>
          Origen (source) *
          <select
            style={inputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {ALLOWED_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Plan de interés (opcional)
          <input
            style={inputStyle}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="3 Play 200Mbps"
          />
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          Acepto los términos y condiciones
        </label>

        <button
          type="submit"
          disabled={status.kind === "loading"}
          style={{
            padding: "10px 16px",
            background: "#dc2626",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: status.kind === "loading" ? "not-allowed" : "pointer",
            opacity: status.kind === "loading" ? 0.7 : 1,
          }}
        >
          {status.kind === "loading" ? "Enviando…" : "Enviar"}
        </button>
      </form>

      {status.kind === "ok" && (
        <p style={{ color: "#16a34a", marginTop: 16 }}>
          ✓ Guardado correctamente en la hoja.
        </p>
      )}
      {status.kind === "error" && (
        <p style={{ color: "#dc2626", marginTop: 16 }}>✗ {status.message}</p>
      )}
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 14,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
};
