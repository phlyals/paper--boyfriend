ALTER TABLE "user" ADD COLUMN "last_login_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "recall_sent_at" timestamp;