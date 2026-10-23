import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  assertApplyTarget,
  assertDefaultRules,
  indexKey,
  safeConfigError,
  configPermissions,
  probeConfigPermissions,
} from "../../scripts/gcp/apply-firestore-config";

const environment = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  FIREBASE_ADMIN_AUTH_MODE: "vercel-oidc",
  FIREBASE_APPLY_CONFIG: "your-firebase-project",
  FIREBASE_PROJECT_ID: "your-firebase-project",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "your-firebase-project",
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "false",
};
it("chỉ cho phép apply cấu hình khi chọn rõ đúng project Production qua OIDC", () => {
  expect(() => assertApplyTarget(environment)).not.toThrow();
  for (const change of [
    { VERCEL: undefined },
    { VERCEL_ENV: "preview" },
    { FIREBASE_APPLY_CONFIG: undefined },
    { FIREBASE_PROJECT_ID: "other-project" },
    { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "other-project" },
    { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" },
    { NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true" },
  ])
    expect(() => assertApplyTarget({ ...environment, ...change })).toThrow(
      "unsafe-config-target",
    );
});

it("probe chỉ kiểm tra quyền của caller trên project cố định, không sửa IAM hoặc ghi dữ liệu", async () => {
  const request = vi.fn().mockResolvedValue({
    data: {
      permissions: ["firebaserules.releases.get", "unrelated.permission"],
    },
  });
  expect(await probeConfigPermissions({ request } as never)).toEqual({
    granted: ["firebaserules.releases.get"],
    missing: configPermissions.filter(
      (permission) => permission !== "firebaserules.releases.get",
    ),
  });
  expect(request).toHaveBeenCalledExactlyOnceWith({
    url: "https://cloudresourcemanager.googleapis.com/v1/projects/your-firebase-project:testIamPermissions",
    method: "POST",
    data: { permissions: [...configPermissions] },
    timeout: 20000,
    retry: false,
  });
});

it.each(["response", "httpResponse"])(
  "chẩn đoán lỗi quyền từ %s không đưa header/token hoặc thông báo thô vào log",
  (field) => {
    expect(
      safeConfigError({
        code: "security-rules/unknown-error",
        message: "Bearer secret-in-message",
        request: { headers: { Authorization: "Bearer secret-in-request" } },
        [field]: {
          status: 403,
          headers: { Authorization: "Bearer secret-in-response" },
          data: {
            error: {
              status: "PERMISSION_DENIED",
              message: "private arbitrary message",
              details: [
                {
                  reason: "IAM_PERMISSION_DENIED",
                  metadata: {
                    permission: "firebaserules.releases.get",
                    resource:
                      "projects/your-firebase-project/releases/cloud.firestore",
                  },
                },
              ],
            },
          },
        },
      }),
    ).toEqual({
      code: "security-rules/unknown-error",
      httpStatus: 403,
      status: "PERMISSION_DENIED",
      reason: "IAM_PERMISSION_DENIED",
      permission: "firebaserules.releases.get",
      resource: "projects/your-firebase-project/releases/cloud.firestore",
    });
  },
);

it("không log metadata ngoài project hoặc chuỗi giống credential", () => {
  expect(
    safeConfigError({
      response: {
        status: 403,
        data: {
          error: {
            details: [
              {
                metadata: {
                  permission: "Bearer private",
                  resource: "projects/other/users/private-name",
                },
              },
            ],
          },
        },
      },
    }),
  ).toEqual({ code: 403, httpStatus: 403 });
});

const source = readFileSync(
  new URL("../../firebase/firestore.rules", import.meta.url),
  "utf8",
);
it("nhận diện baseline deny-all của Console dù khác comment/khoảng trắng", () => {
  expect(() =>
    assertDefaultRules(
      [{ content: source.replace(/\/\/[^\n]*/g, "") }],
      source,
    ),
  ).not.toThrow();
});
it("dừng khi Rules đang phục vụ app khác hoặc source mới mở quyền client", () => {
  const other = source.replace("if false", "if request.auth != null");
  expect(() => assertDefaultRules([{ content: other }], source)).toThrow(
    "existing-rules-need-review",
  );
  expect(() =>
    assertDefaultRules([{ content: source }, { content: other }], source),
  ).toThrow("existing-rules-need-review");
  expect(() => assertDefaultRules([{ content: source }], other)).toThrow(
    "invalid-planned-rules",
  );
});
it("so khớp index có __name__ tự thêm nhưng giữ đúng chiều phân trang", () => {
  const index = {
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "studentId", order: "ASCENDING" },
      { fieldPath: "sessionDate", order: "DESCENDING" },
    ],
  };
  expect(indexKey(index)).toBe(
    indexKey({
      ...index,
      fields: [...index.fields, { fieldPath: "__name__", order: "DESCENDING" }],
    }),
  );
  expect(indexKey(index)).not.toBe(
    indexKey({
      ...index,
      fields: [...index.fields, { fieldPath: "__name__", order: "ASCENDING" }],
    }),
  );
});
