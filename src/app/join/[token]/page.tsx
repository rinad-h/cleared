import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinForm } from "@/components/join/join-form";
import { CenteredLayout } from "@/components/layouts/centered";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getJoinPreview } from "@/data/join";
import { getMe } from "@/data/me";
import { JoinToken } from "@/lib/schemas/identity";

export const metadata: Metadata = { title: "Join" };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <CenteredLayout>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <JoinBody params={params} />
      </Suspense>
    </CenteredLayout>
  );
}

async function JoinBody({ params }: Pick<PageProps<"/join/[token]">, "params">) {
  const { token } = await params;
  const me = await getMe();
  if (!me.user) redirect(`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`);
  // Already a member: joining again changes nothing (FR-02).
  if (me.membership) redirect("/machines");

  const parsed = JoinToken.safeParse(token);
  const preview = parsed.success ? await getJoinPreview(parsed.data) : ({ valid: false, reason: "invalid" } as const);

  if (!preview.valid) {
    return (
      <section aria-labelledby="page-title" className="space-y-4">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          {preview.reason === "setup-not-done" ? "Not set up yet" : "This join link isn't valid any more"}
        </h1>
        <p className="text-muted-foreground">
          {preview.reason === "setup-not-done"
            ? "This makerspace hasn't been set up yet."
            : "Ask staff for the current link."}
        </p>
        {preview.reason === "setup-not-done" ? (
          <Button asChild>
            <Link href="/setup" prefetch={false}>
              Set it up
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="break-all">{me.user.email}</span>.
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Join <span className="break-words">{preview.makerspaceName}</span>
        </h1>
        <p className="text-muted-foreground">
          You&apos;ll join as a member, signed in as <span className="break-all">{me.user.email}</span>.
        </p>
      </div>
      <JoinForm token={token} />
    </section>
  );
}

