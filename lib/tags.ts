/**
 * Suggested vocabularies for behavior tags and life events. These are UI
 * suggestions only — the tag/event APIs accept any non-empty label, so the
 * vocabulary stays extensible (SPEC §5 driver analysis).
 */

/** Common behavior tags surfaced as one-click chips in the tag editor. */
export const TAG_VOCAB = [
  "travel",
  "sick",
  "stress",
  "alcohol",
  "rest-day",
] as const;

/** Event categories (mirrors the `events.type` column comment in the schema). */
export const EVENT_TYPES = [
  "race",
  "illness",
  "vacation",
  "injury",
  "other",
] as const;
