-- Athlete self-reported execution score for planned sessions (0–10).
-- Separate from adherence_score (0–1) used by Garmin auto-matching.

ALTER TABLE public.training_session_completions
    ADD COLUMN IF NOT EXISTS athlete_execution_score INTEGER
        CHECK (
            athlete_execution_score IS NULL
            OR (athlete_execution_score >= 0 AND athlete_execution_score <= 10)
        );
