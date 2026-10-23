"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatVnd, vietnamToday } from "@/domain";
import { type Statement, statementDisplayStatus } from "@/domain/statements";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatementEditor } from "./editor";
import { formatDate, useStatementMutation } from "./shared";
import { PaymentPanel } from "@/features/payments/payment-panel";
import { SharingPanel } from "@/features/sharing/sharing-panel";
export function StatementDetail({ id }: { id: string }) {
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useStatementMutation();
  useEffect(() => {
    let active = true;
    api<Statement>(`/api/statements/${encodeURIComponent(id)}`)
      .then((statement) => {
        if (active) {
          setData(statement);
          setError("");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  if (error)
    return (
      <Card role="alert" className="space-y-4 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          Tải lại bảng kê
        </Button>
        <Link href="/app/statements" className="block text-sm text-primary">
          Quay lại danh sách
        </Link>
      </Card>
    );
  if (!data || data.id !== id)
    return (
      <p role="status" className="p-8 text-sm">
        Đang mở bảng kê…
      </p>
    );
  if (editing && data.status === "draft")
    return (
      <StatementEditor
        initial={data}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          mutation.clearError();
          setEditing(false);
          setData(null);
          setRevision((value) => value + 1);
        }}
      />
    );
  const display = statementDisplayStatus(data, vietnamToday());
  async function issue() {
    const result = await mutation.run(`/api/statements/${id}/issue`, "POST", {
      version: data!.version,
    });
    if (result) {
      setData(null);
      setRevision((value) => value + 1);
    }
  }
  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutation.run(`/api/statements/${id}/void`, "POST", {
      version: data!.version,
      reason,
    });
    if (result) {
      setData(null);
      setRevision((value) => value + 1);
    }
  }
  return (
    <div className="fade-in space-y-6">
      <div>
        <Link href="/app/statements" className="text-xs text-primary">
          ← Danh sách bảng kê
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="serif break-words text-3xl">
            {data.number ?? "Xem trước bản nháp"}
          </h1>
          <span className="rounded-full bg-muted px-3 py-1 text-xs">
            {display.label}
            {display.overdue ? " · Quá hạn" : ""}
          </span>
        </div>
      </div>
      <Card className="overflow-hidden" data-testid="statement-preview">
        <div className="space-y-4 border-b border-border bg-accent-soft p-5 sm:p-7">
          <p className="text-xs font-semibold tracking-widest text-primary">
            BẢNG KÊ HỌC PHÍ
          </p>
          <h2 className="serif break-words text-2xl">
            {data.teacherSnapshot.displayName}
          </h2>
          <p className="break-words text-sm">
            Học viên: <strong>{data.recipientSnapshot.displayName}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Kỳ học {formatDate(data.periodStart)} – {formatDate(data.periodEnd)}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <span>
              Ngày phát hành:{" "}
              {data.issueDate ? formatDate(data.issueDate) : "Chưa phát hành"}
            </span>
            <span>Ngày đến hạn: {formatDate(data.dueDate)}</span>
          </div>
        </div>
        <ol className="divide-y divide-border">
          {data.items.map((item, index) => (
            <li
              key={item.sessionId}
              className="flex items-center justify-between gap-3 px-5 py-4 text-sm sm:px-7"
            >
              <span>
                {index + 1}. Buổi {formatDate(item.sessionDate)}
              </span>
              <strong>{formatVnd(item.amountVnd)}</strong>
            </li>
          ))}
        </ol>
        <div className="space-y-3 border-t border-border p-5 text-sm sm:p-7">
          <p className="flex justify-between gap-2">
            <span>Tổng học phí · {data.items.length} buổi</span>
            <strong data-testid="statement-total">
              {formatVnd(data.totalVnd)}
            </strong>
          </p>
          {data.status !== "draft" && (
            <>
              <p className="flex justify-between gap-2">
                <span>Đã ghi nhận thu</span>
                <strong>{formatVnd(data.paidVnd)}</strong>
              </p>
              <p className="flex justify-between gap-2">
                <span>
                  {data.status === "void"
                    ? "Khoản phải thu đã hủy"
                    : "Còn phải thu"}
                </span>
                <strong>
                  {formatVnd(
                    data.status === "void" ? 0 : data.totalVnd - data.paidVnd,
                  )}
                </strong>
              </p>
            </>
          )}
        </div>
        {data.bankSnapshot && (
          <div className="border-t border-border p-5 sm:p-7">
            <h3 className="mb-2 text-xs font-semibold">Thông tin nhận tiền</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {data.bankSnapshot}
            </p>
          </div>
        )}
      </Card>
      {mutation.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      )}
      {data.status === "draft" ? (
        <Card className="space-y-4 p-5">
          <p className="text-sm leading-6">
            Kiểm tra tên, các buổi, số tiền và thông tin nhận tiền ở trên. Khi
            phát hành, nội dung được chốt cố định và các buổi này không còn được
            sửa. Nháp chưa được tính vào khoản phải thu.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={mutation.busy} onClick={issue}>
              {mutation.busy ? "Đang phát hành…" : "Phát hành bảng kê"}
            </Button>
            <Button
              variant="outline"
              disabled={mutation.busy}
              onClick={() => setEditing(true)}
            >
              Sửa nháp
            </Button>
          </div>
        </Card>
      ) : data.status === "issued" ? (
        <>
          <PaymentPanel
            statement={data}
            onChanged={() => setRevision((value) => value + 1)}
          />
          <SharingPanel
            statement={data}
            onChanged={() => setRevision((value) => value + 1)}
          />
          <Card className="p-5">
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Hủy bảng kê
              </summary>
              <form onSubmit={cancel} className="mt-4 space-y-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  Chỉ hủy khi không còn khoản thu hợp lệ. Bản cũ và lịch sử được
                  giữ; các buổi sẽ được giải phóng để lập bảng kê lại.
                </p>
                <label className="field-label">
                  Lý do hủy
                  <textarea
                    className="select-input min-h-24"
                    required
                    maxLength={500}
                    value={reason}
                    disabled={mutation.busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    mutation.busy ||
                    data.paidVnd > 0 ||
                    data.activePaymentCount > 0
                  }
                >
                  {mutation.busy ? "Đang hủy…" : "Xác nhận hủy bảng kê"}
                </Button>
              </form>
            </details>
          </Card>
        </>
      ) : (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">Bảng kê đã hủy</h2>
          <p className="break-words text-sm">Lý do: {data.voidReason}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Nội dung cũ được giữ để đối chiếu. Bảng kê này không còn tạo khoản
            phải thu; các buổi có thể lập bảng kê mới.
          </p>
          <Button asChild variant="outline">
            <Link
              href={`/app/statements/new?studentId=${encodeURIComponent(data.studentId)}`}
            >
              Lập bảng kê mới
            </Link>
          </Button>
        </Card>
      )}
      {data.status === "void" && (
        <PaymentPanel
          statement={data}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
      <Link
        href={`/app/students/${data.studentId}`}
        className="block text-sm text-primary"
      >
        Mở sổ học viên →
      </Link>
    </div>
  );
}
