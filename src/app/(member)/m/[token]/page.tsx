import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Gate } from "@/components/gate";
import { PassCard } from "@/components/pass/pass-card";
import { getMachineByToken } from "@/data/pass";

export const metadata: Metadata = { title: "Machine pass" };

/**
 * The page a QR label opens: the viewer's pass for this machine (Phase 3 §6.1).
 * A hot path (every scan is a Worker request), so it stays small: one batch of
 * reads and a small tree. Non-members and suspended members get their own
 * NOT CLEARED pass, so the gate only needs an account. Signed-out visitors are
 * sent to sign-in by proxy.ts and come back here. Re-rendered every 60 s while
 * visible.
 */
export default function MachinePassPage({ params }: PageProps<"/m/[token]">) {
  return (
    <Gate area="signed-in">
      <MachinePass params={params} />
    </Gate>
  );
}

async function MachinePass({ params }: Pick<PageProps<"/m/[token]">, "params">) {
  const { token } = await params;
  const result = await getMachineByToken(token);

  if (!result.recognized) {
    return (
      <section aria-labelledby="page-title" className="mx-auto max-w-md space-y-4 py-6">
        <HelpCircle aria-hidden="true" className="size-8 text-muted-foreground" />
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Label not recognized
        </h1>
        <p className="text-muted-foreground">
          This label isn&apos;t recognized. It may belong to a machine that&apos;s been retired. Ask staff.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-md py-2">
      <PassCard data={result} />
      <AutoRefresh seconds={60} />
    </section>
  );
}
