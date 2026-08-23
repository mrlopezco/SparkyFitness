-- Training Plan domain (fork): date-based plans, goals, commitments, sessions,
-- adherence completions, athlete snapshots, and coach memory tables (coach chat in phase 2).
-- RLS is applied in db/rls_policies.sql. Permissions granted via grantPermissions.ts.

CREATE TABLE IF NOT EXISTS public.training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sport_focus TEXT NOT NULL DEFAULT 'running',
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_plans_user_id ON public.training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_user_status ON public.training_plans(user_id, status);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_plans
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    goal_type TEXT NOT NULL
        CHECK (goal_type IN ('race', 'body_weight', 'volume', 'habit', 'custom')),
    title TEXT NOT NULL,
    target_date DATE,
    race_distance_meters NUMERIC,
    race_target_seconds NUMERIC,
    weight_target_kg NUMERIC,
    weight_delta_kg NUMERIC,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_goals_plan_id ON public.training_goals(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_goals_user_id ON public.training_goals(user_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_goals
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    intensity TEXT NOT NULL DEFAULT 'moderate'
        CHECK (intensity IN ('low', 'moderate', 'high')),
    commitment_date DATE,
    recurrence_rule TEXT,
    start_time TEXT,
    duration_minutes INTEGER,
    blocks_training BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_commitments_date_or_rrule CHECK (
        commitment_date IS NOT NULL OR recurrence_rule IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_training_commitments_plan_id ON public.training_commitments(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_commitments_user_id ON public.training_commitments(user_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_commitments
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_plan_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    session_type TEXT NOT NULL
        CHECK (session_type IN (
            'easy_run', 'intervals', 'tempo', 'long_run', 'rest',
            'strength', 'cross_train', 'race', 'other'
        )),
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'completed', 'skipped', 'moved', 'partial')),
    prescription JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_plan_sessions_plan_date
    ON public.training_plan_sessions(plan_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_training_plan_sessions_user_date
    ON public.training_plan_sessions(user_id, scheduled_date);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_plan_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_session_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_session_id UUID NOT NULL UNIQUE
        REFERENCES public.training_plan_sessions(id) ON DELETE CASCADE,
    exercise_entry_id UUID REFERENCES public.exercise_entries(id) ON DELETE SET NULL,
    adherence_score NUMERIC CHECK (adherence_score IS NULL OR (adherence_score >= 0 AND adherence_score <= 1)),
    matched_by TEXT CHECK (matched_by IS NULL OR matched_by IN ('auto', 'manual', 'ai')),
    notes TEXT,
    ai_review TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_session_completions_entry
    ON public.training_session_completions(exercise_entry_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_session_completions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_athlete_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.training_plans(id) ON DELETE SET NULL,
    as_of_date DATE NOT NULL,
    payload JSONB NOT NULL,
    token_estimate INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_athlete_snapshots_user_date
    ON public.training_athlete_snapshots(user_id, as_of_date DESC);

CREATE TABLE IF NOT EXISTS public.training_coach_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_coach_sessions_plan_id
    ON public.training_coach_sessions(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_coach_sessions_user_id
    ON public.training_coach_sessions(user_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_coach_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_coach_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.training_coach_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    parts JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_coach_messages_session_id
    ON public.training_coach_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS public.training_coach_session_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE
        REFERENCES public.training_coach_sessions(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    token_estimate INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_coach_session_summaries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_coach_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_coach_memories_user_id
    ON public.training_coach_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_training_coach_memories_plan_id
    ON public.training_coach_memories(plan_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_coach_memories
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
