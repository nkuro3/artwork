CREATE TYPE "public"."artwork_public_status" AS ENUM('draft', 'public', 'archived');--> statement-breakpoint
CREATE TYPE "public"."artwork_status" AS ENUM('in_progress', 'available', 'sold');--> statement-breakpoint
CREATE TABLE "artwork" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "artwork_status",
	"medium" text,
	"art_type" text,
	"condition" text,
	"height_mm" integer,
	"width_mm" integer,
	"depth_mm" integer,
	"weight_g" integer,
	"public_status" "artwork_public_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artwork_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artwork_id" uuid,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artwork" ADD CONSTRAINT "artwork_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_image" ADD CONSTRAINT "artwork_image_artwork_id_artwork_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artwork"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_image" ADD CONSTRAINT "artwork_image_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_user_id_idx" ON "artwork" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artwork_image_artwork_id_idx" ON "artwork_image" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "artwork_image_user_id_idx" ON "artwork_image" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artwork_image_unattached_idx" ON "artwork_image" USING btree ("created_at") WHERE "artwork_image"."artwork_id" is null;