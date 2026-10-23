"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card p-8">
      <h1 className="serif text-2xl">Chưa thể mở sổ.</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Vui lòng kiểm tra kết nối và thử lại.
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
