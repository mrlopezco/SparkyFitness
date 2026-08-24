-- Vacation date ranges and commitment kind for travel / holiday planning.

ALTER TABLE public.training_commitments
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.training_commitments
    DROP CONSTRAINT IF EXISTS training_commitments_date_or_rrule;

ALTER TABLE public.training_commitments
    ADD CONSTRAINT training_commitments_schedule CHECK (
        (
            kind = 'vacation'
            AND commitment_date IS NOT NULL
            AND end_date IS NOT NULL
            AND end_date >= commitment_date
        )
        OR (
            kind = 'standard'
            AND end_date IS NULL
            AND (commitment_date IS NOT NULL OR recurrence_rule IS NOT NULL)
        )
    );

UPDATE public.training_commitments
SET kind = 'standard'
WHERE kind IS NULL OR trim(kind) = '';
