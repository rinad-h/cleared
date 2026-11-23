"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateMember } from "@/actions/members";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { MemberStatus, Role } from "@/server/domain/enums";
import type { ActionResult } from "@/server/domain/errors";

/** Show a refused change as a toast and inline (LAST_ADMIN, FORBIDDEN, CANNOT_SUSPEND_SELF, …). */
function useResult() {
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult<unknown>, success: string) => {
    if (result.ok) {
      setError(null);
      toast.success(success);
    } else {
      setError(result.error);
      toast.error(result.error);
    }
  };
  return { error, report };
}

/**
 * Admin: change a member's role. The select is uncontrolled, so a choice made
 * before hydration survives it; Save is enabled once React has loaded.
 */
export function RoleForm({ memberId, role, isSelf }: { memberId: string; role: Role; isSelf: boolean }) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const { error, report } = useResult();
  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const next = new FormData(event.currentTarget).get("role");
        startTransition(async () => report(await updateMember({ id: memberId, role: String(next) }), "Role saved."));
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <NativeSelect id="role" name="role" defaultValue={role} key={role}>
          <option value="member">Member</option>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </NativeSelect>
        {isSelf ? (
          <p className="text-sm text-muted-foreground">This is your own role. At least one active admin must remain.</p>
        ) : null}
      </div>
      <FormMessage error={error} />
      <div>
        <Button type="submit" disabled={!hydrated || pending}>
          {pending ? "Saving…" : "Save role"}
        </Button>
      </div>
    </form>
  );
}

/** Staff/admin: suspend (with an optional reason) or reactivate. */
export function StatusForm({ memberId, status, name }: { memberId: string; status: MemberStatus; name: string }) {
  const hydrated = useHydrated();
  const reason = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { error, report } = useResult();

  if (status === "suspended") {
    return (
      <div className="space-y-3">
        <FormMessage error={error} />
        <Button
          type="button"
          disabled={!hydrated || pending}
          onClick={() =>
            startTransition(async () =>
              report(await updateMember({ id: memberId, status: "active" }), "Access restored."),
            )
          }
        >
          {pending ? "Reactivating…" : "Reactivate"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-3">
      <div className="space-y-2">
        <Label htmlFor="suspensionReason">Reason (optional, staff only)</Label>
        <Textarea ref={reason} id="suspensionReason" name="suspensionReason" maxLength={300} />
      </div>
      <FormMessage error={error} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={!hydrated || pending}>
            {pending ? "Suspending…" : "Suspend"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Suspend {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access on their next page load, until staff reactivate them.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () =>
                  report(
                    await updateMember({
                      id: memberId,
                      status: "suspended",
                      suspensionReason: reason.current?.value ?? "",
                    }),
                    "Member suspended.",
                  ),
                )
              }
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
