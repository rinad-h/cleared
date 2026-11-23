import { CircleAlert, CircleCheck } from "lucide-react";
import type { FieldErrors } from "@/server/domain/errors";

/** Per-field error under an input. `id` matches the input's `aria-describedby`. */
export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors[0]}
    </p>
  );
}

/** Form-level message, announced to screen readers. Always rendered so `aria-live` works. */
export function FormMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <div aria-live="polite" role="status" className="min-h-0 empty:hidden">
      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : success ? (
        <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{success}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Field errors for `name`, from an action result or client-side validation. */
export function errorsFor(fieldErrors: FieldErrors | undefined, name: string): string[] | undefined {
  return fieldErrors?.[name];
}
