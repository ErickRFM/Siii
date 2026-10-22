import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, platformUsers } from './core';
import { institutionalStudents } from './registry';

const auditDates = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const financialFeeTypes = pgTable('financial_fee_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  defaultAmountCents: integer('default_amount_cents').notNull(),
  currency: text('currency').notNull().default('MXN'),
  status: text('status').notNull().default('active'),
  ...auditDates,
}, table => ({
  uniqueFeeCode: uniqueIndex('financial_fee_types_code_uidx').on(table.institutionId, table.code),
  validAmount: check('financial_fee_types_amount_check', sql`${table.defaultAmountCents} >= 0`),
  validStatus: check('financial_fee_types_status_check', sql`${table.status} IN ('active','inactive')`),
}));

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  orderNumber: text('order_number').notNull(),
  feeTypeId: uuid('fee_type_id').notNull().references(() => financialFeeTypes.id, { onDelete: 'restrict' }),
  payerUserId: uuid('payer_user_id').references(() => platformUsers.id, { onDelete: 'set null' }),
  payerStudentId: uuid('payer_student_id').references(() => institutionalStudents.id, { onDelete: 'set null' }),
  totalAmountCents: integer('total_amount_cents').notNull(),
  paidAmountCents: integer('paid_amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('MXN'),
  status: text('status').notNull().default('pending'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  ...auditDates,
}, table => ({
  // SQL-only in0025: orders_payer_student_tenant_fk and orders_payer_user_tenant_fk
  // enforce same-tenant payers with ON DELETE SET NULL (payer_*_id) only.
  // Drizzle0.45.4 cannot express the column list; plain set null would also null
  // institution_id. Keep scalar refs above; SQL/catalog tests own these composite FKs.
  payerStudentTenant: index('payment_orders_payer_student_tenant_idx').on(table.payerStudentId, table.institutionId),
  payerUserTenant: index('payment_orders_payer_user_tenant_idx').on(table.institutionId, table.payerUserId),
  uniqueOrderNumber: uniqueIndex('payment_orders_number_uidx').on(table.institutionId, table.orderNumber),
  scopedFeeType: foreignKey({ columns: [table.feeTypeId, table.institutionId], foreignColumns: [financialFeeTypes.id, financialFeeTypes.institutionId], name: 'orders_fee_type_tenant_fk' }),
  validStatus: check('payment_orders_status_check', sql`${table.status} IN ('pending','partially_paid','paid','cancelled','waived','refunded')`),
  validAmounts: check('payment_orders_amounts_check', sql`${table.totalAmountCents} >= 0 AND ${table.paidAmountCents} >= 0 AND ${table.paidAmountCents} <= ${table.totalAmountCents}`),
}));

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull().references(() => paymentOrders.id, { onDelete: 'restrict' }),
  transactionNumber: text('transaction_number').notNull(),
  amountCents: integer('amount_cents').notNull(),
  paymentMethod: text('payment_method').notNull(),
  reference: text('reference'),
  receivedBy: uuid('received_by').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  ...auditDates,
}, table => ({
  uniqueTrxNumber: uniqueIndex('payment_transactions_number_uidx').on(table.institutionId, table.transactionNumber),
  validAmount: check('payment_transactions_amount_check', sql`${table.amountCents} > 0`),
  validMethod: check('payment_transactions_method_check', sql`${table.paymentMethod} IN ('cash','card','transfer','waiver','adjustment')`),
}));

export const financialWaivers = pgTable('financial_waivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull().references(() => paymentOrders.id, { onDelete: 'restrict' }),
  authorizedBy: uuid('authorized_by').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  discountPercentage: integer('discount_percentage'),
  discountAmountCents: integer('discount_amount_cents').notNull(),
  reason: text('reason').notNull(),
  ...auditDates,
}, table => ({
  validDiscountAmount: check('financial_waivers_amount_check', sql`${table.discountAmountCents} > 0`),
}));
