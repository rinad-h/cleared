"use client";

import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import { FLAGS, useLocalFlag } from "./use-local-flag";

type Item = { label: string; done: boolean; href: string; action: string };

/**
 * Journey A setup checklist, on the console home for admins until every step
 * is done (Phase 6 §6). Rooms, certifications and machines come from the
 * database; "labels printed" and "join link shared" are remembered in this
 * browser only.
 */
export function SetupChecklist({
  rooms,
  certifications,
  machines,
  isAdmin,
}: {
  rooms: number;
  certifications: number;
  machines: number;
  isAdmin: boolean;
}) {
  const labelsPrinted = useLocalFlag(FLAGS.labelsPrinted);
  const joinShared = useLocalFlag(FLAGS.joinLinkShared);
  const items: Item[] = [
    { label: "Rooms", done: rooms > 0, href: "/console/rooms", action: "Add rooms" },
    ...(isAdmin
      ? [{ label: "Certifications", done: certifications > 0, href: "/console/certifications", action: "Add certifications" }]
      : []),
    { label: "Machines", done: machines > 0, href: "/console/machines/new", action: "Add machines" },
    { label: "Labels printed", done: labelsPrinted, href: "/console/labels", action: "Print labels" },
    ...(isAdmin
      ? [{ label: "Join link shared", done: joinShared, href: "/console/settings", action: "Share the join link" }]
      : []),
  ];
  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;
  return (
    <section aria-labelledby="setup-title" className="max-w-xl space-y-3 rounded-lg border p-5">
      <h2 id="setup-title" className="text-lg font-semibold">
        Set up your makerspace
      </h2>
      <p className="text-sm text-muted-foreground">
        {`${remaining} step${remaining === 1 ? "" : "s"} to go.`}
      </p>
      <ol className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3">
            {item.done ? (
              <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-status-cleared-foreground" />
            ) : (
              <Circle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1">
              {item.label}
              <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
            </span>
            <Link href={item.href} prefetch={false} className="text-sm underline underline-offset-4">
              {item.done ? "Open" : item.action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
