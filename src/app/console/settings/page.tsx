import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { JoinLinkCard, SettingsForm } from "@/components/settings/settings-forms";
import { getSettings } from "@/data/settings";
import { supportedTimeZones } from "@/server/domain/identity";

export const metadata: Metadata = { title: "Settings" };

export default function ConsoleSettingsPage() {
  return (
    <Gate area="admin">
      <SettingsContent />
    </Gate>
  );
}

async function SettingsContent() {
  const settings = await getSettings();
  return (
    <section aria-labelledby="page-title" className="max-w-2xl space-y-10">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        Settings
      </h1>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Join link</h2>
        <p className="text-sm text-muted-foreground">
          Anyone signed in who opens this link can join as a member. Share it with your members; regenerate it if it
          gets out.
        </p>
        <JoinLinkCard joinUrl={settings.joinUrl} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Makerspace</h2>
        <SettingsForm name={settings.name} timezone={settings.timezone} timeZones={supportedTimeZones()} />
      </div>
    </section>
  );
}
