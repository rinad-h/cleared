CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`training_url` text,
	`validity_months` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "certifications_name_length" CHECK(length("certifications"."name") BETWEEN 2 AND 80),
	CONSTRAINT "certifications_training_url" CHECK("certifications"."training_url" IS NULL OR (length("certifications"."training_url") <= 500 AND ("certifications"."training_url" LIKE 'https://%' OR "certifications"."training_url" LIKE 'http://%'))),
	CONSTRAINT "certifications_validity_months" CHECK("certifications"."validity_months" IS NULL OR "certifications"."validity_months" BETWEEN 1 AND 120),
	CONSTRAINT "certifications_active" CHECK("certifications"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certifications_name_unique` ON `certifications` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `machine_requirements` (
	`machine_id` text NOT NULL,
	`certification_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `certification_id`),
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `machine_requirements_cert` ON `machine_requirements` (`certification_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`supervised` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`status_changed_at` integer NOT NULL,
	`out_of_service_reason` text,
	`status_note` text,
	`expected_back_at` integer,
	`qr_token` text NOT NULL,
	`typical_session_minutes` integer DEFAULT 60 NOT NULL,
	`write_token` text NOT NULL,
	`retired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "machines_name_length" CHECK(length("machines"."name") BETWEEN 1 AND 80),
	CONSTRAINT "machines_supervised" CHECK("machines"."supervised" IN (0,1)),
	CONSTRAINT "machines_status" CHECK("machines"."status" IN ('available','out_of_service','retired')),
	CONSTRAINT "machines_out_of_service_reason" CHECK("machines"."out_of_service_reason" IS NULL OR "machines"."out_of_service_reason" IN ('issue_reported','maintenance','other')),
	CONSTRAINT "machines_status_note_length" CHECK("machines"."status_note" IS NULL OR length("machines"."status_note") <= 200),
	CONSTRAINT "machines_typical_session_minutes" CHECK("machines"."typical_session_minutes" BETWEEN 15 AND 240),
	CONSTRAINT "machines_out_of_service_consistent" CHECK(("machines"."status" = 'out_of_service') = ("machines"."out_of_service_reason" IS NOT NULL)),
	CONSTRAINT "machines_retired_consistent" CHECK(("machines"."status" = 'retired') = ("machines"."retired_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_qr_token_unique` ON `machines` (`qr_token`);--> statement-breakpoint
CREATE INDEX `machines_room` ON `machines` (`room_id`);--> statement-breakpoint
CREATE INDEX `machines_status` ON `machines` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `machines_name_live` ON `machines` ("name" COLLATE NOCASE) WHERE status <> 'retired';--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rooms_name_length" CHECK(length("rooms"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` ("name" COLLATE NOCASE);