CREATE TABLE `user_watchlists` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`items_json` text NOT NULL,
	`groups_json` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
