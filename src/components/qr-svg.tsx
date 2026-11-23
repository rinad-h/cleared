"use client";

import { memo, useMemo } from "react";
import QRCode from "qrcode";
import { useHydrated } from "@/components/auth/use-hydrated";

const MARGIN = 2; // quiet zone in modules (Phase 2 §6.2: at least 2)

/** One SVG path for every dark module, with horizontal runs merged. */
function qrPath(value: string): { size: number; d: string } {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!modules.data[y * n + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && modules.data[y * n + x]) x++;
      d += `M${start + MARGIN} ${y + MARGIN}h${x - start}v1h-${x - start}z`;
    }
  }
  return { size: n + MARGIN * 2, d };
}

/**
 * A QR code drawn in the browser (Phase 2 D1): the server only sends the URL,
 * so a sheet of 60 labels costs no Worker CPU. Black on white with a 2-module
 * quiet zone, error correction M, no logo. Until React has loaded (and while
 * server rendering) it shows an empty square of the same size.
 */
export const QrSvg = memo(function QrSvg({
  value,
  size,
  label,
  className,
}: {
  value: string;
  /** CSS length, e.g. "50mm". */
  size: string;
  /** Accessible name, e.g. "QR code for Laser cutter". */
  label: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  const qr = useMemo(() => (hydrated ? qrPath(value) : null), [hydrated, value]);
  if (!qr) {
    return <div aria-hidden="true" className={className} style={{ width: size, height: size, background: "#fff" }} />;
  }
  return (
    <svg
      role="img"
      aria-label={label}
      data-qr-value={value}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
});
