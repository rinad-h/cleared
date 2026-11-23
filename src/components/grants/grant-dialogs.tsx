"use client";

import { useState, useTransition } from "react";
import { revokeGrant, signOff } from "@/actions/grants";
import { useHydrated } from "@/components/auth/use-hydrated";
import { useActionResult } from "@/components/catalog/use-action-result";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { REVOKE_REASON_MAX, REVOKE_REASON_MIN } from "@/lib/schemas/grants";
import { expiryFor } from "@/server/domain/time";

export type SignOffCert = { id: string; name: string; validityMonths: number | null };

const LAST_CERT_KEY = "cleared.lastSignOffCert";

function readLastCert(): string | null {
  try {
    return window.localStorage.getItem(LAST_CERT_KEY);
  } catch {
    return null;
  }
}

function rememberCert(id: string) {
  try {
    window.localStorage.setItem(LAST_CERT_KEY, id);
  } catch {
    // Private mode or storage blocked: the pre-selection is only a convenience.
  }
}

/**
 * Staff: sign a member off (Phase 3 §6.2). The `clientRequestId` is created
 * when the dialog opens, so a double-tap or retry sends the same one and the
 * server creates one grant. Opened from a row, the certification is
 * pre-selected; otherwise the most recently used one (this browser) is.
 */
export function SignOffDialog({
  memberId,
  memberName,
  certifications,
  certificationId,
  label = "Sign off",
  timeZone,
}: {
  memberId: string;
  memberName: string;
  certifications: SignOffCert[];
  /** Pre-select (and lock) this certification. */
  certificationId?: string;
  label?: string;
  timeZone: string;
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [selected, setSelected] = useState("");
  const [openedAt, setOpenedAt] = useState(0);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report, clear } = useActionResult();
  const fixed = certificationId ? certifications.find((c) => c.id === certificationId) : undefined;
  const cert = certifications.find((c) => c.id === selected);
  const expiry = cert ? expiryFor(openedAt, cert.validityMonths) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRequestId(crypto.randomUUID());
          setOpenedAt(Date.now());
          const last = readLastCert();
          setSelected(
            certificationId ??
              (last && certifications.some((c) => c.id === last) ? last : (certifications[0]?.id ?? "")),
          );
        } else {
          clear();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!hydrated || certifications.length === 0}
          aria-label={fixed ? `${label}: ${fixed.name}` : undefined}
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Sign off {memberName}</DialogTitle>
        <DialogDescription>Confirm they completed the training for this certification.</DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) return;
            startTransition(async () => {
              const result = await signOff({ memberId, certificationId: selected, clientRequestId: requestId });
              if (report(result, `Signed off: ${cert?.name ?? "certification"}`)) {
                rememberCert(selected);
                setOpen(false);
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="signoff-cert">Certification</Label>
            <NativeSelect
              id="signoff-cert"
              name="certificationId"
              value={selected}
              disabled={Boolean(fixed)}
              onChange={(event) => setSelected(event.target.value)}
              aria-describedby="signoff-expiry"
            >
              {certifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <p id="signoff-expiry" className="text-sm text-muted-foreground">
              {cert
                ? expiry === null
                  ? "Never expires."
                  : `Expires ${formatDate(expiry, timeZone)} (${cert.validityMonths} ${cert.validityMonths === 1 ? "month" : "months"}).`
                : null}
            </p>
            <FieldError id="signoff-cert-error" errors={fieldErrors?.certificationId} />
          </div>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending || !selected}>
            {pending ? "Signing off…" : "Confirm sign-off"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Staff: revoke a certification, with a required reason. Takes effect immediately. */
export function RevokeDialog({
  grantId,
  memberName,
  certificationName,
}: {
  grantId: string;
  memberName: string;
  certificationName: string;
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report, clear } = useActionResult();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clear();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={!hydrated} aria-label={`Revoke: ${certificationName}`}>
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Revoke {certificationName}?</DialogTitle>
        <DialogDescription>
          Takes effect immediately: {memberName} is NOT CLEARED on machines that require it until signed off again.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
            startTransition(async () => {
              if (report(await revokeGrant({ grantId, reason }), `Revoked: ${certificationName}`)) setOpen(false);
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Input
              id="revoke-reason"
              name="reason"
              required
              minLength={REVOKE_REASON_MIN}
              maxLength={REVOKE_REASON_MAX}
              aria-invalid={fieldErrors?.reason ? true : undefined}
              aria-describedby={fieldErrors?.reason ? "revoke-reason-error" : undefined}
            />
            <FieldError id="revoke-reason-error" errors={fieldErrors?.reason} />
          </div>
          <FormMessage error={error} />
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
