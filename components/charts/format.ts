import { format, parseISO } from "date-fns";

/** `"Jun 5"` — compact day for axis ticks. */
export const shortDay = (day: string) => format(parseISO(day), "MMM d");

/** `"Wed, Jun 5"` — full day for tooltips; tolerant of Recharts' `unknown` label. */
export const longDay = (label: unknown) =>
  typeof label === "string" ? format(parseISO(label), "EEE, MMM d") : "";

/** Shared Recharts tooltip surface, themed via CSS vars. */
export const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: "0.75rem",
} as const;
