CREATE TABLE `worker_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`body_gzip_base64` text NOT NULL,
	`headers_json` text NOT NULL,
	`body_bytes` integer NOT NULL,
	`compressed_bytes` integer NOT NULL,
	`stored_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `worker_cache_expiration` ON `worker_cache` (`expires_at`,`stored_at`);
