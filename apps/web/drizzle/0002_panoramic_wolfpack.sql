CREATE TABLE "section_types" (
	"type" text PRIMARY KEY NOT NULL,
	"definition" jsonb,
	"deprecated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;