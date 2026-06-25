CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "workspace_id" text;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
-- Theme 1 backfill: give every existing user a personal workspace (id = 'ws_'||user.id)
-- they admin, then scope their existing data into it. Idempotent + reversible
-- (owner_id stays authoritative until the 1b cutover).
INSERT INTO "workspaces" ("id", "name")
  SELECT 'ws_' || "id", 'Personal workspace' FROM "users"
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
  SELECT 'ws_' || "id", "id", 'admin' FROM "users"
  ON CONFLICT ("workspace_id", "user_id") DO NOTHING;--> statement-breakpoint
UPDATE "proposals" SET "workspace_id" = 'ws_' || "owner_id" WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "folders" SET "workspace_id" = 'ws_' || "owner_id" WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "themes" SET "workspace_id" = 'ws_' || "owner_id" WHERE "workspace_id" IS NULL;