import { pgTable, uuid, text, integer, timestamp, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, campuses, platformUsers } from './core';
import { academicPrograms } from './academic';

const auditDates = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const admissionCycles = pgTable('admission_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('draft'),
  applicationSequence: integer('application_sequence').notNull().default(0),
  ...auditDates,
}, table => ({
  uniqueCycleCode: uniqueIndex('admission_cycles_institution_code_uidx').on(table.institutionId, table.code),
  tenantKey: uniqueIndex('admission_cycles_id_institution_uidx').on(table.id, table.institutionId),
  validStatus: check('admission_cycles_status_check', sql`${table.status} IN ('draft','open','closed','archived')`),
  validDates: check('admission_cycles_dates_check', sql`${table.endDate} > ${table.startDate}`),
  sequenceValid: check('admission_cycles_application_sequence_check', sql`${table.applicationSequence} >= 0`),
}));

export const applicantProfiles = pgTable('applicant_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  curp: text('curp'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  verificationTokenHash: text('verification_token_hash'),
  verificationExpiresAt: timestamp('verification_expires_at', { withTimezone: true }),
  mailboxVerifiedAt: timestamp('mailbox_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash').notNull(),
  ...auditDates,
},table=>({canonicalEmail:uniqueIndex('applicant_profiles_canonical_email_uidx').on(sql`lower(btrim(${table.email}))`)}));

export const applicantSessions = pgTable('applicant_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicantId: uuid('applicant_id').notNull().references(() => applicantProfiles.id, {onDelete:'restrict'}),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(),
  revokedAt: timestamp('revoked_at', {withTimezone:true}),
}, table=>({
  tokenValid:check('applicant_sessions_token_hash_check',sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  expiryValid:check('applicant_session_expiry',sql`${table.expiresAt}>${table.createdAt} AND ${table.expiresAt}<=${table.createdAt}+interval '8 hours'`),
}));

/** Encrypted delivery queue, not another applicant identity. */
export const applicantVerificationOutbox = pgTable('applicant_verification_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicantId: uuid('applicant_id').notNull().references(() => applicantProfiles.id, {onDelete:'restrict'}),
  tokenHash: text('token_hash').notNull(),
  payloadEncrypted: text('payload_encrypted').notNull(),
  senderEmail: text('sender_email'), replyToEmail: text('reply_to_email'),
  state: text('state').$type<'queued'|'accepted'|'failed'|'cancelled'>().notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', {withTimezone:true}).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', {withTimezone:true}), leaseToken: uuid('lease_token'),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(),
  providerMessageId: text('provider_message_id'), failureCode: text('failure_code'),
  ...auditDates,
},table=>({
  tokenValid:check('applicant_verification_outbox_token_hash_check',sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  payloadValid:check('applicant_verification_outbox_payload_encrypted_check',sql`length(${table.payloadEncrypted}) BETWEEN 1 AND 701000`),
  stateValid:check('applicant_verification_outbox_state_check',sql`${table.state} IN ('queued','accepted','failed','cancelled')`),
  attemptsValid:check('applicant_verification_outbox_attempts_check',sql`${table.attempts} BETWEEN 0 AND 8`),
  leaseValid:check('applicant_delivery_lease',sql`(${table.leaseUntil} IS NULL)=(${table.leaseToken} IS NULL)`),
  senderValid:check('applicant_delivery_sender',sql`(${table.senderEmail} IS NULL)=(${table.replyToEmail} IS NULL)`),
  acceptedValid:check('applicant_delivery_acceptance',sql`(${table.state}='accepted')=(${table.providerMessageId} IS NOT NULL)`),
  expiryValid:check('applicant_delivery_expiry',sql`${table.expiresAt}>${table.createdAt} AND ${table.expiresAt}<=${table.createdAt}+interval '30 minutes'`),
}));

export const admissionApplications = pgTable('admission_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  cycleId: uuid('cycle_id').notNull(),
  applicantId: uuid('applicant_id').notNull().references(() => applicantProfiles.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').notNull(),
  campusId: uuid('campus_id'),
  applicationNumber: text('application_number').notNull(),
  status: text('status').notNull().default('draft'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  notes: text('notes'),
  ...auditDates,
}, table => ({
  uniqueApplicationNumber: uniqueIndex('admission_applications_number_uidx').on(table.institutionId, table.applicationNumber),
  tenantKey: uniqueIndex('admission_applications_id_institution_uidx').on(table.id, table.institutionId),
  scopedCycle: foreignKey({ columns: [table.cycleId, table.institutionId], foreignColumns: [admissionCycles.id, admissionCycles.institutionId], name: 'applications_cycle_tenant_fk' }),
  scopedProgram: foreignKey({ columns: [table.programId, table.institutionId], foreignColumns: [academicPrograms.id, academicPrograms.institutionId], name: 'applications_program_tenant_fk' }),
  scopedCampus: foreignKey({ columns: [table.campusId, table.institutionId], foreignColumns: [campuses.id, campuses.institutionId], name: 'applications_campus_tenant_fk' }),
  validStatus: check('admission_applications_status_check', sql`${table.status} IN ('draft','submitted','under_review','admitted','rejected','waitlisted','cancelled')`),
}));

export const admissionDocuments = pgTable('admission_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').notNull().references(() => admissionApplications.id, { onDelete: 'cascade' }),
  documentType: text('document_type').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  verificationStatus: text('verification_status').notNull().default('pending'),
  notes: text('notes'),
  ...auditDates,
}, table => ({
  validDocType: check('admission_documents_type_check', sql`${table.documentType} IN ('identity_proof','birth_certificate','prior_degree','curp_doc','other')`),
  validStatus: check('admission_documents_status_check', sql`${table.verificationStatus} IN ('pending','approved','rejected')`),
}));

export const admissionDecisions = pgTable('admission_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').notNull().references(() => admissionApplications.id, { onDelete: 'restrict' }),
  decidedBy: uuid('decided_by').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  decision: text('decision').notNull(),
  reason: text('reason').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  ...auditDates,
}, table => ({
  validDecision: check('admission_decisions_decision_check', sql`${table.decision} IN ('admitted','rejected','waitlisted')`),
}));
