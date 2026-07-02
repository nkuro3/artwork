-- ADR D12: status one source (draft/published/archived) + portfolio_item join.
-- `ADD VALUE 'archived'` is the PG15/Neon form. The new value is not USED in this
-- migration (no rows reference it here), so it is safe outside a txn block.
ALTER TYPE "public"."artwork_status" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "portfolio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artwork_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_item_artwork_id_unique" UNIQUE("artwork_id")
);
--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_artwork_id_artwork_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artwork"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_item_user_id_idx" ON "portfolio_item" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portfolio_item_artwork_id_idx" ON "portfolio_item" USING btree ("artwork_id");--> statement-breakpoint
ALTER TABLE "artwork" DROP COLUMN "is_draft";--> statement-breakpoint
ALTER TABLE "artwork" DROP COLUMN "is_public";