CREATE TABLE `oi_daily_state` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oi_daily_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`observation_date` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oi_daily_runs_by_date` ON `oi_daily_runs` (`observation_date`,`completed_at`);
