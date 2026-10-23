import Link from "next/link";
import { LessonsList } from "@/features/classes/lessons-list";
import { Button } from "@/components/ui/button";
export default function Page() {
  return (
    <div className="space-y-6">
      <Link href="/app/sessions" className="text-sm text-primary underline">
        ← Tất cả buổi dạy
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="serif text-3xl">Buổi nhóm & lớp</h1>
        <Button asChild>
          <Link href="/app/lessons/new">Ghi buổi nhóm/lớp</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Mỗi thẻ là một buổi chung. Học phí và trạng thái từng học viên nằm trong
        chi tiết.
      </p>
      <LessonsList />
    </div>
  );
}
