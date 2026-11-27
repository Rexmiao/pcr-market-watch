CREATE TABLE `oi_summary_snapshots` (
  `symbol` text NOT NULL,
  `provider` text NOT NULL,
  `checked_at` text NOT NULL,
  `observation_date` text NOT NULL,
  `oi_as_of` text,
  `oi_as_of_confirmed` integer DEFAULT 0 NOT NULL,
  `payload_json` text NOT NULL,
  `reason` text NOT NULL,
  PRIMARY KEY (`symbol`,`provider`,`checked_at`)
);
--> statement-breakpoint
CREATE INDEX `oi_summary_snapshots_by_day` ON `oi_summary_snapshots` (`provider`,`observation_date`,`symbol`,`checked_at`);
