import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseTabs } from "@/components/CourseTabs";
import { requireWorkspace } from "@/lib/session";
import { getCourse } from "@/lib/tenancy";

export default async function CourseLayout({ children, params }: LayoutProps<"/courses/[id]">) {
  const { id } = await params;
  const { ctx } = await requireWorkspace(`/courses/${id}`);
  const course = await getCourse(ctx, id);
  if (!course) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-line">
        <Link href="/dashboard" className="w-fit text-sm text-ink-3 hover:text-ink">
          ← All courses
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{course.title}</h1>
        <CourseTabs courseId={course.id} ready={course.status === "READY"} />
      </div>
      {children}
    </div>
  );
}
