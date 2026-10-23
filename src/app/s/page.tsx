import { type Metadata } from "next";
import { PublicShare } from "@/features/sharing/public-share";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bảng kê học phí · Chốt Công",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <PublicShare />;
}
