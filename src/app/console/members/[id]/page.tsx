import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Gate } from "@/components/gate";
import { RoleForm, StatusForm } from "@/components/members/member-forms";
import { MemberStatusLabel, ROLE_LABELS } from "@/components/members/member-status";
import { MemberCertifications } from "@/components/grants/member-certifications";
import { getMemberDetail } from "@/data/members";
import { getMakerspace } from "@/data/me";
import { getActor } from "@/lib/actor";
import { can, canChangeStatusOf } from "@/lib/permissions";
import { ServiceError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Member" };

export default function MemberDetailPage({ params }: PageProps<"/console/members/[id]">) {
  return (
    <Gate area="staff">
      <MemberDetail params={params} />
    </Gate>
  );
}

function formatDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone }).format(ms);
}

async function MemberDetail({ params }: Pick<PageProps<"/console/members/[id]">, "params">) {
  const { id } = await params;
  const [actor, makerspace] = await Promise.all([getActor(), getMakerspace()]);
  let member;
  try {
    member = await getMemberDetail(id);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  }
  const timeZone = makerspace?.timezone ?? "UTC";
  const showRole = can(actor, "changeRoles");
  const showStatus = !member.isSelf && canChangeStatusOf(actor, member.role);
  const mayGrant = !member.isSelf && can(actor, "signOff");

  return (
    <section aria-labelledby="page-title" className="max-w-2xl space-y-8">
      <div className="space-y-2">
        <Link
          href="/console/members"
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Members
        </Link>
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight break-words">
          {member.displayName}
          {member.isSelf ? <span className="ml-2 text-base font-normal text-muted-foreground">(you)</span> : null}
        </h1>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="break-all">{member.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd>{ROLE_LABELS[member.role]}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <MemberStatusLabel status={member.status} />
        </dd>
        {member.status === "suspended" && member.suspensionReason ? (
          <>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="break-words">{member.suspensionReason}</dd>
          </>
        ) : null}
        {member.statusChangedAt ? (
          <>
            <dt className="text-muted-foreground">Status changed</dt>
            <dd>{formatDate(member.statusChangedAt, timeZone)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{formatDate(member.joinedAt, timeZone)}</dd>
      </dl>

      <MemberCertifications
        member={member}
        certifications={member.certifications}
        history={member.history}
        canSignOff={mayGrant && member.status === "active"}
        canRevoke={mayGrant}
        timeZone={timeZone}
      />

      {showRole ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Role</h2>
          <RoleForm memberId={member.id} role={member.role} isSelf={member.isSelf} />
        </div>
      ) : null}

      {showStatus ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Access</h2>
          <StatusForm memberId={member.id} status={member.status} name={member.displayName} />
        </div>
      ) : null}
    </section>
  );
}
