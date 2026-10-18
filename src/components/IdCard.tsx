"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dynamic ID card — built from live student records with plain HTML/CSS
 * (inline styles with hex/rgba colors so html2canvas rasterizes it exactly).
 * Nothing is stored as an image; the QR is generated client-side as a PNG
 * data-URL from the signed payload.
 *
 * Exports: PNG (front/back) and a two-page PDF sized to the real CR80 card
 * format (85.6 × 54 mm) so it can be printed at 100% scale and cut.
 */

export interface IdCardStudent {
  id: string;
  name: string;
  year: number;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  major: string | null;
  class_name: string | null;
}

// ≈ CR80 ratio (85.6 × 54 mm) — exports are scaled to exact mm.
const CARD_W = 640;
const CARD_H = 404;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Watermark() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <span
        style={{
          transform: "rotate(-24deg)",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: 20,
          color: "rgba(15, 23, 42, 0.09)",
          whiteSpace: "nowrap",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        COPY
      </span>
    </div>
  );
}

function CardFront({
  student,
  university,
  watermark,
  cardRef,
}: {
  student: IdCardStudent;
  university: string;
  watermark: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={cardRef}
      style={{
        width: CARD_W,
        height: CARD_H,
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%)",
        color: "#ffffff",
        fontFamily: "Arial, Helvetica, sans-serif",
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
      }}
    >
      <div
        style={{
          padding: "22px 30px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.4 }}>
          {university.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            background: "#fbbf24",
            color: "#78350f",
            padding: "5px 14px",
            borderRadius: 999,
            letterSpacing: 1.5,
          }}
        >
          STUDENT
        </div>
      </div>

      <div style={{ display: "flex", gap: 26, padding: "26px 30px 0" }}>
        <div
          style={{
            width: 136,
            height: 164,
            borderRadius: 12,
            background: "rgba(255,255,255,0.16)",
            border: "2px solid rgba(255,255,255,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
         {/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src="/avatars/s001.png"
  alt="University Logo"
  width={136}
  height={164}
  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
/>
        </div>

        <div style={{ paddingTop: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>{student.name}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6, letterSpacing: 1 }}>
            {student.id}
          </div>
          <div style={{ fontSize: 13, marginTop: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.7 }}>
            <div>Academic year: {student.year}</div>
            {student.major ? <div>Major: {student.major}</div> : null}
            {student.class_name ? <div>Class: {student.class_name}</div> : null}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 46,
          background: "#f8fafc",
          color: "#334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 30px",
          fontSize: 11,
        }}
      >
        <span>
          If found, please return to {university} — Student Services
        </span>
        <span style={{ fontWeight: 700 }}>
         VALID 2026-2027
        </span>
      </div>

      {watermark && <Watermark />}
    </div>
  );
}

function CardBack({
  student,
  university,
  qrSrc,
  watermark,
  cardRef,
}: {
  student: IdCardStudent;
  university: string;
  qrSrc: string | null;
  watermark: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rows: [string, string][] = [
    ["Phone", student.phone ?? "—"],
    ["Email", student.email ?? "—"],
    ["Class", student.class_name ?? "—"],
    ["Major", student.major ?? "—"],
    ["Student ID", student.id],
  ];

  return (
    <div
      ref={cardRef}
      style={{
        width: CARD_W,
        height: CARD_H,
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "Arial, Helvetica, sans-serif",
        border: "1px solid #e2e8f0",
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
      }}
    >
      {/* magnetic stripe */}
      <div style={{ position: "absolute", top: 34, left: 0, right: 0, height: 46, background: "#1e293b" }} />

      <div style={{ display: "flex", gap: 28, padding: "104px 30px 0" }}>
        <div
          style={{
            width: 168,
            height: 168,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} alt="Payment QR" width={148} height={148} style={{ display: "block" }} />
          ) : (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>rendering QR…</span>
          )}
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td style={{ color: "#64748b", paddingRight: 14, paddingBottom: 8, whiteSpace: "nowrap" }}>
                    {label}
                  </td>
                  <td style={{ fontWeight: 600, paddingBottom: 8, wordBreak: "break-all" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 10, color: "#94a3b8", maxWidth: 330, lineHeight: 1.6 }}>
            Property of {university}. The QR contains a server-signed token;
            tampering with or sharing this card is a disciplinary offence.
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: 30,
          right: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          fontSize: 11,
          color: "#64748b",
        }}
      >
        <span>Issued by Student Services · {new Date().getFullYear()}</span>
        <span style={{ borderBottom: "1px solid #94a3b8", width: 150, textAlign: "center", paddingBottom: 2 }}>
          Card holder signature
        </span>
      </div>

      {watermark && <Watermark />}
    </div>
  );
}

export default function IdCardClient({
  student,
  university,
  qrPayload,
}: {
  student: IdCardStudent;
  university: string;
  qrPayload: string;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((m) => m.default.toDataURL(qrPayload, { width: 296, margin: 1 }))
      .then((url) => {
        if (alive) setQrSrc(url);
      })
      .catch(() => setError("Could not render the QR code."));
    return () => {
      alive = false;
    };
  }, [qrPayload]);

  async function capture(el: HTMLElement | null): Promise<string> {
    if (!el) throw new Error("Card is not rendered yet.");
    try {
      await document.fonts.ready;
    } catch {
      /* older browsers */
    }
    // Wait for every <img> inside the card (photo + QR) to finish decoding.
    for (const img of Array.from(el.querySelectorAll("img"))) {
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }
    }
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, {
      scale: 2, // 1280 × 808 px output — crisp print quality
      backgroundColor: null,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  }

  async function downloadPng(side: "front" | "back") {
    setBusy(side);
    setError(null);
    try {
      const dataUrl = await capture(side === "front" ? frontRef.current : backRef.current);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `id-card-${student.id}-${side}.png`;
      a.click();
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    setBusy("pdf");
    setError(null);
    try {
      const front = await capture(frontRef.current);
      const back = await capture(backRef.current);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [85.6, 54] });
      pdf.addImage(front, "PNG", 0, 0, 85.6, 54);
      pdf.addPage([85.6, 54], "landscape");
      pdf.addImage(back, "PNG", 0, 0, 85.6, 54);
      pdf.save(`id-card-${student.id}.pdf`);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={watermark}
            onChange={(e) => setWatermark(e.target.checked)}
            className="h-4 w-4"
          />
          COPY watermark
        </label>
        <span className="flex-1" />
        <button type="button" className={btn} disabled={busy !== null} onClick={() => downloadPng("front")}>
          {busy === "front" ? "Rendering…" : "Download PNG (front)"}
        </button>
        <button type="button" className={btn} disabled={busy !== null} onClick={() => downloadPng("back")}>
          {busy === "back" ? "Rendering…" : "Download PNG (back)"}
        </button>
        <button type="button" className={btn} disabled={busy !== null} onClick={downloadPdf}>
          {busy === "pdf" ? "Rendering…" : "Download PDF (print size)"}
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Front</p>
        <CardFront student={student} university={university} watermark={watermark} cardRef={frontRef} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Back</p>
        <CardBack
          student={student}
          university={university}
          qrSrc={qrSrc}
          watermark={watermark}
          cardRef={backRef}
        />
      </div>

      <p className="text-center text-xs text-slate-400">
        Cards are CR80 (85.6 × 54 mm). Print the PDF at 100% / “Actual size”, then cut.
      </p>
    </div>
  );
}
