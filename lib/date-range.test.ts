import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/analytics/types";
import { clampEventsToRange } from "./date-range";

const event = (
  startDay: string,
  endDay: string | null,
  id = 1,
): EventRow => ({ id, startDay, endDay, label: "e", type: null });

const range = { from: "2024-06-10", to: "2024-06-20" };

describe("clampEventsToRange", () => {
  it("leaves an event inside the range untouched", () => {
    const [e] = clampEventsToRange([event("2024-06-12", "2024-06-15")], range);
    expect(e).toMatchObject({ startDay: "2024-06-12", endDay: "2024-06-15" });
  });

  it("clamps a span overflowing both bounds to the range", () => {
    const [e] = clampEventsToRange([event("2024-06-01", "2024-06-30")], range);
    expect(e).toMatchObject({ startDay: "2024-06-10", endDay: "2024-06-20" });
  });

  it("keeps single-day events single-day", () => {
    const [e] = clampEventsToRange([event("2024-06-05", null)], range);
    expect(e.endDay).toBeNull();
    expect(e.startDay).toBe("2024-06-10"); // start before `from` is clamped
  });
});
