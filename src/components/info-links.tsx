import Link from "next/link";

export function InfoLinks() {
  return (
    <nav
      aria-label="Hướng dẫn và dữ liệu"
      className="flex flex-wrap gap-x-5 gap-y-3 text-xs leading-6 text-muted-foreground"
    >
      <Link className="underline underline-offset-4" href="/help">
        Hướng dẫn & hỗ trợ
      </Link>
      <Link className="underline underline-offset-4" href="/privacy">
        Dữ liệu & quyền riêng tư
      </Link>
      <Link className="underline underline-offset-4" href="/help#install">
        Thêm vào màn hình chính
      </Link>
    </nav>
  );
}
