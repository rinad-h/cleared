"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createRoom } from "@/actions/rooms";
import { createMachine, updateMachine } from "@/actions/machines";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
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
import { SESSION_LENGTHS } from "@/server/domain/enums";
import { useActionResult } from "./use-action-result";

type Option = { id: string; name: string };

export type MachineFormValues = {
  id: string;
  name: string;
  roomId: string;
  typicalSessionMinutes: number;
  supervised: boolean;
  requirementIds: string[];
};

function sessionLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} hours`;
}

/** "New room…" next to the room select: adds a room and selects it. */
function NewRoom({ onAdded }: { onAdded: (room: Option) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report } = useActionResult();
  const input = useRef<HTMLInputElement>(null);
  if (!open) {
    return (
      <Button type="button" variant="link" className="h-auto px-0" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New room…
      </Button>
    );
  }
  const add = () =>
    startTransition(async () => {
      const result = await createRoom({ name: input.current?.value ?? "" });
      if (report(result, "Room added.")) {
        onAdded(result.data);
        setOpen(false);
      }
    });
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="new-room-name">New room name</Label>
      <div className="flex gap-2">
        <Input
          ref={input}
          id="new-room-name"
          maxLength={60}
          placeholder="e.g. Laser Room"
          aria-invalid={fieldErrors?.name ? true : undefined}
          aria-describedby={fieldErrors?.name ? "new-room-name-error" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" disabled={pending} onClick={add}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FieldError id="new-room-name-error" errors={fieldErrors?.name} />
      <FormMessage error={error} />
    </div>
  );
}

/**
 * Staff: name, room and typical session. Admin section (rendered only for
 * admins; the service enforces it anyway): supervision and required
 * certifications. Uncontrolled fields, so input made before hydration
 * survives it; Save is enabled once React has loaded.
 *
 * After a create, the name is cleared and everything else is kept, for the
 * "add another in the same room" setup flow (≤ 30-minute target).
 */
export function MachineForm({
  machine,
  rooms,
  certifications,
  isAdmin,
  defaultRoomId,
}: {
  machine?: MachineFormValues;
  rooms: Option[];
  certifications: Option[];
  isAdmin: boolean;
  defaultRoomId?: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report } = useActionResult();
  const [extraRooms, setExtraRooms] = useState<Option[]>([]);
  const [saved, setSaved] = useState<{ id: string; name: string; roomName: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLSelectElement>(null);

  const allRooms = [...rooms, ...extraRooms.filter((r) => !rooms.some((x) => x.id === r.id))];
  const editing = machine !== undefined;
  const err = (name: string) => fieldErrors?.[name];
  const describedBy = (name: string) => (err(name) ? `machine-${name}-error` : undefined);

  return (
    <form
      className="max-w-xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (machine) data.set("id", machine.id);
        startTransition(async () => {
          if (machine) {
            const result = await updateMachine(data);
            if (report(result, "Machine saved.")) router.push("/console/machines");
            return;
          }
          const result = await createMachine(data);
          if (report(result)) {
            setSaved({ id: result.data.id, name: result.data.name, roomName: result.data.room.name });
            if (nameRef.current) {
              nameRef.current.value = "";
              nameRef.current.focus();
            }
          } else {
            setSaved(null);
          }
        });
      }}
    >
      <fieldset className="space-y-5">
        <legend className="mb-3 text-lg font-semibold">Basics</legend>
        <div className="space-y-2">
          <Label htmlFor="machine-name">Machine name</Label>
          <Input
            ref={nameRef}
            id="machine-name"
            name="name"
            required
            maxLength={80}
            defaultValue={machine?.name}
            placeholder="e.g. Laser cutter"
            aria-invalid={err("name") ? true : undefined}
            aria-describedby={describedBy("name")}
          />
          <FieldError id="machine-name-error" errors={err("name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine-room">Room</Label>
          <NativeSelect
            ref={roomRef}
            id="machine-room"
            name="roomId"
            required
            defaultValue={machine?.roomId ?? defaultRoomId ?? allRooms[0]?.id ?? ""}
            aria-invalid={err("roomId") ? true : undefined}
            aria-describedby={describedBy("roomId")}
          >
            {allRooms.length === 0 ? <option value="">Add a room first</option> : null}
            {allRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="machine-roomId-error" errors={err("roomId")} />
          <NewRoom
            onAdded={(room) => {
              flushSync(() => setExtraRooms((list) => [...list, room]));
              if (roomRef.current) roomRef.current.value = room.id;
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine-session">Typical session</Label>
          <NativeSelect
            id="machine-session"
            name="typicalSessionMinutes"
            defaultValue={String(machine?.typicalSessionMinutes ?? 60)}
            aria-describedby="machine-session-help"
          >
            {SESSION_LENGTHS.map((m) => (
              <option key={m} value={m}>
                {sessionLabel(m)}
              </option>
            ))}
          </NativeSelect>
          <p id="machine-session-help" className="text-sm text-muted-foreground">
            Used to estimate when the machine is free again.
          </p>
        </div>
      </fieldset>

      {isAdmin ? (
        <fieldset className="space-y-5">
          <legend className="mb-3 text-lg font-semibold">Admin</legend>
          <div className="flex items-start gap-3">
            {/* Unchecked boxes send nothing: the hidden "false" makes "off" explicit. */}
            <input type="hidden" name="supervised" value="false" />
            <input
              id="machine-supervised"
              type="checkbox"
              name="supervised"
              value="true"
              role="switch"
              defaultChecked={machine?.supervised ?? false}
              className="mt-1 size-5 accent-primary"
              aria-describedby="machine-supervised-help"
            />
            <div className="space-y-1">
              <Label htmlFor="machine-supervised">Supervision required</Label>
              <p id="machine-supervised-help" className="text-sm text-muted-foreground">
                Even cleared members need staff present to use this machine.
              </p>
            </div>
          </div>
          <div className="space-y-2" role="group" aria-labelledby="machine-reqs-label" aria-describedby="machine-reqs-help">
            <p id="machine-reqs-label" className="text-sm font-medium">
              Required certifications
            </p>
            <p id="machine-reqs-help" className="text-sm text-muted-foreground">
              All of these are required.
            </p>
            {/* Sends the key even when nothing is ticked, so "none" clears the list. */}
            <input type="hidden" name="requirementIds" value="" />
            {certifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active certifications yet.{" "}
                <Link href="/console/certifications" prefetch={false} className="underline underline-offset-4">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {certifications.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input
                      id={`req-${c.id}`}
                      type="checkbox"
                      name="requirementIds"
                      value={c.id}
                      defaultChecked={machine?.requirementIds.includes(c.id) ?? false}
                      className="size-4 accent-primary"
                    />
                    <Label htmlFor={`req-${c.id}`} className="font-normal">
                      {c.name}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
            <FieldError id="machine-requirementIds-error" errors={err("requirementIds")} />
          </div>
        </fieldset>
      ) : null}

      <FormMessage
        error={error}
        success={
          saved ? `Saved ${saved.name}. Add another in ${saved.roomName}, or go back to the machine list.` : null
        }
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!hydrated || pending || allRooms.length === 0}>
          {pending ? "Saving…" : editing ? "Save machine" : saved ? "Add another" : "Add machine"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/console/machines" prefetch={false}>
            {saved ? "Done" : "Cancel"}
          </Link>
        </Button>
      </div>
    </form>
  );
}

/** Admin: retire (permanent). Asks for the machine's name to confirm. */
export function RetireMachine({ id, name }: { id: string; name: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={!hydrated || pending}>
          {pending ? "Retiring…" : "Retire machine"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Retire {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          It disappears from the board and the label sheet, and its QR label stops working. History is kept. This
          can&apos;t be undone: to bring it back, add it again and print a new label.
        </AlertDialogDescription>
        <div className="space-y-2">
          <Label htmlFor="retire-confirm">Type the machine name to confirm</Label>
          <Input id="retire-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={typed.trim() !== name}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() =>
              startTransition(async () => {
                const result = await updateMachine({ id, retire: true });
                if (result.ok) {
                  toast.success(`${name} retired.`);
                  router.push("/console/machines");
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            Retire
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
