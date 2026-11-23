import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { AddRoomForm, RoomList } from "@/components/catalog/rooms-manager";
import { listRooms } from "@/data/rooms";

export const metadata: Metadata = { title: "Rooms" };

export default function ConsoleRoomsPage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="max-w-2xl space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Rooms
        </h1>
        <RoomsContent />
      </section>
    </Gate>
  );
}

async function RoomsContent() {
  const rooms = await listRooms();
  return (
    <div className="space-y-6">
      {rooms.length === 0 ? (
        <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
          Add your first room, e.g. <em>Laser Room</em>.
        </p>
      ) : (
        <RoomList rooms={rooms} />
      )}
      <AddRoomForm />
    </div>
  );
}
