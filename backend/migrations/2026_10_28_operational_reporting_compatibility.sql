-- Departed deliveries awaiting required POD are still ongoing. Preserve legacy flags.
CREATE OR REPLACE VIEW public.v_trip_filter_flags AS
 SELECT id AS trip_id,
    (upper(btrim(COALESCE(status, ''::text))) <> ALL (ARRAY['CANCELLED'::text, 'CANCELED'::text, 'CLOSED'::text, 'ARCHIVED'::text, 'REJECTED'::text])) AND
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM trip_stops s
              WHERE s.trip_id = t.id)) THEN (EXISTS ( SELECT 1
               FROM trip_stops s
              WHERE s.trip_id = t.id AND (s.delivery_status IN ('PLANNED','AT_DISPATCHER','IN_TRANSIT','ARRIVED') OR (s.departure_time IS NULL AND COALESCE(s.delivery_status, ''::text) !~* 'COMPLET|DELIVER|FINISH'::text))))
            ELSE upper(btrim(COALESCE(status, ''::text))) <> ALL (ARRAY['COMPLETED'::text, 'CANCELLED'::text, 'CANCELED'::text, 'CLOSED'::text, 'FINISHED'::text, 'ARCHIVED'::text, 'REJECTED'::text])
        END AS ongoing,
    upper(COALESCE(status, ''::text)) = ANY (ARRAY['IN_PROGRESS'::text, 'IN PROGRESS'::text, 'IN_TRANSIT'::text, 'IN TRANSIT'::text, 'DISPATCHED'::text, 'LOADING'::text, 'UNLOADING'::text, 'ONGOING'::text, 'STARTED'::text, 'DELAYED'::text, 'ON_HOLD'::text]) AS in_progress,
    upper(COALESCE(status, ''::text)) = ANY (ARRAY['COMPLETED'::text, 'DELIVERED'::text, 'DONE'::text, 'CLOSED'::text]) AS completed,
    (EXISTS ( SELECT 1
           FROM offloads r
          WHERE r.trip_id = t.id)) AS offload,
    (EXISTS ( SELECT 1
           FROM backloads r
          WHERE r.trip_id = t.id)) AS backload,
    (EXISTS ( SELECT 1
           FROM demurrages r
          WHERE r.trip_id = t.id)) AS demurrage
   FROM trips t;
