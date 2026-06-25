ALTER TABLE "folders" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "folders_workspace_id_idx" ON "folders" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "proposals_workspace_active_idx" ON "proposals" USING btree ("workspace_id") WHERE "proposals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "themes_workspace_id_idx" ON "themes" USING btree ("workspace_id");