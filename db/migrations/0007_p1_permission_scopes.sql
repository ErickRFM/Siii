-- Additive enum extension: no new enum value is consumed in this transaction.
ALTER TYPE public.user_role ADD VALUE 'guest';
ALTER TYPE public.user_role ADD VALUE 'control_escolar';
ALTER TYPE public.user_role ADD VALUE 'workshop_facilitator';
--> statement-breakpoint
CREATE UNIQUE INDEX institution_membership_id_institution_uidx ON public.institution_memberships(id,institution_id);
ALTER TABLE public.role_assignments
 ADD COLUMN institution_id uuid,
 ADD COLUMN scope_type text NOT NULL DEFAULT 'institution',
 ADD COLUMN scope_program_id uuid,
 ADD COLUMN scope_campus_id uuid,
 ADD COLUMN expires_at timestamptz;
UPDATE public.role_assignments r SET institution_id=m.institution_id FROM public.institution_memberships m WHERE m.id=r.membership_id;
-- Nullable tenant only preserves old institution-only insertion contracts; a typed scope always requires its tenant.
ALTER TABLE public.role_assignments
 ADD CONSTRAINT role_assignment_scope_check CHECK(
  (scope_type='institution' AND scope_program_id IS NULL AND scope_campus_id IS NULL)
  OR (scope_type='program' AND institution_id IS NOT NULL AND scope_program_id IS NOT NULL AND scope_campus_id IS NULL)
  OR (scope_type='campus' AND institution_id IS NOT NULL AND scope_campus_id IS NOT NULL AND scope_program_id IS NULL)),
 ADD CONSTRAINT role_assignment_admin_scope_check CHECK(role::text NOT IN ('admin','super_admin') OR scope_type='institution'),
 ADD CONSTRAINT role_assignment_membership_tenant_fk FOREIGN KEY(membership_id,institution_id) REFERENCES public.institution_memberships(id,institution_id),
 ADD CONSTRAINT role_assignment_program_tenant_fk FOREIGN KEY(scope_program_id,institution_id) REFERENCES public.academic_programs(id,institution_id),
 ADD CONSTRAINT role_assignment_campus_tenant_fk FOREIGN KEY(scope_campus_id,institution_id) REFERENCES public.campuses(id,institution_id);
DROP INDEX public.role_assignment_unique_active;
CREATE UNIQUE INDEX role_assignment_unique_active ON public.role_assignments(membership_id,role) WHERE revoked_at IS NULL AND scope_type='institution';
CREATE UNIQUE INDEX role_assignment_unique_program ON public.role_assignments(membership_id,role,scope_program_id) WHERE revoked_at IS NULL AND scope_type='program';
CREATE UNIQUE INDEX role_assignment_unique_campus ON public.role_assignments(membership_id,role,scope_campus_id) WHERE revoked_at IS NULL AND scope_type='campus';
