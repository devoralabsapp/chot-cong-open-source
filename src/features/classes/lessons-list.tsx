"use client";
import Link from "next/link";
import type { GroupLesson } from "@/domain/classes";
import { formatVnd } from "@/domain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/features/statements/shared";
import { LoadError, usePaged } from "./shared";
export function LessonsList({ classId }: { classId?: string }) {
  const list = usePaged<GroupLesson>(
    `/api/lessons?limit=20${classId ? `&classId=${encodeURIComponent(classId)}` : ""}`,
  );
  return (
    <div className="space-y-4">
      {list.error && <LoadError message={list.error} retry={list.reload} />}
      {!list.page && !list.error && <p role="status">Đang tải buổi học…</p>}
      {list.page && (
        <Card className="divide-y divide-border">
          {list.page.items.map((item) => (
            <Link
              href={`/app/lessons/${item.id}`}
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {item.className ?? "Nhóm tự chọn"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(item.sessionDate)}
                  {item.startTime ? ` · ${item.startTime}` : ""} ·{" "}
                  {item.studentIds.length} học viên
                </p>
              </div>
              <span className="text-sm text-primary">
                {formatVnd(item.rateVnd)} / người
              </span>
            </Link>
          ))}
          {!list.page.items.length && (
            <p className="p-6 text-sm text-muted-foreground">
              {list.page.nextCursor
                ? "Chưa thấy buổi phù hợp. Bạn có thể tải tiếp."
                : "Chưa có buổi nhóm/lớp nào trong danh sách này."}
            </p>
          )}
        </Card>
      )}
      {list.page?.nextCursor && (
        <Button variant="outline" onClick={list.more} disabled={list.moreBusy}>
          {list.moreBusy ? "Đang tải…" : "Tải thêm buổi nhóm/lớp"}
        </Button>
      )}
    </div>
  );
}
