-- Fork feature: per-user module visibility toggles (nav/route gating).
-- Sparse JSONB map of module_id -> enabled. Missing keys use app defaults
-- (see shared/src/constants/forkModules.ts).
CREATE TABLE IF NOT EXISTS public.user_module_preferences (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    modules jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_module_preferences_modules_is_object CHECK (jsonb_typeof(modules) = 'object')
);
