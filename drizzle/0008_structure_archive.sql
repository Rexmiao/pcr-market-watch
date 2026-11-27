CREATE TABLE `structure_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `observation_date` text NOT NULL,
  `kind` text NOT NULL,
  `symbol` text NOT NULL,
  `scope_kind` text NOT NULL,
  `scope_key` text NOT NULL,
  `expiries_json` text NOT NULL,
  `queried_at` text NOT NULL,
  `provider_updated_at` text,
  `oi_settlement_date` text,
  `status` text NOT NULL,
  `units` text NOT NULL,
  `payload_gzip_base64` text NOT NULL,
  `payload_bytes` integer NOT NULL,
  `compressed_bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `structure_snapshots_by_day` ON `structure_snapshots` (`symbol`,`observation_date`,`queried_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `structure_snapshots_scope_unique` ON `structure_snapshots` (`run_id`,`kind`,`symbol`,`scope_kind`,`scope_key`);
--> statement-breakpoint
CREATE TRIGGER `structure_snapshots_no_update` BEFORE UPDATE ON `structure_snapshots` BEGIN SELECT RAISE(ABORT,'Structure snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `structure_snapshots_no_delete` BEFORE DELETE ON `structure_snapshots` BEGIN SELECT RAISE(ABORT,'Structure snapshots are append-only'); END;
--> statement-breakpoint
CREATE TABLE `structure_daily_runs` (
  `run_id` text PRIMARY KEY NOT NULL,
  `observation_date` text NOT NULL,
  `mode` text NOT NULL,
  `status` text NOT NULL,
  `payload_json` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text
);
--> statement-breakpoint
CREATE INDEX `structure_daily_runs_by_day` ON `structure_daily_runs` (`observation_date`,`started_at`);
--> statement-breakpoint
CREATE TABLE `structure_daily_state` (
  `id` text PRIMARY KEY NOT NULL,
  `payload_json` text NOT NULL,
  `updated_at` text NOT NULL,
  `lease_until` integer NOT NULL DEFAULT 0
);
