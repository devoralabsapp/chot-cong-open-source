"use client";
import { useEffect, useState } from "react";
import { formatVnd } from "@/domain";
import { type Statement } from "@/domain/statements";
import {
  type SharePreview,
  type ShareResult,
  type ShareStatus,
} from "@/domain/sharing";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStatementMutation } from "@/features/statements/shared";
import { PublicStatementView } from "./public-statement";
export function SharingPanel({
  statement,
  onChanged,
}: {
  statement: Statement;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<{
    version: number;
    data: ShareStatus;
  } | null>(null);
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const [newLink, setNewLink] = useState<
    (ShareResult & { url: string }) | null
  >(null);
  const [notice, setNotice] = useState("");
  const [statusError, setStatusError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const loadError = statusError || (showPreview ? previewError : "");
  const [revision, setRevision] = useState(0);
  const mutation = useStatementMutation();
  useEffect(() => {
    let active = true;
    api<ShareStatus>(`/api/statements/${statement.id}/share`)
      .then((data) => {
        if (active) {
          setStatus({ version: statement.version, data });
          setStatusError("");
        }
      })
      .catch((error) => {
        if (active) setStatusError(error.message);
      });
    return () => {
      active = false;
    };
  }, [statement.id, statement.version, revision]);
  useEffect(() => {
    if (!showPreview) return;
    let active = true;
    api<SharePreview>(`/api/statements/${statement.id}/public-preview`)
      .then((data) => {
        if (active) {
          setPreview(data);
          setPreviewError("");
        }
      })
      .catch((error) => {
        if (active) setPreviewError(error.message);
      });
    return () => {
      active = false;
    };
  }, [statement.id, statement.version, showPreview, revision]);
  const currentStatus =
    status?.version === statement.version ? status.data : null;
  const currentPreview =
    preview?.version === statement.version ? preview : null;
  const usableLink =
    newLink?.tokenHash === statement.activeShareTokenHash &&
    currentStatus?.active
      ? newLink
      : null;
  async function create() {
    if (!currentPreview || acceptedVersion !== currentPreview.version) return;
    const result = await mutation.run<ShareResult>(
      `/api/statements/${statement.id}/share`,
      "POST",
      {
        version: currentPreview.version,
        previewHash: currentPreview.previewHash,
      },
    );
    if (result) {
      setShowPreview(false);
      setAcceptedVersion(null);
      if (result.token) {
        setNewLink({
          ...result,
          url: `${window.location.origin}/s#${result.token}`,
        });
        setNotice("Đã tạo link mới. Link trước đó được thu hồi.");
      } else {
        setNewLink(null);
        setNotice(
          "Link đã được tạo ở lần lưu trước, nhưng mã gốc không thể lấy lại. Bạn xem trước và tạo link mới để sao chép nhé.",
        );
      }
      onChanged();
    }
  }
  async function revoke() {
    const result = await mutation.run(
      `/api/statements/${statement.id}/revoke-share`,
      "POST",
      { version: statement.version },
    );
    if (result) {
      setNewLink(null);
      setShowPreview(false);
      setNotice("Đã thu hồi link chia sẻ.");
      onChanged();
    }
  }
  async function copy(message = false) {
    if (!usableLink) return;
    const text = message
      ? `${statement.teacherSnapshot.displayName} gửi bảng kê học phí ${statement.number} của ${statement.recipientSnapshot.displayName}. Tổng học phí ${formatVnd(statement.totalVnd)}, còn phải thu ${formatVnd(statement.totalVnd - statement.paidVnd)} theo ghi nhận của giáo viên. Xem chi tiết: ${usableLink.url}`
      : usableLink.url;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        message ? "Đã sao chép nội dung để bạn tự gửi." : "Đã sao chép link.",
      );
    } catch {
      setNotice(
        "Chưa sao chép được. Bạn có thể chọn và sao chép link trong ô bên dưới.",
      );
    }
  }
  return (
    <Card className="space-y-5 p-5 sm:p-7">
      <h2 className="serif text-2xl">Chia sẻ bảng kê</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        Ai có link đều xem được và có thể chuyển tiếp. Link chỉ đọc, hết hạn sau
        30 ngày. Mỗi bảng kê có một link đang dùng; tạo link mới sẽ thu hồi link
        cũ.
      </p>
      <p className="text-sm">
        {!currentStatus
          ? "Đang kiểm tra trạng thái chia sẻ…"
          : currentStatus.active
            ? `Đang bật chia sẻ · Hết hạn ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium" }).format(new Date(currentStatus.expiresAt!))}`
            : "Chia sẻ đang tắt hoặc link đã hết hạn."}
      </p>
      {loadError && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{loadError}</p>
          <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
            Tải lại trạng thái
          </Button>
        </div>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {usableLink ? (
        <div className="space-y-3">
          <label className="field-label">
            Link chia sẻ mới
            <Input
              readOnly
              value={usableLink.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => copy()}>
              Sao chép link
            </Button>
            <Button variant="outline" onClick={() => copy(true)}>
              Sao chép tin nhắn
            </Button>
            <a
              className="py-3 text-sm text-primary"
              href={usableLink.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Mở bảng kê công khai
            </a>
          </div>
        </div>
      ) : (
        currentStatus?.active && (
          <p className="text-xs leading-5 text-muted-foreground">
            Mã link gốc chỉ có ở lần tạo. Nếu đã đóng màn hình, bạn cần tạo link
            mới để sao chép; link cũ sẽ hết hiệu lực.
          </p>
        )
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={mutation.busy || showPreview}
          onClick={() => {
            setShowPreview(true);
            setAcceptedVersion(null);
            mutation.clearError();
          }}
        >
          Xem trước để tạo link
        </Button>
        {currentStatus?.active && (
          <Button variant="outline" disabled={mutation.busy} onClick={revoke}>
            Thu hồi link
          </Button>
        )}
      </div>
      {showPreview && (
        <div className="space-y-4 border-t border-border pt-5">
          <h3 className="font-semibold">Nội dung người nhận sẽ thấy</h3>
          {currentPreview ? (
            <>
              <PublicStatementView statement={currentPreview.statement} />
              <label className="flex items-start gap-3 text-sm leading-5">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={acceptedVersion === currentPreview.version}
                  onChange={(event) =>
                    setAcceptedVersion(
                      event.target.checked ? currentPreview.version : null,
                    )
                  }
                  disabled={mutation.busy}
                />
                Tôi đã kiểm tra nội dung công khai phía trên
              </label>
              <Button
                onClick={create}
                disabled={
                  mutation.busy || acceptedVersion !== currentPreview.version
                }
              >
                {mutation.busy ? "Đang tạo…" : "Tạo link chia sẻ mới"}
              </Button>
            </>
          ) : (
            <p role="status" className="text-sm">
              Đang chuẩn bị bản xem trước…
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
