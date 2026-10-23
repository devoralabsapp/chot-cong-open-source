"use client";
let csrf: Promise<string> | undefined;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function csrfToken() {
  csrf ??= fetch("/api/auth/csrf", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error("Không thể tạo phiên bảo mật.");
      return (await r.json()).token as string;
    })
    .catch((error) => {
      csrf = undefined;
      throw error;
    });
  return csrf;
}
export async function api<T>(
  path: string,
  options?: { method?: string; body?: unknown; requestId?: string },
): Promise<T> {
  const mutation = options?.method && options.method !== "GET";
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    cache: "no-store",
    headers: mutation
      ? {
          "Content-Type": "application/json",
          "x-csrf-token": await csrfToken(),
          ...(options.requestId
            ? { "Idempotency-Key": options.requestId }
            : {}),
        }
      : {},
    body: mutation ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 403) csrf = undefined;
    if (response.status === 423 && !path.startsWith("/api/account/"))
      window.location.assign("/account/deletion");
    if (
      response.status === 401 &&
      !path.startsWith("/api/auth/") &&
      path !== "/api/account/deletion"
    )
      window.location.assign("/login?expired=1");
    throw new ApiError(
      response.status,
      data.error ?? "Không thể lưu. Vui lòng thử lại.",
    );
  }
  return data;
}
