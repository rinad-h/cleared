import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/auth";
import { getMakerspace } from "@/data/me";
import { safeNext } from "@/server/domain/identity";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <Suspense fallback={<Heading makerspaceName={null} />}>
        <SignInHeading />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <SignInBody searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function Heading({ makerspaceName }: { makerspaceName: string | null }) {
  return (
    <div className="space-y-1">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        Sign in
      </h1>
      {makerspaceName ? <p className="text-muted-foreground">{makerspaceName}</p> : null}
    </div>
  );
}

async function SignInHeading() {
  const makerspace = await getMakerspace();
  return <Heading makerspaceName={makerspace?.name ?? null} />;
}

async function SignInBody({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  // Already signed in: carry on to where they were going.
  if (await getSessionUser()) redirect(next);
  const email = first(params.email);
  return <SignInForm next={next} defaultEmail={email && email.length <= 254 ? email : undefined} />;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
