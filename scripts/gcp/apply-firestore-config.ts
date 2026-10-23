import { readFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";

// Template target: replace this and the project-number allowlist with YOUR identifiers.
const project = "your-firebase-project";
const database = `projects/${project}/databases/(default)`;
const baseline = `rules_version = '2'; service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}`;
const order = z.enum(["ASCENDING", "DESCENDING"]);
const configurationSchema = z
  .object({
    indexes: z
      .array(
        z
          .object({
            collectionGroup: z.enum([
              "students",
              "sessions",
              "statements",
              "payments",
            ]),
            queryScope: z.literal("COLLECTION"),
            fields: z
              .array(
                z.object({
                  fieldPath: z.string().regex(/^[a-zA-Z_]+$/),
                  order,
                }),
              )
              .min(2)
              .max(10),
          })
          .strict(),
      )
      .max(16),
    fieldOverrides: z
      .array(
        z
          .object({
            collectionGroup: z.enum([
              "users",
              "students",
              "sessions",
              "operationRequests",
              "statements",
              "payments",
              "shareRateLimits",
            ]),
            fieldPath: z.string().regex(/^(\*|[a-zA-Z]+)$/),
            indexes: z.array(z.never()).length(0),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

type Index = {
  name?: string;
  queryScope: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string }[];
  state?: string;
};
type Field = {
  name?: string;
  indexConfig?: { usesAncestorConfig?: boolean; indexes?: unknown[] };
};
type Operation = { name: string; done?: boolean; error?: { code: number } };

const stop = (code: string): never => {
  throw Object.assign(new Error(code), { code });
};
export function assertApplyTarget(env: Record<string, string | undefined>) {
  if (
    env.FIREBASE_APPLY_CONFIG !== project ||
    !env.VERCEL ||
    env.VERCEL_ENV !== "production" ||
    env.FIREBASE_ADMIN_AUTH_MODE !== "vercel-oidc" ||
    env.FIREBASE_PROJECT_ID !== project ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== project ||
    env.FIREBASE_AUTH_EMULATOR_HOST ||
    env.FIRESTORE_EMULATOR_HOST ||
    env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "false"
  )
    stop("unsafe-config-target");
}
export function canonicalRules(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s/g, "")
    .replace(/"/g, "'");
}
export function assertDefaultRules(
  files: { content: string }[],
  source: string,
) {
  if (canonicalRules(source) !== canonicalRules(baseline))
    stop("invalid-planned-rules");
  if (
    files.length !== 1 ||
    canonicalRules(files[0].content) !== canonicalRules(baseline)
  )
    stop("existing-rules-need-review");
}
export function indexKey(index: Index) {
  const fields: Index["fields"] = index.fields.map(
    ({ fieldPath, order, arrayConfig }) => ({
      fieldPath,
      ...(order ? { order } : { arrayConfig }),
    }),
  );
  if (fields.at(-1)?.fieldPath !== "__name__")
    fields.push({
      fieldPath: "__name__",
      order: fields.at(-1)?.order ?? "ASCENDING",
    });
  return JSON.stringify({ queryScope: index.queryScope, fields });
}

export function safeConfigError(error: unknown) {
  const candidate = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    httpResponse?: ErrorResponse;
    response?: ErrorResponse;
  };
  type ErrorResponse = {
    status?: number;
    data?: {
      error?: {
        status?: string;
        message?: string;
        details?: {
          reason?: string;
          metadata?: { permission?: string; resource?: string };
        }[];
      };
    };
  };
  const response = candidate.response ?? candidate.httpResponse;
  const raw = candidate.code ?? response?.status;
  const code =
    typeof raw === "number" ||
    (typeof raw === "string" && /^[a-zA-Z0-9_/-]+$/.test(raw))
      ? raw
      : "config-apply-failed";
  const reason = response?.data?.error?.details?.find(
    (detail) => detail.reason,
  )?.reason;
  const validationMessage =
    response?.data?.error?.status === "INVALID_ARGUMENT"
      ? response.data.error.message
      : undefined;
  const permission = response?.data?.error?.details?.find(
    (detail) => detail.metadata?.permission,
  )?.metadata?.permission;
  const resource = response?.data?.error?.details?.find(
    (detail) => detail.metadata?.resource,
  )?.metadata?.resource;
  return {
    code,
    ...(response?.status && Number.isInteger(response.status)
      ? { httpStatus: response.status }
      : {}),
    ...(response?.data?.error?.status &&
    /^[A-Z_]+$/.test(response.data.error.status)
      ? { status: response.data.error.status }
      : {}),
    ...(reason && /^[A-Z_]+$/.test(reason) ? { reason } : {}),
    ...(permission &&
    /^(firebaserules|datastore|iam)\.[A-Za-z.]+$/.test(permission)
      ? { permission }
      : {}),
    ...(resource &&
    /^projects\/(your-firebase-project|000000000000)(\/[A-Za-z0-9_.()/\-]+)?$/.test(
      resource,
    )
      ? { resource }
      : {}),
    ...(validationMessage &&
    !/Bearer|Authorization|access_token|eyJ/.test(validationMessage)
      ? { validation: validationMessage.slice(0, 400) }
      : {}),
  };
}

// Diagnostic calls are read-only and run only after an apply request is denied.
// Never serialize an OAuth client, token response, request, or full error object.
export const configPermissions = [
  "firebaserules.releases.get",
  "firebaserules.rulesets.get",
  "firebaserules.rulesets.create",
  "firebaserules.releases.update",
  "datastore.indexes.list",
  "datastore.indexes.create",
  "datastore.indexes.update",
] as const;
export async function probeConfigPermissions(
  client: Pick<import("google-auth-library").IdentityPoolClient, "request">,
) {
  const { data } = await client.request<{ permissions?: string[] }>({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,
    method: "POST",
    data: { permissions: [...configPermissions] },
    timeout: 20000,
    retry: false,
  });
  return {
    granted: configPermissions.filter((permission) =>
      data.permissions?.includes(permission),
    ),
    missing: configPermissions.filter(
      (permission) => !data.permissions?.includes(permission),
    ),
  };
}

// Explicit one-time build operation. Never called by a route or normal build.
export async function applyFirestoreConfig() {
  assertApplyTarget(process.env);
  let step = "read-config";
  const log = (event: string, detail: object = {}) =>
    console.log(
      JSON.stringify({ event: `firebase.config.${event}`, step, ...detail }),
    );
  const deadline = setTimeout(
    () => {
      log("failed", { code: "deadline-exceeded" });
      process.exit(1);
    },
    15 * 60 * 1000,
  );
  try {
    const source = await readFile(
      new URL("../../firebase/firestore.rules", import.meta.url),
      "utf8",
    );
    const planned = configurationSchema.parse(
      JSON.parse(
        await readFile(
          new URL("../../firebase/firestore.indexes.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    const { admin } = await import("../../src/lib/firebase/admin");
    const { getSecurityRules } = await import("firebase-admin/security-rules");
    const security = getSecurityRules(admin().auth.app);
    step = "read-existing-rules";
    const previous = await security
      .getFirestoreRuleset()
      .catch(async (error: unknown) => {
        log("rules-read-denied", safeConfigError(error));
        const { vercelIdentityConfig } =
          await import("../../src/lib/firebase/server-config");
        const { createVercelIdentity } =
          await import("../../src/lib/firebase/vercel-identity");
        const identity = vercelIdentityConfig() ?? stop("incomplete-config");
        log("identity-target", {
          project,
          provider: identity.provider,
          serviceAccount: identity.serviceAccountEmail,
          adminProject: admin().auth.app.options.projectId,
        });
        const { authClient } = createVercelIdentity(identity);
        try {
          const { OAuth2Client } = await import("google-auth-library");
          const credential =
            admin().auth.app.options.credential ?? stop("missing-credential");
          const { access_token: accessToken } =
            await credential.getAccessToken();
          const info = await new OAuth2Client().getTokenInfo(accessToken);
          log("identity-probe", {
            serviceAccountMatches: info.email === identity.serviceAccountEmail,
            cloudPlatformScope: info.scopes.includes(
              "https://www.googleapis.com/auth/cloud-platform",
            ),
          });
        } catch (probeError) {
          log("identity-probe-failed", safeConfigError(probeError));
        }
        try {
          log("permissions-probe", await probeConfigPermissions(authClient));
        } catch (probeError) {
          log("permissions-probe-failed", safeConfigError(probeError));
        }
        try {
          const { data } = await authClient.request<{ rulesetName?: string }>({
            url: `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`,
            method: "GET",
            timeout: 20000,
            retry: false,
          });
          log("rules-rest-probe", { releaseFound: Boolean(data.rulesetName) });
        } catch (probeError) {
          log("rules-rest-probe-failed", safeConfigError(probeError));
        }
        throw error;
      });
    assertDefaultRules(previous.source, source);
    log("rules-verified", { previousRuleset: previous.name });

    const { vercelIdentityConfig } =
      await import("../../src/lib/firebase/server-config");
    const { createVercelIdentity } =
      await import("../../src/lib/firebase/vercel-identity");
    const identity = vercelIdentityConfig() ?? stop("incomplete-config");
    const { authClient } = createVercelIdentity(identity);
    const request = async <T>(
      path: string,
      method: "GET" | "POST" | "PATCH" = "GET",
      data?: unknown,
    ): Promise<T> => {
      if (!path.startsWith(database + "/")) stop("unsafe-resource-path");
      const response = await authClient.request<T>({
        url: `https://firestore.googleapis.com/v1/${path}`,
        method,
        data,
        timeout: 20000,
        retry: false,
      });
      return response.data;
    };
    const listIndexes = async (collection: string) => {
      // The production endpoint rejects nonzero pageSize; use its default.
      const indexes: Index[] = [];
      let pageToken: string | undefined;
      do {
        const page: { indexes?: Index[]; nextPageToken?: string } =
          await request(
            `${database}/collectionGroups/-/indexes${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`,
          );
        indexes.push(...(page.indexes ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return indexes.filter((index) =>
        index.name?.startsWith(
          `${database}/collectionGroups/${collection}/indexes/`,
        ),
      );
    };
    const listFields = async () => {
      const fields: Field[] = [];
      let pageToken: string | undefined;
      do {
        const page: { fields?: Field[]; nextPageToken?: string } =
          await request(
            `${database}/collectionGroups/-/fields?filter=${encodeURIComponent("indexConfig.usesAncestorConfig=false")}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
          );
        fields.push(...(page.fields ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return fields;
    };

    step = "read-existing-indexes";
    const existing = new Map<string, Index[]>();
    for (const group of new Set(
      planned.indexes.map((index) => index.collectionGroup),
    ))
      existing.set(group, await listIndexes(group));
    step = "read-existing-field-exemptions";
    const existingFields = await listFields();
    const fields = [];
    for (const field of planned.fieldOverrides) {
      const name = `${database}/collectionGroups/${field.collectionGroup}/fields/${encodeURIComponent(field.fieldPath)}`;
      fields.push({
        name,
        current: existingFields.find((field) => field.name === name),
      });
    }

    step = "publish-rules";
    // Only the known deny-all baseline may be replaced. Keep the old ruleset.
    const released = await security.releaseFirestoreRulesetFromSource(source);
    const current = await security.getFirestoreRuleset();
    assertDefaultRules(current.source, source);
    if (current.name !== released.name) stop("rules-release-mismatch");
    log("rules-published", { ruleset: released.name });

    const operations: string[] = [];
    const track = (operation: Operation) => {
      if (operation.error) stop(`operation-${operation.error.code}`);
      if (!operation.done) {
        if (!operation.name.startsWith(database + "/operations/"))
          stop("unsafe-operation-path");
        operations.push(operation.name);
      }
    };
    step = "create-missing-indexes";
    for (const index of planned.indexes) {
      const found = existing
        .get(index.collectionGroup)
        ?.find((candidate) => indexKey(candidate) === indexKey(index));
      if (found?.state === "NEEDS_REPAIR") stop("index-needs-repair");
      if (!found) {
        const { collectionGroup, ...definition } = index;
        track(
          await request<Operation>(
            `${database}/collectionGroups/${collectionGroup}/indexes`,
            "POST",
            definition,
          ),
        );
        log("index-created", { collection: collectionGroup });
      }
    }
    step = "apply-field-exemptions";
    for (const field of fields) {
      if (
        field.current?.indexConfig?.usesAncestorConfig !== true &&
        field.current?.indexConfig &&
        !field.current.indexConfig.indexes?.length
      )
        continue;
      track(
        await request<Operation>(
          `${field.name}?updateMask=indexConfig`,
          "PATCH",
          { name: field.name, indexConfig: { indexes: [] } },
        ),
      );
    }

    step = "wait-until-ready";
    let lastPending = -1;
    for (;;) {
      const pending: string[] = [];
      for (const name of operations) {
        const operation = await request<Operation>(name);
        if (operation.error) stop(`operation-${operation.error.code}`);
        if (!operation.done) pending.push(name);
      }
      operations.splice(0, operations.length, ...pending);
      const indexes = new Map<string, Index[]>();
      for (const group of existing.keys())
        indexes.set(group, await listIndexes(group));
      const notReady = planned.indexes.filter(
        (index) =>
          indexes
            .get(index.collectionGroup)
            ?.find((candidate) => indexKey(candidate) === indexKey(index))
            ?.state !== "READY",
      ).length;
      const total = pending.length + notReady;
      if (!total) break;
      if (total !== lastPending) log("waiting", { pending: total });
      lastPending = total;
      await pause(10000);
    }
    const actualFields = await listFields();
    for (const field of fields) {
      const actual = actualFields.find((actual) => actual.name === field.name);
      if (
        !actual?.indexConfig ||
        actual.indexConfig.usesAncestorConfig ||
        actual.indexConfig.indexes?.length
      )
        stop("field-exemption-mismatch");
    }
    log("applied", {
      readyIndexes: planned.indexes.length,
      fieldExemptions: planned.fieldOverrides.length,
    });
  } catch (error) {
    log("failed", safeConfigError(error));
    stop("firestore-config-failed");
  } finally {
    clearTimeout(deadline);
  }
}
