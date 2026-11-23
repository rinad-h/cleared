"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { createCertification, updateCertification } from "@/actions/certifications";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ErrorDetails } from "@/server/domain/errors";
import { useActionResult } from "./use-action-result";

export type CertificationRow = {
  id: string;
  name: string;
  trainingUrl: string | null;
  validityMonths: number | null;
  active: boolean;
  requiredByCount: number;
};

function CertificationFields({
  cert,
  fieldErrors,
}: {
  cert?: CertificationRow;
  fieldErrors?: Record<string, string[] | undefined>;
}) {
  const p = cert ? `cert-${cert.id}` : "cert-new";
  const describe = (name: string) => (fieldErrors?.[name] ? `${p}-${name}-error` : undefined);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${p}-name`}>Name</Label>
        <Input
          id={`${p}-name`}
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={cert?.name}
          aria-invalid={fieldErrors?.name ? true : undefined}
          aria-describedby={describe("name")}
        />
        <FieldError id={`${p}-name-error`} errors={fieldErrors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${p}-url`}>Training link (optional)</Label>
        <Input
          id={`${p}-url`}
          name="trainingUrl"
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://"
          defaultValue={cert?.trainingUrl ?? ""}
          aria-invalid={fieldErrors?.trainingUrl ? true : undefined}
          aria-describedby={describe("trainingUrl")}
        />
        <FieldError id={`${p}-trainingUrl-error`} errors={fieldErrors?.trainingUrl} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${p}-validity`}>Valid for (months)</Label>
        <Input
          id={`${p}-validity`}
          name="validityMonths"
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          step={1}
          defaultValue={cert?.validityMonths ?? ""}
          aria-invalid={fieldErrors?.validityMonths ? true : undefined}
          aria-describedby={`${p}-validity-help${fieldErrors?.validityMonths ? ` ${p}-validityMonths-error` : ""}`}
        />
        <p id={`${p}-validity-help`} className="text-sm text-muted-foreground">
          1 to 120. Leave empty if it never expires. A change applies to new sign-offs only.
        </p>
        <FieldError id={`${p}-validityMonths-error`} errors={fieldErrors?.validityMonths} />
      </div>
    </>
  );
}

/** Admin: add or edit a certification in a dialog. */
export function CertificationDialog({ cert }: { cert?: CertificationRow }) {
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
        {cert ? (
          <Button type="button" variant="outline" size="sm" disabled={!hydrated} aria-label={`Edit ${cert.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button type="button" disabled={!hydrated}>
            <Plus aria-hidden="true" />
            Add certification
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{cert ? `Edit ${cert.name}` : "Add certification"}</DialogTitle>
        <DialogDescription>Members need every certification a machine requires.</DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (cert) data.set("id", cert.id);
            startTransition(async () => {
              const result = cert ? await updateCertification(data) : await createCertification(data);
              if (report(result, cert ? "Certification saved." : "Certification added.")) setOpen(false);
            });
          }}
        >
          <CertificationFields cert={cert} fieldErrors={fieldErrors} />
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : cert ? "Save" : "Add certification"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Admin: deactivate (refused while live machines require it) or reactivate. */
export function CertificationActiveToggle({ cert }: { cert: CertificationRow }) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [inUse, setInUse] = useState<{ message: string; machines: NonNullable<ErrorDetails["machines"]> } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hydrated || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateCertification({ id: cert.id, active: !cert.active });
            if (result.ok) {
              setInUse(null);
              toast.success(cert.active ? "Certification deactivated." : "Certification reactivated.");
            } else if (result.code === "CERT_IN_USE") {
              setInUse({ message: result.error, machines: result.details?.machines ?? [] });
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        {cert.active ? "Deactivate" : "Reactivate"}
      </Button>
      <div aria-live="polite" role="status" className="empty:hidden">
        {inUse ? (
          <div className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
            <p className="text-destructive">{inUse.message}</p>
            <ul className="mt-1 list-disc pl-5">
              {inUse.machines.map((m) => (
                <li key={m.id}>
                  <Link href={`/console/machines/${m.id}/edit`} prefetch={false} className="underline underline-offset-4">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
