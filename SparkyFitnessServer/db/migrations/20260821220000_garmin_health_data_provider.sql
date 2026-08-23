-- Fork: Garmin Health Data (GHD) provider catalog + sync/history metadata.
-- Deep warehouse stays in the GHD sidecar SQLite; these tables track Sparky
-- projection provenance and gap-fill jobs. RLS via create_owner_policy (Tier 1).
-- Permissions granted via grantPermissions.ts.

INSERT INTO public.external_provider_types (id, display_name)
VALUES ('garmin_health_data', 'Garmin Health Data')
ON CONFLICT (id) DO NOTHING;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['email', 'password'],
    is_strictly_private = TRUE,
    field_labels = '{"email":"Garmin email","password":"Garmin password"}'::jsonb
WHERE id = 'garmin_health_data';

-- Per-sync run audit (keep-alive or manual range).
CREATE TABLE IF NOT EXISTS public.ghd_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES public.external_data_providers(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    start_date DATE,
    end_date DATE,
    error_summary TEXT,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ghd_sync_runs_user_id
    ON public.ghd_sync_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_ghd_sync_runs_user_started
    ON public.ghd_sync_runs(user_id, started_at DESC);

-- Maps Garmin activity ids to projected exercise_entries for dedupe/re-project.
CREATE TABLE IF NOT EXISTS public.ghd_activity_map (
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    garmin_activity_id TEXT NOT NULL,
    exercise_entry_id UUID REFERENCES public.exercise_entries(id) ON DELETE SET NULL,
    last_projected_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, garmin_activity_id)
);

CREATE INDEX IF NOT EXISTS idx_ghd_activity_map_exercise_entry_id
    ON public.ghd_activity_map(exercise_entry_id)
    WHERE exercise_entry_id IS NOT NULL;

-- One-shot history gap-fill job (cron advances 7-day chunks).
CREATE TABLE IF NOT EXISTS public.ghd_history_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES public.external_data_providers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'running', 'paused', 'completed', 'failed', 'cancelled'
        )),
    range_start DATE NOT NULL,
    range_end DATE NOT NULL,
    cursor_day DATE NOT NULL,
    weeks_total INTEGER NOT NULL DEFAULT 0,
    weeks_completed INTEGER NOT NULL DEFAULT 0,
    weeks_empty INTEGER NOT NULL DEFAULT 0,
    weeks_failed INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghd_history_import_jobs_user_id
    ON public.ghd_history_import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ghd_history_import_jobs_user_status
    ON public.ghd_history_import_jobs(user_id, status);

-- At most one non-terminal history job per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ghd_history_import_jobs_one_active
    ON public.ghd_history_import_jobs(user_id)
    WHERE status IN ('pending', 'running', 'paused');

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.ghd_history_import_jobs
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- Per-week coverage rows for a history import job.
CREATE TABLE IF NOT EXISTS public.ghd_history_import_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL
        REFERENCES public.ghd_history_import_jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'complete', 'empty', 'failed')),
    extract_ok BOOLEAN,
    project_ok BOOLEAN,
    error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ghd_history_import_weeks_user_id
    ON public.ghd_history_import_weeks(user_id);
CREATE INDEX IF NOT EXISTS idx_ghd_history_import_weeks_job_id
    ON public.ghd_history_import_weeks(job_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.ghd_history_import_weeks
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
