CREATE TABLE "cycles" (
	"id" bigint PRIMARY KEY NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"tz_offset" text,
	"strain" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"kilojoule" double precision,
	"score_state" text,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"tag" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_tags_day_tag_unique" UNIQUE("day","tag")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"start_day" date NOT NULL,
	"end_day" date,
	"label" text NOT NULL,
	"type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights_cache" (
	"week_start" date PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recoveries" (
	"cycle_id" bigint PRIMARY KEY NOT NULL,
	"sleep_id" uuid,
	"recovery_score" integer,
	"resting_hr" integer,
	"hrv_rmssd_milli" double precision,
	"spo2" double precision,
	"skin_temp_c" double precision,
	"calibrating" boolean,
	"score_state" text,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleeps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"tz_offset" text,
	"is_nap" boolean DEFAULT false,
	"performance_pct" double precision,
	"consistency_pct" double precision,
	"efficiency_pct" double precision,
	"respiratory_rate" double precision,
	"need_baseline_milli" bigint,
	"need_from_debt_milli" bigint,
	"need_from_strain_milli" bigint,
	"in_bed_milli" bigint,
	"awake_milli" bigint,
	"light_milli" bigint,
	"sws_milli" bigint,
	"rem_milli" bigint,
	"no_data_milli" bigint,
	"disturbance_count" integer,
	"sleep_cycle_count" integer,
	"score_state" text,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"resource" text PRIMARY KEY NOT NULL,
	"last_synced" timestamp with time zone,
	"cursor" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whoop_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"tz_offset" text,
	"sport_id" integer,
	"sport_name" text,
	"strain" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"kilojoule" double precision,
	"distance_meter" double precision,
	"altitude_gain_m" double precision,
	"zone0_milli" bigint,
	"zone1_milli" bigint,
	"zone2_milli" bigint,
	"zone3_milli" bigint,
	"zone4_milli" bigint,
	"zone5_milli" bigint,
	"score_state" text,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cycles_start_idx" ON "cycles" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "day_tags_day_idx" ON "day_tags" USING btree ("day");--> statement-breakpoint
CREATE INDEX "sleeps_start_idx" ON "sleeps" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "sleeps_nap_idx" ON "sleeps" USING btree ("is_nap");--> statement-breakpoint
CREATE INDEX "workouts_start_idx" ON "workouts" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "workouts_sport_idx" ON "workouts" USING btree ("sport_id");