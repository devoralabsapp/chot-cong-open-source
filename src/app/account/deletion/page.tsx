import { type Metadata } from "next";
import { DeletionProgress } from "@/features/account/deletion-progress";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tiến trình xóa tài khoản",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <DeletionProgress />;
}
