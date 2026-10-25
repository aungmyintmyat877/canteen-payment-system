"use client";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { useLang } from "@/lib/i18n/LanguageProvider";

/**
 * Camera QR scanner built on html5-qrcode. Loads the library dynamically so
 * it never runs during SSR. The parent receives decoded payloads; a 2.5s
 * cooldown per identical code prevents rapid-fire duplicate scans.
 */
export default function QRScanner({
  onResult,
  paused,
}: {
  onResult: (text: string) => void;
  paused: boolean;
}) {
  const { t } = useLang();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const pausedRef = useRef(paused);
  const onResultRef = useRef(onResult);
  pausedRef.current = paused;
  onResultRef.current = onResult;

  async function start() {
    setError(null);
    try {
      const { Html5Qrcode: Scanner } = await import("html5-qrcode");
      const scanner = new Scanner("qr-reader", { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText: string) => {
          const now = Date.now();
          if (pausedRef.current) return;
          if (decodedText === lastRef.current.text && now - lastRef.current.at < 2500) return;
          lastRef.current = { text: decodedText, at: now };
          onResultRef.current(decodedText);
        },
        () => {
          // per-frame decode misses — expected noise, ignore
        }
      );
      setRunning(true);
    } catch (e) {
      scannerRef.current = null;
      const msg = e instanceof Error ? e.message : "unknown error";
      setError(`${t("scanner.cameraUnavailable")} (${msg}). ${t("scanner.cameraHint")}`);
      setRunning(false);
    }
  }

  async function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* already stopped */
      }
    }
    setRunning(false);
  }

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div id="qr-reader" className="w-full" />
      <div className="flex gap-2">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t("scanner.start")}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
          >
            {t("scanner.stop")}
          </button>
        )}
      </div>
      {error && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  );
}