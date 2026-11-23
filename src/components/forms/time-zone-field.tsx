import { FieldError } from "@/components/forms/messages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Time zone: a text field with a searchable list of IANA zones (`<datalist>`).
 * The server validates the value against `Intl.supportedValuesOf("timeZone")`.
 */
export function TimeZoneField({
  timeZones,
  defaultValue,
  errors,
}: {
  timeZones: string[];
  defaultValue: string;
  errors?: string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="timezone">Time zone</Label>
      <Input
        id="timezone"
        name="timezone"
        list="timezone-options"
        required
        defaultValue={defaultValue}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? "timezone-error timezone-hint" : "timezone-hint"}
      />
      <datalist id="timezone-options">
        {timeZones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <p id="timezone-hint" className="text-sm text-muted-foreground">
        Start typing a city, e.g. America/Edmonton. Times in Cleared are shown in this zone.
      </p>
      <FieldError id="timezone-error" errors={errors} />
    </div>
  );
}
