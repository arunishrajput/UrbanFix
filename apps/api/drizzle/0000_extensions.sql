-- Extensions required by the schema. Kept in their own migration so they exist
-- before any table that uses geography, citext or trigram indexes.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
