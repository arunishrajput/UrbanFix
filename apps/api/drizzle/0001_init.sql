CREATE TYPE "public"."analysis_status" AS ENUM('PENDING', 'DONE', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."issue_event_type" AS ENUM('CREATED', 'REPORT_JOINED', 'STATUS_CHANGED', 'ASSIGNED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'NOTE_ADDED', 'WORK_PHOTOS_ADDED', 'VERIFICATION_REQUESTED', 'VERIFICATION_RESPONSE', 'REOPENED', 'VERIFIED', 'MERGED', 'MODERATED');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('PENDING', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'REOPENED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ISSUE_SUBMITTED', 'ISSUE_NEW_IN_WARD', 'ISSUE_ASSIGNED', 'ISSUE_STATUS_CHANGED', 'ISSUE_RESOLVED', 'ISSUE_REOPENED', 'ISSUE_VERIFIED', 'VERIFICATION_REQUEST', 'REPORT_JOINED', 'BADGE_EARNED', 'SLA_OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('REPORT', 'WORK_COMPLETION', 'VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('DRAFT', 'ATTACHED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."report_source" AS ENUM('NEW', 'JOINED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CITIZEN', 'STAFF', 'OFFICIAL', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."verification_outcome" AS ENUM('PENDING', 'VERIFIED', 'REOPENED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."verification_response" AS ENUM('RESOLVED', 'NOT_FIXED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(60) NOT NULL,
	"icon" varchar(40) NOT NULL,
	"color" varchar(7) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"sla_hours" integer DEFAULT 72 NOT NULL,
	"duplicate_radius_m" integer DEFAULT 50 NOT NULL,
	"related_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "issue_event_type" NOT NULL,
	"from_status" "issue_status",
	"to_status" "issue_status",
	"body" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_supporters" (
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_reporter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_supporters_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref_no" serial NOT NULL,
	"category_id" uuid NOT NULL,
	"ward_id" uuid,
	"status" "issue_status" DEFAULT 'PENDING' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"priority_locked" boolean DEFAULT false NOT NULL,
	"severity" smallint,
	"title" varchar(120) NOT NULL,
	"description" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"location" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
	"address" text,
	"address_components" jsonb,
	"support_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"reporter_count" integer DEFAULT 0 NOT NULL,
	"assignee_id" uuid,
	"created_by_id" uuid,
	"cover_photo_id" uuid,
	"merged_into_id" uuid,
	"reopened_count" integer DEFAULT 0 NOT NULL,
	"sla_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', 'UF-' || lpad(ref_no::text, 6, '0')), 'A') ||
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(address, '')), 'C')) STORED,
	CONSTRAINT "issues_refNo_unique" UNIQUE("ref_no")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"issue_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"issue_id" uuid,
	"report_id" uuid,
	"kind" "photo_kind" DEFAULT 'REPORT' NOT NULL,
	"status" "photo_status" DEFAULT 'DRAFT' NOT NULL,
	"variants" jsonb NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"thumbhash" text,
	"sha256" varchar(64) NOT NULL,
	"phash" varchar(16),
	"embedding" real[],
	"exif_lat" double precision,
	"exif_lng" double precision,
	"analysis_status" "analysis_status" DEFAULT 'PENDING' NOT NULL,
	"analysis" jsonb,
	"moderation_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(200) NOT NULL,
	"auth" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"ip" varchar(64),
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"source" "report_source" DEFAULT 'NEW' NOT NULL,
	"description" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"location" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
	"accuracy_m" real,
	"address" text,
	"ai" jsonb,
	"moderation_status" "moderation_status" DEFAULT 'PENDING' NOT NULL,
	"duplicate_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(40) NOT NULL,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_code" varchar(40) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_code_pk" PRIMARY KEY("user_id","badge_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext",
	"password_hash" text,
	"name" varchar(80) NOT NULL,
	"phone" varchar(20),
	"avatar_url" text,
	"role" "user_role" DEFAULT 'CITIZEN' NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"ward_id" uuid,
	"reputation" integer DEFAULT 0 NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"notification_prefs" jsonb DEFAULT '{"push":true,"statusUpdates":true,"verificationRequests":true}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "verification_response" NOT NULL,
	"comment" text,
	"photo_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"round_no" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"outcome" "verification_outcome" DEFAULT 'PENDING' NOT NULL,
	"eligible_count" integer NOT NULL,
	"opened_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(80) NOT NULL,
	"boundary" geometry(MultiPolygon,4326),
	"center_lat" double precision,
	"center_lng" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_supporters" ADD CONSTRAINT "issue_supporters_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_supporters" ADD CONSTRAINT "issue_supporters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_ward_id_wards_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ward_id_wards_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_responses" ADD CONSTRAINT "verification_responses_round_id_verification_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."verification_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_responses" ADD CONSTRAINT "verification_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_rounds" ADD CONSTRAINT "verification_rounds_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_rounds" ADD CONSTRAINT "verification_rounds_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "issue_events_issue_idx" ON "issue_events" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_supporters_user_idx" ON "issue_supporters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issues_location_gix" ON "issues" USING gist ("location");--> statement-breakpoint
CREATE INDEX "issues_status_category_idx" ON "issues" USING btree ("status","category_id");--> statement-breakpoint
CREATE INDEX "issues_ward_idx" ON "issues" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "issues_assignee_idx" ON "issues" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "issues_created_idx" ON "issues" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "issues_search_idx" ON "issues" USING gin ("search");--> statement-breakpoint
CREATE INDEX "issues_title_trgm_idx" ON "issues" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "photos_issue_idx" ON "photos" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "photos_report_idx" ON "photos" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "photos_uploader_idx" ON "photos" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "photos_sha_idx" ON "photos" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "photos_status_created_idx" ON "photos" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_issue_reporter_uq" ON "reports" USING btree ("issue_id","reporter_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_moderation_idx" ON "reports" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "reports_location_gix" ON "reports" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_events_once_uq" ON "reputation_events" USING btree ("user_id","reason","ref_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_ward_idx" ON "users" USING btree ("ward_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_responses_round_user_uq" ON "verification_responses" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_rounds_issue_round_uq" ON "verification_rounds" USING btree ("issue_id","round_no");--> statement-breakpoint
CREATE INDEX "verification_rounds_pending_idx" ON "verification_rounds" USING btree ("closes_at") WHERE outcome = 'PENDING';--> statement-breakpoint
CREATE INDEX "wards_boundary_gix" ON "wards" USING gist ("boundary");