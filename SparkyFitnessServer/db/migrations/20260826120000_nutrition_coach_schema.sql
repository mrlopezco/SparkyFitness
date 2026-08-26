-- Fork: Nutrition coach (Training tab) — sessions, memories, context snapshots.

CREATE TABLE IF NOT EXISTS public.nutrition_coach_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.training_plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    title TEXT,
    metrics_at_close JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nutrition_coach_sessions_user_id
    ON public.nutrition_coach_sessions(user_id, created_at DESC);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.nutrition_coach_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.nutrition_coach_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.nutrition_coach_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    parts JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_coach_messages_session_id
    ON public.nutrition_coach_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS public.nutrition_coach_session_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE
        REFERENCES public.nutrition_coach_sessions(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    token_estimate INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.nutrition_coach_session_summaries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.nutrition_coach_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_coach_memories_user_id
    ON public.nutrition_coach_memories(user_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.nutrition_coach_memories
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.nutrition_coach_context_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.training_plans(id) ON DELETE SET NULL,
    as_of_date DATE NOT NULL,
    payload JSONB NOT NULL,
    token_estimate INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_coach_context_snapshots_user_date
    ON public.nutrition_coach_context_snapshots(user_id, as_of_date DESC);
