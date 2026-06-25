CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"workspace_id" text,
	"created_by" text NOT NULL,
	"allow_export" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "share_links_proposal_id_idx" ON "share_links" USING btree ("proposal_id");