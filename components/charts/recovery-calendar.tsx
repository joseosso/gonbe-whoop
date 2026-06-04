"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { scaleLinear } from "d3";

import type { DaySeries } from "@/lib/analytics/types";

const CELL = 13;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 18; // month labels
const LEFT = 28; // weekday labels
const DAY_MS = 86_400_000;

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** WHOOP recovery palette: red (low) → amber → lime → green (high). */
const color = scaleLinear<string>()
  .domain([0, 33, 66, 100])
  .range(["#ef4444", "#f59e0b", "#84cc16", "#22c55e"])
  .clamp(true);

interface Cell {
  day: string;
  value: number | null;
  week: number;
  dow: number;
}

const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function buildCells(data: DaySeries): { cells: Cell[]; weeks: number } {
  const values = new Map(data.map((d) => [d.day, d.value]));
  const first = utc(data[0].day);
  const last = utc(data[data.length - 1].day);

  // Grid starts on the Sunday on/before the first day.
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const cells: Cell[] = [];
  for (let t = start.getTime(); t <= last.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const week = Math.round((t - start.getTime()) / DAY_MS / 7);
    cells.push({
      day: iso(d),
      value: values.get(iso(d)) ?? null,
      week,
      dow: d.getUTCDay(),
    });
  }
  return { cells, weeks: cells.length ? cells[cells.length - 1].week + 1 : 0 };
}

/** First column of each month, for placing month labels along the top. */
function monthLabels(cells: Cell[]) {
  const labels: { week: number; text: string }[] = [];
  let lastMonth = -1;
  for (const c of cells) {
    if (c.dow !== 0) continue; // one probe per column (its Sunday)
    const month = utc(c.day).getUTCMonth();
    if (month !== lastMonth) {
      labels.push({ week: c.week, text: MONTHS[month] });
      lastMonth = month;
    }
  }
  return labels;
}

/** The Sunday→Saturday week containing a day, as a `from`/`to` pair. */
function weekRange(day: string): { from: string; to: string } {
  const d = utc(day);
  const sunday = new Date(d);
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const saturday = new Date(sunday.getTime() + 6 * DAY_MS);
  return { from: iso(sunday), to: iso(saturday) };
}

export function RecoveryCalendar({ data }: { data: DaySeries }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [hover, setHover] = useState<Cell | null>(null);

  const { cells, weeks } = useMemo(() => buildCells(data), [data]);
  const labels = useMemo(() => monthLabels(cells), [cells]);

  const width = LEFT + weeks * STEP;
  const height = TOP + 7 * STEP;

  function selectWeek(day: string) {
    const { from, to } = weekRange(day);
    const next = new URLSearchParams(params);
    next.set("from", from);
    next.set("to", to);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground h-5 text-sm tabular-nums">
        {hover
          ? `${hover.day} · ${hover.value === null ? "no score" : `recovery ${hover.value}`}`
          : "Hover or focus a day; click to view that week."}
      </div>

      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Recovery score calendar heatmap"
        >
          {labels.map((l) => (
            <text
              key={`${l.week}-${l.text}`}
              x={LEFT + l.week * STEP}
              y={TOP - 6}
              className="fill-muted-foreground text-[10px]"
            >
              {l.text}
            </text>
          ))}

          {WEEKDAY_LABELS.map((label, dow) =>
            label ? (
              <text
                key={dow}
                x={0}
                y={TOP + dow * STEP + CELL - 2}
                className="fill-muted-foreground text-[10px]"
              >
                {label}
              </text>
            ) : null,
          )}

          {cells.map((c) => {
            const fill = c.value === null ? null : color(c.value);
            const label = `${c.day}: ${c.value === null ? "no score" : `recovery ${c.value}`}`;
            return (
              <rect
                key={c.day}
                x={LEFT + c.week * STEP}
                y={TOP + c.dow * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                fill={fill ?? undefined}
                className={fill ? undefined : "fill-muted"}
                tabIndex={0}
                role="button"
                aria-label={label}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c)}
                onBlur={() => setHover(null)}
                onClick={() => selectWeek(c.day)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectWeek(c.day);
                  }
                }}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <title>{label}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span>Low</span>
      <div className="flex">
        {[6, 20, 40, 60, 80, 95].map((v) => (
          <span
            key={v}
            className="size-3"
            style={{ backgroundColor: color(v) }}
          />
        ))}
      </div>
      <span>High</span>
    </div>
  );
}
