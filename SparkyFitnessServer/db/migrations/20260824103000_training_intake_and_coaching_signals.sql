-- Training plan intake (structured athlete setup) and rolling coaching signals from session AI reviews.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS intake_payload JSONB;

CREATE TABLE IF NOT EXISTS public.training_coaching_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.training_plan_sessions(id) ON DELETE SET NULL,
    signal_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_coaching_signals_plan_id
  ON public.training_coaching_signals(plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_coaching_signals_user_id
  ON public.training_coaching_signals(user_id);
