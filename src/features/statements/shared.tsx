"use client";
import { useEffect, useRef, useState } from "react";
import { type Student } from "@/domain";
import { api } from "@/lib/client-api";
import { useDebounced } from "@/lib/use-debounced";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export type Page<T> = { items: T[]; nextCursor: string | null };
export const formatDate = (date: string) => date.split("-").reverse().join("/");
export function useStatementMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const running = useRef(false);
  async function run<T extends { id: string } = { id: string }>(
    path: string,
    method: string,
    body: unknown,
  ) {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify({ path, method, body });
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await api<T>(path, {
        method,
        body,
        requestId: request.current.id,
      });
      request.current = null;
      return result;
    } catch (error) {
      setError(
        (error instanceof TypeError
          ? "Chưa kết nối được máy chủ."
          : error instanceof Error
            ? error.message
            : "Chưa thể lưu.") + " Nội dung vẫn được giữ để bạn thử lại.",
      );
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, clearError: () => setError("") };
}
export function StudentPicker({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const endpoint = `/api/students?${new URLSearchParams({ archived: String(archived), limit: "50", q: term })}`;
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Student> } | null>(
    null,
  );
  const [selected, setSelected] = useState<Student | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [moreBusy, setMoreBusy] = useState(false);
  const key = `${endpoint}:${revision}`;
  useEffect(() => {
    let active = true;
    api<Page<Student>>(endpoint)
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
  useEffect(() => {
    if (!value) return;
    let active = true;
    api<Student>(`/api/students/${encodeURIComponent(value)}`)
      .then((student) => {
        if (active) setSelected(student);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);
  const page = data?.key === key && search === term ? data.page : null;
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Student>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (student) =>
                      !current.page.items.some(
                        (existing) => existing.id === student.id,
                      ),
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
          error instanceof Error ? error.message : "Chưa tải được học viên.",
      });
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label className="field-label">
        Tìm tên học viên
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          placeholder="Có dấu hoặc không dấu"
        />
      </label>
      <label className="field-label">
        Học viên
        <select
          className="select-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={!optional}
        >
          <option value="">
            {optional ? "Tất cả học viên" : "Chọn học viên"}
          </option>
          {value && !page?.items.some((student) => student.id === value) && (
            <option value={value}>
              {selected?.id === value
                ? selected.displayName
                : "Học viên đã chọn"}
            </option>
          )}
          {page?.items.map((student) => (
            <option key={student.id} value={student.id}>
              {student.displayName}
              {student.archivedAt ? " · Đã lưu trữ" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        Hiện học viên đã lưu trữ
      </label>
      {!page && error?.key !== key && (
        <p role="status" className="text-xs">
          Đang tải học viên…
        </p>
      )}
      {error?.key === key && (
        <div role="alert" className="text-xs text-destructive">
          {error.message}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Thử lại
          </Button>
        </div>
      )}
      {page && !page.items.length && (
        <p role="status" className="text-xs">
          {page.nextCursor
            ? "Chưa thấy học viên phù hợp. Bạn có thể tìm tiếp."
            : "Không có học viên phù hợp trong danh sách này."}
        </p>
      )}
      {page?.nextCursor && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={moreBusy}
          onClick={more}
        >
          {moreBusy
            ? "Đang tải…"
            : term
              ? "Tìm tiếp học viên"
              : "Tải thêm học viên"}
        </Button>
      )}
    </div>
  );
}
