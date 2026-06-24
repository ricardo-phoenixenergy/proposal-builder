CREATE INDEX "folders_owner_id_idx" ON "folders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "proposal_versions_proposal_id_idx" ON "proposal_versions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "proposals_owner_id_idx" ON "proposals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "proposals_folder_id_idx" ON "proposals" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "themes_owner_id_idx" ON "themes" USING btree ("owner_id");