"use client";

import { useActionState } from "react";
import { joinMakerspace } from "@/actions/join";
import { FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/domain/errors";

export function JoinForm({ token }: { token: string }) {
  const [state, submit, pending] = useActionState(
    async (_prev: ActionResult<unknown> | null, formData: FormData) => joinMakerspace(formData),
    null,
  );
  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state && !state.ok ? state.error : null} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </Button>
    </form>
  );
}
