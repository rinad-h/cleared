CREATE TABLE `service_records` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`performed_at` integer NOT NULL,
	`performed_by_member_id` text,
	`external_technician` text,
	`logged_by_member_id` text NOT NULL,
	`type` text NOT NULL,
	`work_done` text NOT NULL,
	`parts_used` text,
	`minutes_spent` integer,
	`outcome` text NOT NULL,
	`checkup_id` text,
	`corrects_record_id` text,
	`client_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performed_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`logged_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corrects_record_id`) REFERENCES `service_records`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "service_records_external_technician_length" CHECK("service_records"."external_technician" IS NULL OR length("service_records"."external_technician") BETWEEN 2 AND 120),
	CONSTRAINT "service_records_type" CHECK("service_records"."type" IN ('repair','scheduled_checkup','inspection','cleaning','calibration','other')),
	CONSTRAINT "service_records_work_done_length" CHECK(length("service_records"."work_done") BETWEEN 10 AND 2000),
	CONSTRAINT "service_records_parts_used_length" CHECK("service_records"."parts_used" IS NULL OR length("service_records"."parts_used") <= 500),
	CONSTRAINT "service_records_minutes_spent" CHECK("service_records"."minutes_spent" IS NULL OR "service_records"."minutes_spent" BETWEEN 1 AND 10000),
	CONSTRAINT "service_records_outcome" CHECK("service_records"."outcome" IN ('returned_to_service','still_out_of_service','passed','issues_found')),
	CONSTRAINT "service_records_one_performer" CHECK(("service_records"."performed_by_member_id" IS NULL) <> ("service_records"."external_technician" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_records_client_request_id_unique` ON `service_records` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `service_records_machine` ON `service_records` (`machine_id`,`performed_at`);--> statement-breakpoint
CREATE INDEX `service_records_checkup` ON `service_records` (`checkup_id`,`performed_at`) WHERE checkup_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `service_records_corrects` ON `service_records` (`corrects_record_id`) WHERE corrects_record_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `faults` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`reported_by_member_id` text NOT NULL,
	`description` text NOT NULL,
	`took_out_of_service` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_service_record_id` text,
	`resolved_at` integer,
	`client_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reported_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_service_record_id`) REFERENCES `service_records`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "faults_description_length" CHECK(length("faults"."description") BETWEEN 10 AND 1000),
	CONSTRAINT "faults_took_out_of_service" CHECK("faults"."took_out_of_service" IN (0,1)),
	CONSTRAINT "faults_status" CHECK("faults"."status" IN ('open','resolved')),
	CONSTRAINT "faults_resolved_at_consistent" CHECK(("faults"."status" = 'resolved') = ("faults"."resolved_at" IS NOT NULL)),
	CONSTRAINT "faults_resolved_by_consistent" CHECK(("faults"."status" = 'resolved') = ("faults"."resolved_by_service_record_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faults_client_request_id_unique` ON `faults` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `faults_machine_status` ON `faults` (`machine_id`,`status`);--> statement-breakpoint
CREATE INDEX `faults_open_queue` ON `faults` ("took_out_of_service" DESC,`created_at`) WHERE status = 'open';--> statement-breakpoint
CREATE INDEX `faults_resolved_by` ON `faults` (`resolved_by_service_record_id`) WHERE resolved_by_service_record_id IS NOT NULL;--> statement-breakpoint
-- Hand-written (drizzle-kit doesn't generate triggers): FR-15 / PRD 7.1, the service history is append-only.
CREATE TRIGGER `service_records_no_update` BEFORE UPDATE ON `service_records`
BEGIN SELECT RAISE(ABORT, 'service_records are append-only'); END;--> statement-breakpoint
CREATE TRIGGER `service_records_no_delete` BEFORE DELETE ON `service_records`
BEGIN SELECT RAISE(ABORT, 'service_records are append-only'); END;
