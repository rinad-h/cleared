"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { createRoom, moveRoom, updateRoom } from "@/actions/rooms";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "./use-action-result";

export type RoomRow = { id: string; name: string; machineCount: number };

/** Staff: add a room. Clears the field after a successful add. */
export function AddRoomForm() {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report } = useActionResult();
  return (
    <form
      className="flex max-w-md flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          if (report(await createRoom(data), "Room added.")) form.reset();
        });
      }}
    >
      <Label htmlFor="new-room">Room name</Label>
      <div className="flex gap-2">
        <Input
          id="new-room"
          name="name"
          required
          maxLength={60}
          placeholder="e.g. Laser Room"
          aria-invalid={fieldErrors?.name ? true : undefined}
          aria-describedby={fieldErrors?.name ? "new-room-error" : undefined}
        />
        <Button type="submit" disabled={!hydrated || pending}>
          {pending ? "Adding…" : "Add room"}
        </Button>
      </div>
      <FieldError id="new-room-error" errors={fieldErrors?.name} />
      <FormMessage error={error} />
    </form>
  );
}

function RoomItem({ room, first, last }: { room: RoomRow; first: boolean; last: boolean }) {
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report, clear } = useActionResult();
  const input = useRef<HTMLInputElement>(null);
  const inputId = `room-${room.id}`;

  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      report(await moveRoom({ id: room.id, direction }));
    });

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = input.current?.value ?? "";
            startTransition(async () => {
              if (report(await updateRoom({ id: room.id, name }), "Room renamed.")) setEditing(false);
            });
          }}
        >
          <Label htmlFor={inputId}>New name for {room.name}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              ref={input}
              id={inputId}
              defaultValue={room.name}
              required
              maxLength={60}
              className="min-w-40 flex-1"
              aria-invalid={fieldErrors?.name ? true : undefined}
              aria-describedby={fieldErrors?.name ? `${inputId}-error` : undefined}
            />
            <Button type="submit" disabled={pending}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clear();
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
          <FieldError id={`${inputId}-error`} errors={fieldErrors?.name} />
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{room.name}</span>
            <span className="block text-sm text-muted-foreground">
              {room.machineCount === 1 ? "1 machine" : `${room.machineCount} machines`}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${room.name} up`}
            disabled={!hydrated || pending || first}
            onClick={() => move("up")}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${room.name} down`}
            disabled={!hydrated || pending || last}
            onClick={() => move("down")}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hydrated}
            aria-label={`Rename ${room.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
            Rename
          </Button>
        </div>
      )}
      <FormMessage error={error} />
    </li>
  );
}

export function RoomList({ rooms }: { rooms: RoomRow[] }) {
  return (
    <ul className="divide-y rounded-md border" aria-label="Rooms">
      {rooms.map((room, i) => (
        <RoomItem key={room.id} room={room} first={i === 0} last={i === rooms.length - 1} />
      ))}
    </ul>
  );
}
