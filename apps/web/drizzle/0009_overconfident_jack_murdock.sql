DROP INDEX "proposals_owner_id_idx";--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "proposals_owner_active_idx" ON "proposals" USING btree ("owner_id") WHERE "proposals"."deleted_at" is null;