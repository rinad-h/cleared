CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`certification_id` text NOT NULL,
	`granted_by_member_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer,
	`client_request_id` text NOT NULL,
	`revoked_at` integer,
	`revoked_by_member_id` text,
	`revoke_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`granted_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "grants_revoke_reason_length" CHECK("grants"."revoke_reason" IS NULL OR length("grants"."revoke_reason") BETWEEN 3 AND 300),
	CONSTRAINT "grants_no_self_sign_off" CHECK("grants"."granted_by_member_id" <> "grants"."member_id"),
	CONSTRAINT "grants_revoked_by_consistent" CHECK(("grants"."revoked_at" IS NULL) = ("grants"."revoked_by_member_id" IS NULL)),
	CONSTRAINT "grants_revoke_reason_consistent" CHECK(("grants"."revoked_at" IS NULL) = ("grants"."revoke_reason" IS NULL)),
	CONSTRAINT "grants_expiry_after_grant" CHECK("grants"."expires_at" IS NULL OR "grants"."expires_at" > "grants"."granted_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_client_request_id_unique` ON `grants` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `grants_member_cert` ON `grants` (`member_id`,`certification_id`);