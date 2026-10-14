-- R4: tenant-scoped classrooms, weekly patterns and persisted dated occurrences.
-- Do not apply directly to production until Drizzle/Supabase histories are reconciled.
CREATE UNIQUE INDEX campuses_id_institution_uidx ON campuses(id,institution_id);--> statement-breakpoint
CREATE TABLE classrooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 campus_id uuid NOT NULL,
 code text NOT NULL,
 building text NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 5000),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT classrooms_campus_scope_fk FOREIGN KEY(campus_id,institution_id) REFERENCES campuses(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX classrooms_unique_code_idx ON classrooms(campus_id,code);--> statement-breakpoint
CREATE UNIQUE INDEX classrooms_id_institution_idx ON classrooms(id,institution_id);--> statement-breakpoint
CREATE TABLE schedule_patterns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 section_id uuid NOT NULL,
 room_id uuid NOT NULL,
 weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_minute integer NOT NULL,
 end_minute integer NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT schedule_section_scope_fk FOREIGN KEY(section_id,institution_id) REFERENCES academic_sections(id,institution_id),
 CONSTRAINT schedule_room_scope_fk FOREIGN KEY(room_id,institution_id) REFERENCES classrooms(id,institution_id),
 CONSTRAINT schedule_minutes_check CHECK(start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)
);--> statement-breakpoint
CREATE UNIQUE INDEX schedule_pattern_scope_uidx ON schedule_patterns(id,section_id,institution_id);--> statement-breakpoint
CREATE INDEX schedule_room_day_idx ON schedule_patterns(institution_id,room_id,weekday);--> statement-breakpoint
CREATE TABLE class_occurrences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 pattern_id uuid NOT NULL,
 section_id uuid NOT NULL,
 on_date date NOT NULL,
 state text NOT NULL DEFAULT 'SCHEDULED' CHECK(state IN ('SCHEDULED','CANCELLED','ONLINE')),
 reason text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT occurrence_pattern_scope_fk FOREIGN KEY(pattern_id,section_id,institution_id) REFERENCES schedule_patterns(id,section_id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX occurrence_pattern_date_uidx ON class_occurrences(pattern_id,on_date);--> statement-breakpoint
CREATE INDEX occurrence_institution_date_idx ON class_occurrences(institution_id,on_date);--> statement-breakpoint
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   REVOKE ALL ON classrooms,schedule_patterns,class_occurrences FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   REVOKE ALL ON classrooms,schedule_patterns,class_occurrences FROM authenticated;
 END IF;
END $$;
