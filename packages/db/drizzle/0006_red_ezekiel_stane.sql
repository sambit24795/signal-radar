CREATE TABLE "page_summary" (
	"url" text PRIMARY KEY NOT NULL,
	"tldr" text,
	"points" jsonb,
	"status" text NOT NULL,
	"model" text NOT NULL,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_summary" ADD CONSTRAINT "page_summary_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_summary_requested_by_created_idx" ON "page_summary" USING btree ("requested_by","created_at");