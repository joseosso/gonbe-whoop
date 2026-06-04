import { z } from "zod";

/**
 * Zod schemas for the WHOOP v2 payloads we consume. We validate the fields we
 * persist and keep `.passthrough()` so the full body can still be stored in the
 * `raw` column without losing unknown/future fields.
 *
 * WHOOP returns the full `score` object even when a given metric does not apply
 * (e.g. `distance_meter` for a strength workout), sending `null` for those
 * leaves. zod's `.optional()` accepts `undefined` but rejects `null`, so every
 * score leaf is `.nullish()` (null | undefined). Our row mappers coalesce these
 * to `null` and the raw body is always persisted, so leniency here is safe.
 */

const scoreState = z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);

const num = z.number().nullish();
const bool = z.boolean().nullish();

export const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
  token_type: z.string(),
});
export type TokenResponse = z.infer<typeof tokenResponse>;

export const cycle = z
  .object({
    id: z.number(),
    start: z.string(),
    end: z.string().nullable().optional(),
    timezone_offset: z.string().nullish(),
    score_state: scoreState.nullish(),
    score: z
      .object({
        strain: num,
        average_heart_rate: num,
        max_heart_rate: num,
        kilojoule: num,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const recovery = z
  .object({
    cycle_id: z.number(),
    sleep_id: z.string().nullable().optional(),
    score_state: scoreState.nullish(),
    score: z
      .object({
        user_calibrating: bool,
        recovery_score: num,
        resting_heart_rate: num,
        hrv_rmssd_milli: num,
        spo2_percentage: num,
        skin_temp_celsius: num,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const sleep = z
  .object({
    id: z.string(),
    start: z.string(),
    end: z.string(),
    timezone_offset: z.string().nullish(),
    nap: z.boolean().nullish(),
    score_state: scoreState.nullish(),
    score: z
      .object({
        sleep_performance_percentage: num,
        sleep_consistency_percentage: num,
        sleep_efficiency_percentage: num,
        respiratory_rate: num,
        sleep_needed: z
          .object({
            baseline_milli: num,
            need_from_sleep_debt_milli: num,
            need_from_recent_strain_milli: num,
          })
          .passthrough()
          .nullish(),
        stage_summary: z
          .object({
            total_in_bed_time_milli: num,
            total_awake_time_milli: num,
            total_light_sleep_time_milli: num,
            total_slow_wave_sleep_time_milli: num,
            total_rem_sleep_time_milli: num,
            total_no_data_time_milli: num,
            disturbance_count: num,
            sleep_cycle_count: num,
          })
          .passthrough()
          .nullish(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const workout = z
  .object({
    id: z.string(),
    start: z.string(),
    end: z.string(),
    timezone_offset: z.string().nullish(),
    sport_id: z.number().nullish(),
    sport_name: z.string().nullish(),
    score_state: scoreState.nullish(),
    score: z
      .object({
        strain: num,
        average_heart_rate: num,
        max_heart_rate: num,
        kilojoule: num,
        distance_meter: num,
        altitude_gain_meter: num,
        zone_durations: z
          .object({
            zone_zero_milli: num,
            zone_one_milli: num,
            zone_two_milli: num,
            zone_three_milli: num,
            zone_four_milli: num,
            zone_five_milli: num,
          })
          .passthrough()
          .nullish(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

/** Paginated collection envelope: `{ records: [...], next_token?: string }`. */
export const paginated = <T extends z.ZodTypeAny>(record: T) =>
  z.object({
    records: z.array(record),
    next_token: z.string().nullable().optional(),
  });

export type Cycle = z.infer<typeof cycle>;
export type Recovery = z.infer<typeof recovery>;
export type Sleep = z.infer<typeof sleep>;
export type Workout = z.infer<typeof workout>;
