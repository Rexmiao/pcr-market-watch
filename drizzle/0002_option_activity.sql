CREATE TABLE `option_monitor_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`payload_json` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `option_monitor_oi` (
	`symbol` text NOT NULL,
	`contract` text NOT NULL,
	`expiration` text NOT NULL,
	`option_type` text NOT NULL,
	`strike` real NOT NULL,
	`observed_date` text NOT NULL,
	`open_interest` integer NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`contract`, `observed_date`)
);
--> statement-breakpoint
CREATE INDEX `option_monitor_oi_lookup` ON `option_monitor_oi` (`symbol`,`expiration`,`observed_date`);