CREATE INDEX IF NOT EXISTS "assessment_edits_version_idx" ON "assessment_edits" USING btree ("assessment_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_instances_project_idx" ON "assessment_instances" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_assessment_updated_idx" ON "comments" USING btree ("assessment_instance_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" USING btree ("parent_id");
