CREATE TABLE `oi_summary_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`checked_at` text NOT NULL
);
