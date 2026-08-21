-- Phase 2/3 Training Plan: skip reasons, fitness tests (periodic fitness snapshots).
-- RLS applied in db/rls_policies.sql.

ALTER TABLE public.training_plan_sessions
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

ALTER TABLE public.training_session_completions
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

CREATE TABLE IF NOT EXISTS public.training_fitness_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    test_type TEXT NOT NULL
        CHECK (test_type IN (
            '5k_time_trial',
            '10k_time_trial',
            'cooper_12min',
            'mile_effort',
            'easy_aerobic_check',
            'custom'
        )),
    title TEXT NOT NULL,
    scheduled_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'skipped', 'cancelled')),
    prescription JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    source TEXT NOT NULL DEFAULT 'coach'
        CHECK (source IN ('coach', 'system', 'user')),
    due_interval_days INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_fitness_tests_user_date
    ON public.training_fitness_tests(user_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_fitness_tests_plan_id
    ON public.training_fitness_tests(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_fitness_tests_status
    ON public.training_fitness_tests(user_id, status);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_fitness_tests
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
