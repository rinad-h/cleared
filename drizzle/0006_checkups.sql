CREATE TABLE `checkups` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`name` text NOT NULL,
	`interval_days` integer NOT NULL,
	`instructions` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "checkups_name_length" CHECK(length("checkups"."name") BETWEEN 2 AND 120),
	CONSTRAINT "checkups_interval_days" CHECK("checkups"."interval_days" BETWEEN 1 AND 730),
	CONSTRAINT "checkups_instructions_length" CHECK("checkups"."instructions" IS NULL OR length("checkups"."instructions") <= 2000),
	CONSTRAINT "checkups_active" CHECK("checkups"."active" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `checkups_machine` ON `checkups` (`machine_id`);