import { z } from "zod";

import { WHOOP_API_BASE, WHOOP_PAGE_LIMIT } from "./constants";
import { getValidAccessToken } from "./oauth";
import { paginated } from "./schemas";

const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a WHOOP endpoint with auth, retrying on rate-limit / transient errors. */
async function whoopGet(path: string, search: URLSearchParams): Promise<unknown> {
  const url = `${WHOOP_API_BASE}${path}?${search.toString()}`;

  for (let attempt = 0; ; attempt++) {
    const token = await getValidAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`WHOOP GET ${path} failed (${res.status}): ${await res.text()}`);
    }

    // Honor Retry-After when present, else exponential backoff.
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await sleep(delay);
  }
}

export interface DateRange {
  start?: string; // ISO-8601
  end?: string;
}

/**
 * Yield every record from a paginated WHOOP collection, walking `next_token`
 * until exhausted. Each record is validated against `record`.
 */
export async function* paginate<T extends z.ZodTypeAny>(
  path: string,
  record: T,
  range: DateRange = {},
): AsyncGenerator<z.infer<T>> {
  const envelope = paginated(record);
  let nextToken: string | undefined;

  do {
    const search = new URLSearchParams({ limit: String(WHOOP_PAGE_LIMIT) });
    if (range.start) search.set("start", range.start);
    if (range.end) search.set("end", range.end);
    if (nextToken) search.set("nextToken", nextToken);

    const page = envelope.parse(await whoopGet(path, search));
    for (const rec of page.records) yield rec;

    nextToken = page.next_token ?? undefined;
  } while (nextToken);
}
