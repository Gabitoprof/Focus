CREATE TABLE "project_task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "project_task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "project_task_dependencies_not_self" CHECK ("project_task_dependencies"."task_id" <> "project_task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "due_date" text;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_depends_on_task_id_project_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;