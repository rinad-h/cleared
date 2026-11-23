"use client";

import { useState } from "react";
import { QrSvg } from "@/components/qr-svg";
import { PrintBanners, PrintButton } from "./print-sheet";
import { FLAGS } from "./use-local-flag";

export function DoorPosterView({
  makerspaceName,
  environment,
  baseUrl,
  boardUrl,
  joinUrl,
}: {
  makerspaceName: string;
  environment: string;
  baseUrl: string;
  boardUrl: string;
  joinUrl?: string;
}) {
  const [withJoin, setWithJoin] = useState(joinUrl !== undefined);
  const showJoin = withJoin && joinUrl !== undefined;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 print:hidden">
        {joinUrl ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withJoin}
              onChange={(e) => setWithJoin(e.target.checked)}
              className="size-4 accent-primary"
            />
            Include the join link QR code
          </label>
        ) : null}
        <PrintButton flag={showJoin ? FLAGS.joinLinkShared : undefined}>Print poster</PrintButton>
      </div>
      <PrintBanners environment={environment} baseUrl={baseUrl} what="QR codes" />
      <article
        aria-label="Door poster"
        className="mx-auto flex max-w-[190mm] flex-col items-center gap-6 rounded-md border bg-white p-6 text-center text-black print:max-w-none print:border-0 print:p-0"
      >
        <p className="text-3xl font-bold break-words sm:text-4xl">{makerspaceName}</p>
        <div className="flex flex-col items-center gap-3">
          <p className="text-2xl font-semibold">See which machines are free</p>
          <QrSvg value={boardUrl} size="min(90mm, 70vw)" label="QR code for the machine status board" />
          <p className="font-mono text-xs break-all">{boardUrl}</p>
        </div>
        {showJoin ? (
          <div className="flex flex-col items-center gap-3 border-t border-neutral-300 pt-6">
            <p className="text-xl font-semibold">New here? Join</p>
            <QrSvg value={joinUrl} size="min(60mm, 50vw)" label="QR code for the join link" />
            <p className="font-mono text-xs break-all">{joinUrl}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
