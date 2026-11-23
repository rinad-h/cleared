import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { DoorPosterView } from "@/components/catalog/door-poster";
import { getDoorPoster } from "@/data/labels";

export const metadata: Metadata = { title: "Door poster" };

export default function DoorPosterPage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="space-y-4">
        <div className="space-y-1 print:hidden">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Door poster
          </h1>
          <p className="text-sm text-muted-foreground">
            A Letter-size sign for the door: members scan it to see which machines are free.
          </p>
        </div>
        <Poster />
      </section>
    </Gate>
  );
}

async function Poster() {
  const poster = await getDoorPoster();
  return <DoorPosterView {...poster} />;
}
