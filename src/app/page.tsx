import Link from "next/link";
import { ArrowRight, Check, Leaf, NotebookPen } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { InfoLinks } from "@/components/info-links";
export default function Home() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Brand />
        <Button asChild variant="outline">
          <Link href="/login">
            Đăng nhập <ArrowRight />
          </Link>
        </Button>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce4cf] bg-[#edf2e3] px-3 py-1.5 text-xs font-medium">
            <Leaf size={14} /> Dành cho giáo viên tự do
          </div>
          <h1 className="serif text-5xl leading-[1.15] tracking-tight md:text-6xl">
            Dạy hết mình.
            <br />
            <span className="text-primary">Nhẹ đầu sổ sách.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
            Một nơi gọn gàng để ghi buổi dạy và giữ đúng học phí từng học viên.
            Bắt đầu từ buổi dạy hôm nay.
          </p>
          <Button asChild className="mt-8 h-12">
            <Link href="/login">
              Bắt đầu ghi buổi dạy <ArrowRight />
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Dạy cá nhân & lớp học · Theo buổi · Thu học phí sau
          </p>
        </div>
        <div className="relative rounded-[32px] bg-[#e9eddc] p-5 sm:p-9">
          <div className="rounded-2xl border border-white bg-white p-6 shadow-lg shadow-[#263b3020]">
            <div className="mb-7 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <NotebookPen size={18} /> Sổ buổi dạy
              </span>
              <span className="text-[10px] text-muted-foreground">
                VÍ DỤ MINH HỌA
              </span>
            </div>
            <p className="serif text-2xl">
              Mỗi buổi dạy,
              <br />
              đều được ghi nhớ.
            </p>
            <div className="mt-6 space-y-3">
              {["Lan · Piano · 200.000 ₫", "Minh · Tiếng Anh · 250.000 ₫"].map(
                (s, i) => (
                  <div
                    key={s}
                    className="flex items-center gap-3 rounded-xl bg-[#f5f7f0] p-4"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#e2ebd8] text-primary">
                      <Check size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{s}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i
                          ? "Buổi đã hoàn thành"
                          : "Đơn giá được lưu theo buổi"}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
            <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              Đổi đơn giá mới, các buổi đã ghi vẫn giữ nguyên.
            </p>
          </div>
          <span className="absolute -bottom-4 right-8 rounded-xl bg-[#f5dfab] px-5 py-3 text-sm shadow-sm">
            Bớt đối chiếu. Thêm thảnh thơi.
          </span>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-6 py-12 text-xs leading-5 text-muted-foreground">
        Chốt Công · Sổ buổi dạy & học phí cho giáo viên piano, ngoại ngữ và gia
        sư.
        <br />
        Sổ bắt đầu từ các buổi bạn nhập; chưa bao gồm khoản nợ cũ.
        <div className="mt-5">
          <InfoLinks />
        </div>
      </footer>
    </main>
  );
}
