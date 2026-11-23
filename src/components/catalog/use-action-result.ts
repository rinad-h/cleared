"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ActionResult, FieldErrors } from "@/server/domain/errors";

/** Keep the last refusal inline (and as a toast); clear it on success. */
export function useActionResult() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();
  const report = <T,>(result: ActionResult<T>, success?: string): result is Extract<ActionResult<T>, { ok: true }> => {
    if (result.ok) {
      setError(null);
      setFieldErrors(undefined);
      if (success) toast.success(success);
      return true;
    }
    setFieldErrors(result.fieldErrors);
    setError(result.fieldErrors ? null : result.error);
    if (!result.fieldErrors) toast.error(result.error);
    return false;
  };
  return { error, fieldErrors, report, clear: () => (setError(null), setFieldErrors(undefined)) };
}
