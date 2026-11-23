// P5-27: datetime-local values in the makerspace's time zone ↔ UTC ms.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";

describe("datetime-local in a time zone", () => {
  it("round-trips in Edmonton (winter and summer) and UTC", () => {
    const winter = Date.UTC(2026, 0, 5, 16, 0); // 9 am MST
    expect(toDateTimeLocal(winter, "America/Edmonton")).toBe("2026-01-05T09:00");
    expect(fromDateTimeLocal("2026-01-05T09:00", "America/Edmonton")).toBe(winter);
    const summer = Date.UTC(2026, 6, 1, 15, 30); // 9:30 am MDT
    expect(toDateTimeLocal(summer, "America/Edmonton")).toBe("2026-07-01T09:30");
    expect(fromDateTimeLocal("2026-07-01T09:30", "America/Edmonton")).toBe(summer);
    expect(fromDateTimeLocal("2026-07-01T09:30", "UTC")).toBe(Date.UTC(2026, 6, 1, 9, 30));
    expect(toDateTimeLocal(Date.UTC(2026, 6, 1, 0, 5), "Asia/Kolkata")).toBe("2026-07-01T05:35");
  });

  it("midnight and invalid input", () => {
    expect(toDateTimeLocal(Date.UTC(2026, 0, 6, 7, 0), "America/Edmonton")).toBe("2026-01-06T00:00");
    expect(fromDateTimeLocal("", "UTC")).toBeNull();
    expect(fromDateTimeLocal("2026-01-05", "UTC")).toBeNull();
  });

  it("the DST overlap picks the earlier instant", () => {
    // 2026-11-01 01:30 happens twice in Edmonton: MDT (07:30 UTC) then MST (08:30 UTC).
    expect(fromDateTimeLocal("2026-11-01T01:30", "America/Edmonton")).toBe(Date.UTC(2026, 10, 1, 7, 30));
  });
});
