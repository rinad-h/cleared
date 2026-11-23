import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/auth";
import { safeNext } from "@/server/domain/identity";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <div className="space-y-1">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="text-muted-foreground">You&apos;ll be signed in straight away.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SignUpBody searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function SignUpBody({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNext(raw);
  if (await getSessionUser()) redirect(next);
  return <SignUpForm next={next} />;
}
