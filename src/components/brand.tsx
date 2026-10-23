import { NotebookPen } from "lucide-react";
import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/app"
      className="inline-flex items-center gap-3"
      aria-label="Chốt Công — trang tổng quan"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
        <NotebookPen size={22} />
      </span>
      <span>
        <span className="block text-lg font-bold tracking-tight">
          Chốt Công<span className="text-[#acb77f]">.</span>
        </span>
        {!compact && (
          <span className="block text-[10px] tracking-wide text-muted-foreground">
            SỔ BUỔI DẠY & HỌC PHÍ
          </span>
        )}
      </span>
    </Link>
  );
}
