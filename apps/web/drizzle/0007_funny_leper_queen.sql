CREATE TABLE "section_layouts" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"variant" text NOT NULL,
	"page_format" text NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
