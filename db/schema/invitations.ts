import {pgTable,uuid,text,timestamp,integer,index,unique,uniqueIndex,check,foreignKey} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {institutions,platformUsers,userRoleEnum,campuses} from './core';
import {academicPrograms} from './academic';
import {institutionMemberships,roleAssignments} from './auth';
export const institutionInvitations=pgTable('institution_invitations',{
 id:uuid('id').primaryKey().defaultRandom(),institutionId:uuid('institution_id').notNull().references(()=>institutions.id,{onDelete:'restrict'}),
 email:text('email').notNull(),role:userRoleEnum('role').notNull(),scopeType:text('scope_type').$type<'institution'|'program'|'campus'>().notNull().default('institution'),
 programId:uuid('scope_program_id'),campusId:uuid('scope_campus_id'),grantExpiresAt:timestamp('grant_expires_at',{withTimezone:true}),
 issuerMembershipId:uuid('issuer_membership_id').notNull(),issuerGrantId:uuid('issuer_grant_id').notNull(),createdBy:uuid('created_by').notNull().references(()=>platformUsers.id,{onDelete:'restrict'}),
 tokenHash:text('token_hash').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),state:text('state').$type<'pending'|'accepted'|'rejected'|'revoked'>().notNull().default('pending'),
 consumedAt:timestamp('consumed_at',{withTimezone:true}),acceptedUserId:uuid('accepted_user_id').references(()=>platformUsers.id,{onDelete:'restrict'}),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
 resendWindowAt:timestamp('resend_window_at',{withTimezone:true}).notNull().defaultNow(),resendCount:integer('resend_count').notNull().default(0),lastRequestedAt:timestamp('last_requested_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 tenantKey:unique('invitation_id_tenant_uidx').on(t.id,t.institutionId),tokenKey:unique('invitation_token_uidx').on(t.tokenHash),
 acceptedProof:unique('invitation_accepted_email_user_uidx').on(t.id,t.email,t.acceptedUserId),
 byTenant:index('invitation_tenant_created_idx').on(t.institutionId,t.createdAt,t.id),
 pending:index('invitation_pending_email_idx').on(t.institutionId,t.email).where(sql`state='pending'`),
 emailValid:check('invitation_email_check',sql`email=lower(email) AND length(email) BETWEEN 3 AND 254`),
 tokenValid:check('invitation_token_check',sql`token_hash ~ '^[a-f0-9]{64}$'`),
 stateValid:check('invitation_state_check',sql`state IN ('pending','accepted','rejected','revoked')`),
 consumptionValid:check('invitation_consumption_check',sql`(state='pending' AND consumed_at IS NULL AND accepted_user_id IS NULL) OR (state='accepted' AND consumed_at IS NOT NULL AND accepted_user_id IS NOT NULL) OR (state IN ('rejected','revoked') AND consumed_at IS NOT NULL AND accepted_user_id IS NULL)`),
 expiryValid:check('invitation_expiry_check',sql`expires_at>created_at AND expires_at<=created_at+interval '7 days'`),
 grantExpiryValid:check('invitation_grant_expiry_check',sql`grant_expires_at IS NULL OR (grant_expires_at>created_at AND expires_at<=grant_expires_at)`),
 resendValid:check('invitation_resend_count_check',sql`resend_count BETWEEN 0 AND 3`),
 roleValid:check('invitation_role_check',sql`role::text<>'super_admin' AND (role::text<>'admin' OR scope_type='institution')`),
 scopeValid:check('invitation_scope_check',sql`(scope_type='institution' AND scope_program_id IS NULL AND scope_campus_id IS NULL) OR (scope_type='program' AND scope_program_id IS NOT NULL AND scope_campus_id IS NULL) OR (scope_type='campus' AND scope_campus_id IS NOT NULL AND scope_program_id IS NULL)`),
 issuerMember:foreignKey({columns:[t.issuerMembershipId,t.institutionId],foreignColumns:[institutionMemberships.id,institutionMemberships.institutionId],name:'invitation_issuer_member_tenant_fk'}),
 issuerGrant:foreignKey({columns:[t.issuerGrantId,t.issuerMembershipId],foreignColumns:[roleAssignments.id,roleAssignments.membershipId],name:'invitation_issuer_grant_member_fk'}),
 programTenant:foreignKey({columns:[t.programId,t.institutionId],foreignColumns:[academicPrograms.id,academicPrograms.institutionId],name:'invitation_program_tenant_fk'}),
 campusTenant:foreignKey({columns:[t.campusId,t.institutionId],foreignColumns:[campuses.id,campuses.institutionId],name:'invitation_campus_tenant_fk'}),
}));
export const invitationDeliveryOutbox=pgTable('invitation_delivery_outbox',{
 id:uuid('id').primaryKey().defaultRandom(),invitationId:uuid('invitation_id').notNull(),institutionId:uuid('institution_id').notNull(),payloadEncrypted:text('payload_encrypted').notNull(),
 senderEmail:text('sender_email'),replyToEmail:text('reply_to_email'),state:text('state').$type<'queued'|'accepted'|'failed'|'cancelled'>().notNull().default('queued'),
 attempts:integer('attempts').notNull().default(0),nextAttemptAt:timestamp('next_attempt_at',{withTimezone:true}).notNull().defaultNow(),leaseUntil:timestamp('lease_until',{withTimezone:true}),leaseToken:uuid('lease_token'),
 expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),providerMessageId:text('provider_message_id'),failureCode:text('failure_code'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 tenant:foreignKey({columns:[t.invitationId,t.institutionId],foreignColumns:[institutionInvitations.id,institutionInvitations.institutionId],name:'invitation_delivery_tenant_fk'}),
 due:index('invitation_delivery_due_idx').on(t.nextAttemptAt,t.id).where(sql`state='queued'`),byInvite:index('invitation_delivery_invitation_idx').on(t.invitationId),
 stateValid:check('invitation_delivery_state_check',sql`state IN ('queued','accepted','failed','cancelled')`),
 attemptsValid:check('invitation_delivery_attempts_check',sql`attempts BETWEEN 0 AND 8`),
 leaseValid:check('invitation_delivery_lease_check',sql`(lease_until IS NULL)=(lease_token IS NULL)`),
 senderValid:check('invitation_delivery_sender_check',sql`(sender_email IS NULL)=(reply_to_email IS NULL)`),
 payloadValid:check('invitation_delivery_payload_check',sql`length(payload_encrypted) BETWEEN 1 AND 701000`),
 expiryValid:check('invitation_delivery_expiry_check',sql`expires_at>created_at AND expires_at<=created_at+interval '23 hours'`),
 acceptanceValid:check('invitation_delivery_acceptance_check',sql`(state='accepted')=(provider_message_id IS NOT NULL)`),
 errorValid:check('invitation_delivery_error_check',sql`failure_code IS NULL OR failure_code IN ('EMAIL_NOT_CONFIGURED','EMAIL_PROVIDER_RETRY','EMAIL_PROVIDER_REJECTED','EMAIL_MESSAGE_INVALID','INVITATION_KEY_UNAVAILABLE','INVITATION_DELIVERY_INVALID','INVITATION_EXPIRED','RETRY_EXHAUSTED')`),
}));
export const accountEmailVerifications=pgTable('account_email_verifications',{
 userId:uuid('user_id').primaryKey().references(()=>platformUsers.id,{onDelete:'restrict'}),verifiedEmail:text('verified_email').notNull().unique('account_email_verifications_verified_email_key'),
 proofInvitationId:uuid('proof_invitation_id').notNull(),verifiedAt:timestamp('verified_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 userEmail:uniqueIndex('account_verified_user_email_uidx').on(t.userId,t.verifiedEmail),
 emailValid:check('account_verified_email_check',sql`verified_email=lower(verified_email) AND length(verified_email) BETWEEN 3 AND 254`),
 proof:foreignKey({columns:[t.proofInvitationId,t.verifiedEmail,t.userId],foreignColumns:[institutionInvitations.id,institutionInvitations.email,institutionInvitations.acceptedUserId],name:'account_email_proof_fk'}),
}));
