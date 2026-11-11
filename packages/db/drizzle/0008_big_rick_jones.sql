CREATE TABLE "pass_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pass_id" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"days" integer NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "pass_purchase_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "pass_purchase_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "pass_purchase" ADD CONSTRAINT "pass_purchase_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pass_purchase_user_idx" ON "pass_purchase" USING btree ("user_id");