CREATE TABLE "assessment_links" (
	"from_assessment_id" uuid NOT NULL,
	"to_assessment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_links_from_assessment_id_to_assessment_id_pk" PRIMARY KEY("from_assessment_id","to_assessment_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_links" ADD CONSTRAINT "assessment_links_from_assessment_id_assessment_instances_id_fk" FOREIGN KEY ("from_assessment_id") REFERENCES "assessment_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_links" ADD CONSTRAINT "assessment_links_to_assessment_id_assessment_instances_id_fk" FOREIGN KEY ("to_assessment_id") REFERENCES "assessment_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_links_to_idx" ON "assessment_links" USING btree ("to_assessment_id");
