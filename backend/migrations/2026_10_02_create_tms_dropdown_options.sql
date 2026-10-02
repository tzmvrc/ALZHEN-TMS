CREATE TABLE IF NOT EXISTS public.tms_dropdown_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL CHECK (
    field_key IN (
      'trip_status',
      'delivery_status',
      'letter_status',
      'store_call_status',
      'confirmation_status'
    )
  ),
  option_value text NOT NULL CHECK (
    option_value = btrim(option_value)
    AND option_value <> ''
    AND length(option_value) <= 60
    AND option_value ~ '^[A-Z0-9][A-Z0-9 _-]*$'
  ),
  display_label text NOT NULL CHECK (
    display_label = btrim(display_label)
    AND display_label <> ''
    AND length(display_label) <= 80
  ),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (field_key = 'letter_status' AND is_system AND option_value IN ('READY', 'SENT', 'CANCELLED'))
    OR (field_key <> 'letter_status' AND NOT is_system)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tms_dropdown_options_field_value_uq
  ON public.tms_dropdown_options (field_key, lower(option_value));

INSERT INTO public.tms_dropdown_options (field_key, option_value, display_label, sort_order, is_system)
VALUES
  ('trip_status', 'COMPLETED', 'COMPLETED', 0, false),
  ('trip_status', 'IN_PROGRESS', 'IN_PROGRESS', 1, false),
  ('trip_status', 'PLANNED', 'PLANNED', 2, false),
  ('delivery_status', 'COMPLETED', 'COMPLETED', 0, false),
  ('delivery_status', 'IN PROGRESS', 'IN PROGRESS', 1, false),
  ('delivery_status', 'PENDING', 'PENDING', 2, false),
  ('letter_status', 'READY', 'READY', 0, true),
  ('letter_status', 'SENT', 'SENT', 1, true),
  ('letter_status', 'CANCELLED', 'CANCELLED', 2, true),
  ('store_call_status', 'CONTACTED', 'CONTACTED', 0, false),
  ('store_call_status', 'PENDING', 'PENDING', 1, false),
  ('confirmation_status', 'CONFIRMED', 'CONFIRMED', 0, false),
  ('confirmation_status', 'PENDING', 'PENDING', 1, false)
ON CONFLICT (field_key, (lower(option_value))) DO NOTHING;

ALTER TABLE public.tms_dropdown_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tms_dropdown_options FROM anon, authenticated;
GRANT ALL ON TABLE public.tms_dropdown_options TO service_role;