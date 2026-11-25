CREATE TABLE `option_monitor_webapi_oi` (
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
CREATE INDEX `option_monitor_webapi_oi_lookup` ON `option_monitor_webapi_oi` (`symbol`,`expiration`,`observed_date`);