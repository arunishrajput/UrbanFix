-- Daily roll-up used by the analytics dashboard. Refreshed concurrently by the
-- worker every 15 minutes (see jobs/maintenance.ts); live KPIs query `issues` directly.
CREATE MATERIALIZED VIEW daily_issue_stats AS
WITH created AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
         coalesce(ward_id, '00000000-0000-0000-0000-000000000000'::uuid) AS ward_key,
         category_id,
         count(*)::int AS created
  FROM issues
  WHERE merged_into_id IS NULL
  GROUP BY 1, 2, 3
), resolved AS (
  SELECT (resolved_at AT TIME ZONE 'UTC')::date AS day,
         coalesce(ward_id, '00000000-0000-0000-0000-000000000000'::uuid) AS ward_key,
         category_id,
         count(*)::int AS resolved,
         count(*) FILTER (WHERE sla_due_at IS NULL OR resolved_at <= sla_due_at)::int AS resolved_within_sla,
         sum(extract(epoch FROM resolved_at - created_at) / 3600.0) AS resolution_hours_sum
  FROM issues
  WHERE resolved_at IS NOT NULL AND merged_into_id IS NULL
  GROUP BY 1, 2, 3
)
SELECT coalesce(c.day, r.day) AS day,
       coalesce(c.ward_key, r.ward_key) AS ward_key,
       coalesce(c.category_id, r.category_id) AS category_id,
       coalesce(c.created, 0) AS created,
       coalesce(r.resolved, 0) AS resolved,
       coalesce(r.resolved_within_sla, 0) AS resolved_within_sla,
       coalesce(r.resolution_hours_sum, 0) AS resolution_hours_sum
FROM created c
FULL OUTER JOIN resolved r
  ON c.day = r.day AND c.ward_key = r.ward_key AND c.category_id = r.category_id;
--> statement-breakpoint
CREATE UNIQUE INDEX daily_issue_stats_uq ON daily_issue_stats (day, ward_key, category_id);
