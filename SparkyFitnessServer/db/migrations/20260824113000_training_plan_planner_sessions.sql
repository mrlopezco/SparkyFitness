-- Planner conversations (generate / change plan) and confirmed change history.

CREATE TABLE IF NOT EXISTS public.training_plan_planner_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('generate', 'adjust')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'confirmed', 'cancelled')),
    summary TEXT,
    adjust_from DATE,
    adjust_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_plan_planner_sessions_plan_id
    ON public.training_plan_planner_sessions(plan_id, confirmed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_training_plan_planner_sessions_user_id
    ON public.training_plan_planner_sessions(user_id);

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.training_plan_planner_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.training_plan_planner_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL
        REFERENCES public.training_plan_planner_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_plan_planner_messages_session_id
    ON public.training_plan_planner_messages(session_id, created_at);
