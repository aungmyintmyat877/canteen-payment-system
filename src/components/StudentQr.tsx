"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders the signed QR payload as a PNG data-URL <img>.
 * Using an <img> (not an SVG component) keeps it compatible with
 * html2canvas when the ID card is exported.
 */
export default function StudentQr({ payload }: { payload: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [payload]);

  if (!src) {
    return (
      <div className="mx-auto mt-6 h-56 w-56 animate-pulse rounded-xl bg-slate-100" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Signed payment QR code"
      width={224}
      height={224}
      className="mx-auto mt-6 rounded-xl"
    />
  );
}
