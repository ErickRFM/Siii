-- Consolidation: academic objects are private and usable only through the server.
ALTER TABLE public.institutional_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_students FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutional_students FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.institutional_students TO siii_app;
CREATE POLICY academic_backend_access ON public.institutional_students FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.institutional_students AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.institutional_students AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.institutional_students OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.institutional_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_teachers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutional_teachers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.institutional_teachers TO siii_app;
CREATE POLICY academic_backend_access ON public.institutional_teachers FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.institutional_teachers AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.institutional_teachers AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.institutional_teachers OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.academic_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academic_sections FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.academic_sections TO siii_app;
CREATE POLICY academic_backend_access ON public.academic_sections FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.academic_sections AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.academic_sections AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.academic_sections OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.section_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.section_enrollments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.section_enrollments TO siii_app;
CREATE POLICY academic_backend_access ON public.section_enrollments FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.section_enrollments AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.section_enrollments AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.section_enrollments OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.section_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_teachers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.section_teachers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.section_teachers TO siii_app;
CREATE POLICY academic_backend_access ON public.section_teachers FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.section_teachers AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.section_teachers AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.section_teachers OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.teacher_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_account_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_account_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.teacher_account_links TO siii_app;
CREATE POLICY academic_backend_access ON public.teacher_account_links FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.teacher_account_links AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.teacher_account_links AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.teacher_account_links OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.assessment_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_components FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessment_components FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.assessment_components TO siii_app;
CREATE POLICY academic_backend_access ON public.assessment_components FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.assessment_components AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.assessment_components AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.assessment_components OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_scores FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessment_scores FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.assessment_scores TO siii_app;
CREATE POLICY academic_backend_access ON public.assessment_scores FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.assessment_scores AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.assessment_scores AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.assessment_scores OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.grade_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_publications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.grade_publications FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.grade_publications TO siii_app;
CREATE POLICY academic_backend_access ON public.grade_publications FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.grade_publications AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.grade_publications AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.grade_publications OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_grades FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_grades FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.final_grades TO siii_app;
CREATE POLICY academic_backend_access ON public.final_grades FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.final_grades AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.final_grades AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.final_grades OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.classrooms FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.classrooms TO siii_app;
CREATE POLICY academic_backend_access ON public.classrooms FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.classrooms AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.classrooms AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.classrooms OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.schedule_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_patterns FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_patterns FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.schedule_patterns TO siii_app;
CREATE POLICY academic_backend_access ON public.schedule_patterns FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.schedule_patterns AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.schedule_patterns AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.schedule_patterns OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.class_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_occurrences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_occurrences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.class_occurrences TO siii_app;
CREATE POLICY academic_backend_access ON public.class_occurrences FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.class_occurrences AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.class_occurrences AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.class_occurrences OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.institutional_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_announcements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutional_announcements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.institutional_announcements TO siii_app;
CREATE POLICY academic_backend_access ON public.institutional_announcements FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.institutional_announcements AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.institutional_announcements AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.institutional_announcements OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.student_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_service_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_service_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.student_service_requests TO siii_app;
CREATE POLICY academic_backend_access ON public.student_service_requests FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.student_service_requests AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.student_service_requests AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.student_service_requests OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.tutoring_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutoring_cases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutoring_cases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.tutoring_cases TO siii_app;
CREATE POLICY academic_backend_access ON public.tutoring_cases FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.tutoring_cases AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.tutoring_cases AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.tutoring_cases OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.institutional_workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_workshops FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutional_workshops FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.institutional_workshops TO siii_app;
CREATE POLICY academic_backend_access ON public.institutional_workshops FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.institutional_workshops AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.institutional_workshops AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.institutional_workshops OWNER TO siii_migrator;
--> statement-breakpoint
ALTER TABLE public.workshop_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workshop_enrollments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.workshop_enrollments TO siii_app;
CREATE POLICY academic_backend_access ON public.workshop_enrollments FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_deny_anon ON public.workshop_enrollments AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_deny_authenticated ON public.workshop_enrollments AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.workshop_enrollments OWNER TO siii_migrator;
--> statement-breakpoint
