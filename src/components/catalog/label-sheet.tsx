"use client";

import { useState } from "react";
import { QrSvg } from "@/components/qr-svg";
import { Label as FieldLabel } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PrintBanners, PrintButton } from "./print-sheet";
import { FLAGS } from "./use-local-flag";

type SheetLabel = { machineId: string; machineName: string; roomName: string; url: string };

const LAYOUTS = {
  // 2 × 4 per Letter page, QR ≈ 50 mm: scanned from about 1 m.
  large: { name: "Large (8 per page)", qr: "50mm", grid: "sm:grid-cols-2 print:grid-cols-2 print:auto-rows-[63mm]", title: "text-xl" },
  // 3 × 6 per page, QR ≈ 32 mm: the smallest size that scans reliably at 20–30 cm.
  compact: { name: "Compact (18 per page)", qr: "32mm", grid: "sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:auto-rows-[42mm]", title: "text-base" },
} as const;
type Layout = keyof typeof LAYOUTS;

export function LabelSheetView({
  makerspaceName,
  environment,
  baseUrl,
  labels,
}: {
  makerspaceName: string;
  environment: string;
  baseUrl: string;
  labels: SheetLabel[];
}) {
  const [layout, setLayout] = useState<Layout>("large");
  const l = LAYOUTS[layout];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-2">
          <FieldLabel htmlFor="label-layout">Layout</FieldLabel>
          <NativeSelect id="label-layout" value={layout} onChange={(e) => setLayout(e.target.value as Layout)} className="w-auto">
            {Object.entries(LAYOUTS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <PrintButton flag={FLAGS.labelsPrinted}>Print labels</PrintButton>
      </div>
      <PrintBanners environment={environment} baseUrl={baseUrl} what="labels" />
      <ul className={cn("grid grid-cols-1 gap-3 print:gap-0", l.grid)} aria-label="Labels">
        {labels.map((label) => (
          <li
            key={label.machineId}
            className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-dashed border-neutral-400 bg-white p-3 text-black [break-inside:avoid] print:rounded-none print:flex-nowrap"
          >
            <QrSvg value={label.url} size={l.qr} label={`QR code for ${label.machineName}`} className="shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-xs">{makerspaceName}</p>
              <p className={cn("font-bold leading-tight break-words", l.title)}>{label.machineName}</p>
              <p className="text-sm">{label.roomName}</p>
              <p className="text-sm font-medium">Scan to check your pass</p>
              <p className="font-mono text-[8px] leading-tight break-all">{label.url}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
