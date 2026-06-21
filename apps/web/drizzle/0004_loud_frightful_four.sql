ALTER TABLE "templates" ALTER COLUMN "template" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "deprecated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;