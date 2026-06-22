CREATE TYPE "public"."artwork_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "artist_profile_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "artwork" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artist_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "artwork_status" DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artwork_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artwork_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profile" ADD CONSTRAINT "artist_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork" ADD CONSTRAINT "artwork_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork" ADD CONSTRAINT "artwork_artist_profile_id_artist_profile_id_fk" FOREIGN KEY ("artist_profile_id") REFERENCES "public"."artist_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_image" ADD CONSTRAINT "artwork_image_artwork_id_artwork_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artwork"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_image" ADD CONSTRAINT "artwork_image_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_user_id_idx" ON "artwork" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artwork_artist_profile_id_idx" ON "artwork" USING btree ("artist_profile_id");--> statement-breakpoint
CREATE INDEX "artwork_image_artwork_id_idx" ON "artwork_image" USING btree ("artwork_id");--> statement-breakpoint
CREATE INDEX "artwork_image_user_id_idx" ON "artwork_image" USING btree ("user_id");--> statement-breakpoint
-- =============================================================================
-- MANUAL ADDITIONS (not emitted by drizzle-kit)
-- pg_trgm + GIN trigram indexes for cross-entity search (FR-17 / NFR-05).
-- These cover partial-match search over artwork titles/descriptions and
-- artist display names, including Japanese substrings. Keep these in sync
-- with packages/database/CLAUDE.md (手書き追記).
-- RLS is intentionally NOT added (prototype uses app-layer authz, ADR D8/SEC-02).
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artwork_title_trgm_idx" ON "artwork" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artwork_description_trgm_idx" ON "artwork" USING gin ("description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_profile_display_name_trgm_idx" ON "artist_profile" USING gin ("display_name" gin_trgm_ops);