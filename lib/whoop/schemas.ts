import { z } from "zod";

/**
 * Zod schemas for the WHOOP v2 payloads we consume. We validate the fields we
 * persist and keep `.passthrough()` so the full body can still be stored in the
 * `raw` column without losing unknown/future fields.
 */

const scoreState = z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);

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
    timezone_offset: z.string().optional(),
    score_state: scoreState.optional(),
    score: z
      .object({
        strain: z.number().optional(),
        average_heart_rate: z.number().optional(),
        max_heart_rate: z.number().optional(),
        kilojoule: z.number().optional(),
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
    score_state: scoreState.optional(),
    score: z
      .object({
        user_calibrating: z.boolean().optional(),
        recovery_score: z.number().optional(),
        resting_heart_rate: z.number().optional(),
        hrv_rmssd_milli: z.number().optional(),
        spo2_percentage: z.number().optional(),
        skin_temp_celsius: z.number().optional(),
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
    timezone_offset: z.string().optional(),
    nap: z.boolean().optional(),
    score_state: scoreState.optional(),
    score: z
      .object({
        sleep_performance_percentage: z.number().optional(),
        sleep_consistency_percentage: z.number().optional(),
        sleep_efficiency_percentage: z.number().optional(),
        respiratory_rate: z.number().optional(),
        sleep_needed: z
          .object({
            baseline_milli: z.number().optional(),
            need_from_sleep_debt_milli: z.number().optional(),
            need_from_recent_strain_milli: z.number().optional(),
          })
          .passthrough()
          .optional(),
        stage_summary: z
          .object({
            total_in_bed_time_milli: z.number().optional(),
            total_awake_time_milli: z.number().optional(),
            total_light_sleep_time_milli: z.number().optional(),
            total_slow_wave_sleep_time_milli: z.number().optional(),
            total_rem_sleep_time_milli: z.number().optional(),
            total_no_data_time_milli: z.number().optional(),
            disturbance_count: z.number().optional(),
            sleep_cycle_count: z.number().optional(),
          })
          .passthrough()
          .optional(),
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
    timezone_offset: z.string().optional(),
    sport_id: z.number().optional(),
    sport_name: z.string().optional(),
    score_state: scoreState.optional(),
    score: z
      .object({
        strain: z.number().optional(),
        average_heart_rate: z.number().optional(),
        max_heart_rate: z.number().optional(),
        kilojoule: z.number().optional(),
        distance_meter: z.number().optional(),
        altitude_gain_meter: z.number().optional(),
        zone_durations: z
          .object({
            zone_zero_milli: z.number().optional(),
            zone_one_milli: z.number().optional(),
            zone_two_milli: z.number().optional(),
            zone_three_milli: z.number().optional(),
            zone_four_milli: z.number().optional(),
            zone_five_milli: z.number().optional(),
          })
          .passthrough()
          .optional(),
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
