import type { Metadata } from "next";
import { HelpCircle, MapPin } from "lucide-react";
import { Gate } from "@/components/gate";
import { getMachineByToken } from "@/data/pass";

export const metadata: Metadata = { title: "Machine pass" };

/**
 * The page a QR label opens. A hot path (every scan is a Worker request), so
 * it stays small: one `getMachineByToken` read. Signed-out visitors are sent
 * to sign-in by proxy.ts and come back here.
 */
export default function MachinePassPage({ params }: PageProps<"/m/[token]">) {
  return (
    <Gate area="member">
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

  const { machine, makerspace } = result;
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-md space-y-4 py-2">
      <p className="text-sm text-muted-foreground">{makerspace.name}</p>
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight break-words">
        {machine.name}
      </h1>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin aria-hidden="true" className="size-4" />
        {machine.roomName}
      </p>
      <div className="rounded-lg border px-4 py-5" aria-live="polite">
        <p className="font-medium">Your pass for this machine</p>
        <p className="text-sm text-muted-foreground">
          Pass coming in Phase 3: it will show whether you&apos;re cleared to use this machine.
        </p>
      </div>
    </section>
  );
}
