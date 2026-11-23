import type { Metadata } from "next";
import Link from "next/link";
import { Gate } from "@/components/gate";
import { LabelSheetView } from "@/components/catalog/label-sheet";
import { getLabelSheet } from "@/data/labels";
import { ServiceError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Labels" };

export default function ConsoleLabelsPage({ searchParams }: PageProps<"/console/labels">) {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="space-y-4">
        <div className="space-y-1 print:hidden">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Labels
          </h1>
          <p className="text-sm text-muted-foreground">
            Print on plain paper, cut along the dashed lines and tape each label to its machine. Need a sign for the
            door?{" "}
            <Link href="/console/door-poster" prefetch={false} className="underline underline-offset-4">
              Print the door poster
            </Link>
            .
          </p>
        </div>
        <Sheet searchParams={searchParams} />
      </section>
    </Gate>
  );
}

async function Sheet({ searchParams }: Pick<PageProps<"/console/labels">, "searchParams">) {
  const { ids } = await searchParams;
  let sheet;
  try {
    sheet = await getLabelSheet({ machineIds: ids });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "VALIDATION_FAILED") {
      return (
        <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
          That selection isn&apos;t valid.{" "}
          <Link href="/console/labels" prefetch={false} className="underline underline-offset-4">
            Print all labels
          </Link>{" "}
          instead.
        </p>
      );
    }
    throw err;
  }
  if (sheet.labels.length === 0) {
    return (
      <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
        No machines to label yet.{" "}
        <Link href="/console/machines/new" prefetch={false} className="underline underline-offset-4">
          Add a machine
        </Link>
        .
      </p>
    );
  }
  return (
    <LabelSheetView
      makerspaceName={sheet.makerspaceName}
      environment={sheet.environment}
      baseUrl={sheet.baseUrl}
      labels={sheet.labels}
    />
  );
}
