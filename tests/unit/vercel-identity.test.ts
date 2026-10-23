import { afterEach, assert, expect, it, vi } from "vitest";
import { getVercelOidcToken } from "@vercel/oidc";
import { createVercelIdentity } from "@/lib/firebase/vercel-identity";

vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("đổi OIDC qua STS và impersonation, dùng token mới khi hết hạn", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T01:00:00Z"));
  vi.mocked(getVercelOidcToken)
    .mockResolvedValueOnce("oidc-request-one")
    .mockResolvedValueOnce("oidc-request-two");
  const provider =
    "projects/123/locations/global/workloadIdentityPools/test/providers/vercel";
  const email = "test@test-cloud.iam.gserviceaccount.com";
  const identity = createVercelIdentity({
    provider,
    serviceAccountEmail: email,
  });
  const transport = vi.spyOn(
    Object.getPrototypeOf(
      identity.authClient.transporter,
    ) as typeof identity.authClient.transporter,
    "request",
  );
  const responses = (token: string) => {
    transport
      .mockResolvedValueOnce({
        data: {
          access_token: "federated-token",
          expires_in: 3600,
          token_type: "Bearer",
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          accessToken: token,
          expireTime: new Date(Date.now() + 3600000).toISOString(),
        },
      } as never);
  };
  responses("service-token-one");
  expect(await identity.credential.getAccessToken()).toEqual({
    access_token: "service-token-one",
    expires_in: 3600,
  });
  const exchange = transport.mock.calls[0][0];
  assert(exchange);
  expect(String(exchange.url)).toBe("https://sts.googleapis.com/v1/token");
  const form = exchange.data as URLSearchParams;
  expect(form.get("subject_token")).toBe("oidc-request-one");
  expect(form.get("audience")).toBe(`//iam.googleapis.com/${provider}`);
  const impersonation = transport.mock.calls[1][0];
  assert(impersonation);
  expect(String(impersonation.url)).toBe(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
  );
  expect(impersonation.data).toMatchObject({
    scope: expect.arrayContaining([
      "https://www.googleapis.com/auth/identitytoolkit",
    ]),
    lifetime: "3600s",
  });
  await identity.credential.getAccessToken();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(getVercelOidcToken).toHaveBeenCalledTimes(1);

  vi.setSystemTime(new Date("2026-10-16T02:01:00Z"));
  responses("service-token-two");
  expect(await identity.credential.getAccessToken()).toEqual({
    access_token: "service-token-two",
    expires_in: 3600,
  });
  const refresh = transport.mock.calls[2][0];
  assert(refresh);
  expect((refresh.data as URLSearchParams).get("subject_token")).toBe("oidc-request-two");
  expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
});
