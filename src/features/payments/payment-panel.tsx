"use client";
import { useEffect, useState } from "react";
import { formatVnd, vietnamToday } from "@/domain";
import { type Statement } from "@/domain/statements";
import { type Payment } from "@/domain/payments";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  formatDate,
  type Page,
  useStatementMutation,
} from "@/features/statements/shared";
export function PaymentPanel({
  statement,
  onChanged,
}: {
  statement: Statement;
  onChanged: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Payment> } | null>(
    null,
  );
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [moreBusy, setMoreBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(vietnamToday());
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useStatementMutation();
  const endpoint = `/api/statements/${statement.id}/payments`;
  const key = `${statement.version}:${revision}`;
  useEffect(() => {
    let active = true;
    api<Page<Payment>>(endpoint)
      .then((page) => {
        if (active) setData({ key, page });
      })
      .catch((error) => {
        if (active) setError({ key, message: error.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key]);
  const page = data?.key === key ? data.page : null;
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Payment>>(
        `${endpoint}?cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (item) =>
                      !current.page.items.some((old) => old.id === item.id),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
    } catch (error) {
      setError({
        key,
        message:
          error instanceof Error ? error.message : "Chưa tải được khoản thu.",
      });
    } finally {
      setMoreBusy(false);
    }
  }
  async function record(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutation.run(endpoint, "POST", {
      amountVnd: Number(amount),
      receivedDate,
      method,
      privateNote: note,
    });
    if (result) {
      setAmount("");
      setNote("");
      setNotice("Đã ghi nhận khoản thu. Số còn thiếu đang được cập nhật.");
      onChanged();
    }
  }
  async function voidRecord(
    event: React.FormEvent<HTMLFormElement>,
    paymentId: string,
  ) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    const result = await mutation.run(
      `/api/payments/${paymentId}/void`,
      "POST",
      { reason },
    );
    if (result) {
      setNotice("Đã vô hiệu hóa ghi nhận; đây không phải hoàn tiền thực tế.");
      onChanged();
    }
  }
  return (
    <Card className="space-y-5 p-5 sm:p-7">
      <h2 className="serif text-2xl">Thu tiền và đối chiếu</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        Giáo viên tự xác nhận tiền đã nhận ngoài đời rồi ghi vào sổ. Một khoản
        nhận dùng trả nhiều bảng kê cần nhập thành từng khoản riêng.
      </p>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      {statement.status === "issued" &&
        statement.paidVnd < statement.totalVnd && (
          <form onSubmit={record}>
            <fieldset disabled={mutation.busy} className="space-y-4">
              <h3 className="text-sm font-semibold">Ghi nhận thu tiền</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Số tiền nhận (VND)
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={statement.totalVnd - statement.paidVnd}
                    step={1}
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Ngày nhận tiền
                  <Input
                    type="date"
                    min="1900-01-01"
                    max={vietnamToday()}
                    required
                    value={receivedDate}
                    onChange={(event) => setReceivedDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="field-label">
                Cách nhận
                <select
                  className="select-input"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="transfer">Chuyển khoản</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </label>
              <label className="field-label">
                Ghi chú khoản thu (riêng)
                <textarea
                  className="select-input min-h-20"
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <Button type="submit">
                {mutation.busy ? "Đang lưu…" : "Lưu khoản thu"}
              </Button>
            </fieldset>
          </form>
        )}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Lịch sử ghi nhận thu</h3>
        {error?.key === key ? (
          <div role="alert" className="space-y-3 text-sm text-destructive">
            <p>{error.message}</p>
            <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
              Tải lại khoản thu
            </Button>
          </div>
        ) : !page ? (
          <p role="status" className="text-sm">
            Đang tải khoản thu…
          </p>
        ) : page.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có khoản thu được ghi nhận.
          </p>
        ) : (
          page.items.map((payment) => (
            <div
              key={payment.id}
              data-testid="payment-row"
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong>{formatVnd(payment.amountVnd)}</strong>
                <span>
                  {formatDate(payment.receivedDate)} ·{" "}
                  {payment.method === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                </span>
              </div>
              {payment.privateNote && (
                <p className="whitespace-pre-wrap break-words text-xs">
                  Ghi chú riêng: {payment.privateNote}
                </p>
              )}
              {payment.voidedAt ? (
                <p className="break-words text-xs text-muted-foreground">
                  Đã vô hiệu hóa · {payment.voidReason}
                </p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-xs text-primary">
                    Vô hiệu hóa khoản thu
                  </summary>
                  <form
                    onSubmit={(event) => voidRecord(event, payment.id)}
                    className="mt-3 space-y-3"
                  >
                    <p className="text-xs leading-5">
                      Chỉ sửa sổ ghi nhận, không phải hoàn tiền. Sau đó bạn có
                      thể nhập khoản đúng.
                    </p>
                    <label className="field-label">
                      Lý do vô hiệu hóa
                      <textarea
                        name="reason"
                        required
                        maxLength={500}
                        className="select-input min-h-20"
                        disabled={mutation.busy}
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={mutation.busy}
                    >
                      Xác nhận vô hiệu hóa
                    </Button>
                  </form>
                </details>
              )}
            </div>
          ))
        )}
        {page?.nextCursor && (
          <Button variant="outline" disabled={moreBusy} onClick={more}>
            {moreBusy ? "Đang tải…" : "Tải thêm khoản thu"}
          </Button>
        )}
      </div>
    </Card>
  );
}
