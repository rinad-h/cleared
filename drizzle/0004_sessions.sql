CREATE TABLE `machine_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`member_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`expected_end_at` integer NOT NULL,
	`ended_at` integer,
	`end_reason` text,
	`ended_by_member_id` text,
	`supervision_acknowledged` integer DEFAULT false NOT NULL,
	`client_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ended_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "machine_sessions_end_reason" CHECK("machine_sessions"."end_reason" IS NULL OR "machine_sessions"."end_reason" IN ('user','staff','expired','machine_down','authorization_removed')),
	CONSTRAINT "machine_sessions_supervision_acknowledged" CHECK("machine_sessions"."supervision_acknowledged" IN (0,1)),
	CONSTRAINT "machine_sessions_end_after_start" CHECK("machine_sessions"."expected_end_at" > "machine_sessions"."started_at"),
	CONSTRAINT "machine_sessions_max_length" CHECK("machine_sessions"."expected_end_at" - "machine_sessions"."started_at" <= 240 * 60000),
	CONSTRAINT "machine_sessions_ended_consistent" CHECK(("machine_sessions"."ended_at" IS NULL) = ("machine_sessions"."end_reason" IS NULL)),
	CONSTRAINT "machine_sessions_ended_after_start" CHECK("machine_sessions"."ended_at" IS NULL OR "machine_sessions"."ended_at" >= "machine_sessions"."started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_sessions_client_request_id_unique` ON `machine_sessions` (`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `machine_sessions_one_open` ON `machine_sessions` (`machine_id`) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX `machine_sessions_open_expiry` ON `machine_sessions` (`expected_end_at`) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX `machine_sessions_member` ON `machine_sessions` (`member_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `machine_sessions_machine` ON `machine_sessions` (`machine_id`,`started_at`);