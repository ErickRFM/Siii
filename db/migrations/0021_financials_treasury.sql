CREATE TABLE IF NOT EXISTS "financial_fee_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_fee_types_amount_check" CHECK ("default_amount_cents" >= 0),
	CONSTRAINT "financial_fee_types_status_check" CHECK ("status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"payer_user_id" uuid,
	"payer_student_id" uuid,
	"total_amount_cents" integer NOT NULL,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_status_check" CHECK ("status" IN ('pending','partially_paid','paid','cancelled','waived','refunded')),
	CONSTRAINT "payment_orders_amounts_check" CHECK ("total_amount_cents" >= 0 AND "paid_amount_cents" >= 0 AND "paid_amount_cents" <= "total_amount_cents")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"transaction_number" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_method" text NOT NULL,
	"reference" text,
	"received_by" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_amount_check" CHECK ("amount_cents" > 0),
	CONSTRAINT "payment_transactions_method_check" CHECK ("payment_method" IN ('cash','card','transfer','waiver','adjustment'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"authorized_by" uuid NOT NULL,
	"discount_percentage" integer,
	"discount_amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_waivers_amount_check" CHECK ("discount_amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "financial_fee_types" ADD CONSTRAINT "financial_fee_types_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_fee_type_id_financial_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."financial_fee_types"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payer_user_id_platform_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payer_student_id_institutional_students_id_fk" FOREIGN KEY ("payer_student_id") REFERENCES "public"."institutional_students"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "orders_fee_type_tenant_fk" FOREIGN KEY ("fee_type_id","institution_id") REFERENCES "public"."financial_fee_types"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_received_by_platform_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_waivers" ADD CONSTRAINT "financial_waivers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_waivers" ADD CONSTRAINT "financial_waivers_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_waivers" ADD CONSTRAINT "financial_waivers_authorized_by_platform_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "financial_fee_types_code_uidx" ON "financial_fee_types" USING btree ("institution_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "financial_fee_types_id_institution_uidx" ON "financial_fee_types" USING btree ("id","institution_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_number_uidx" ON "payment_orders" USING btree ("institution_id","order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_number_uidx" ON "payment_transactions" USING btree ("institution_id","transaction_number");
--> statement-breakpoint
ALTER TABLE "financial_fee_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "financial_waivers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "financial_fee_types" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "payment_orders" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "payment_transactions" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "financial_waivers" TO siii_app;
