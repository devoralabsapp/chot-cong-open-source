import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { IdentityPoolClient } from "google-auth-library";
import type { Credential } from "firebase-admin/app";

export function createVercelIdentity(config: {
  provider: string;
  serviceAccountEmail: string;
}) {
  const authClient = new IdentityPoolClient({
    audience: `//iam.googleapis.com/${config.provider}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    // Read the current request's token on refresh, never at module/build time.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  const credential: Credential = {
    async getAccessToken() {
      const { token } = await authClient.getAccessToken();
      const expiresAt = authClient.credentials.expiry_date;
      if (!token || !expiresAt || expiresAt <= Date.now())
        throw new Error("Không lấy được credential Google Cloud hợp lệ.");
      return {
        access_token: token,
        expires_in: Math.floor((expiresAt - Date.now()) / 1000),
      };
    },
  };
  return { authClient, credential };
}
