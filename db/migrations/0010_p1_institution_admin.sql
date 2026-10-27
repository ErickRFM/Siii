-- F09 optimistic concurrency for institutional administration. Historical migrations remain immutable.
ALTER TABLE public.institutions ADD COLUMN admin_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.institutions ADD CONSTRAINT institutions_admin_version_check CHECK (admin_version >= 0);
