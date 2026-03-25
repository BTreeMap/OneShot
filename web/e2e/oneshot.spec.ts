import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  addVirtualAuthenticator,
  removeVirtualAuthenticator,
} from "./webauthn-helpers";

const execFileAsync = promisify(execFile);
type AdminIdentity = { userId: string; deviceId: string; token: string };
const API_BASE_URL = "http://127.0.0.1:8000";

function toLocalOneShotUrl(issuedLink: string, baseURL: string): string {
  const parsed = new URL(issuedLink);
  const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
  if (!token) {
    throw new Error(`Missing token in generated link: ${issuedLink}`);
  }
  return new URL(`/oneshot#token=${token}`, baseURL).toString();
}

function tokenFromOneShotUrl(oneShotUrl: string): string {
  const parsed = new URL(oneShotUrl);
  const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
  if (!token) {
    throw new Error(`Missing token in one-shot URL: ${oneShotUrl}`);
  }
  return token;
}

async function prepareAdminIdentity(page: Page): Promise<AdminIdentity> {
  const auth = await addVirtualAuthenticator(page);
  try {
    const identity = await registerPasskeyUser(page);
    await promoteUserToAdmin(identity.userId);
    const token = await mintAdminToken(page, identity);
    return { ...identity, token };
  } finally {
    await removeVirtualAuthenticator(auth);
  }
}

async function registerPasskeyUser(
  page: Page,
): Promise<{ userId: string; deviceId: string }> {
  await page.goto("/login");
  return page.evaluate(async () => {
    const { ensureDeviceKeyMaterial, setDeviceIdentity } = await import(
      "/src/auth/deviceKey.ts"
    );
    const { toCreateOptions, serializeCreateResponse } = await import(
      "/src/auth/webauthn.ts"
    );

    const keyMaterial = await ensureDeviceKeyMaterial();
    const startRes = await fetch("/api/auth/passkey/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "OneShot E2E Admin" }),
    });
    if (!startRes.ok) {
      throw new Error(`register/start failed: ${startRes.status}`);
    }
    const startData = (await startRes.json()) as {
      options: Record<string, unknown>;
      flow_id: string;
    };

    const credential = (await navigator.credentials.create(
      toCreateOptions(
        startData.options as Parameters<typeof toCreateOptions>[0],
      ),
    )) as PublicKeyCredential | null;
    if (!credential) throw new Error("Credential creation cancelled");

    const finishRes = await fetch("/api/auth/passkey/register/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow_id: startData.flow_id,
        credential: serializeCreateResponse(credential),
        device_public_key_jwk: keyMaterial.publicJwk,
        device_label: navigator.userAgent.slice(0, 64),
      }),
    });
    if (!finishRes.ok) {
      throw new Error(`register/finish failed: ${finishRes.status}`);
    }
    const finishData = (await finishRes.json()) as {
      user_id: string;
      device_id: string;
    };
    await setDeviceIdentity(finishData.device_id, finishData.user_id);
    return { userId: finishData.user_id, deviceId: finishData.device_id };
  });
}

async function promoteUserToAdmin(userId: string): Promise<void> {
  const databaseUrl = process.env.H4CKATH0N_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("H4CKATH0N_DATABASE_URL is required for CLI role promotion.");
  }
  const cliEnv = {
    ...process.env,
    H4CKATH0N_DATABASE_URL: databaseUrl,
  };
  await execFileAsync(
    "uv",
    [
      "--project",
      "../api",
      "run",
      "h4ckath0n",
      "users",
      "set-role",
      "--user-id",
      userId,
      "--role",
      "admin",
      "--yes",
    ],
    { cwd: process.cwd(), env: cliEnv },
  );
  const { stdout } = await execFileAsync(
    "uv",
    [
      "--project",
      "../api",
      "run",
      "h4ckath0n",
      "users",
      "show",
      "--user-id",
      userId,
    ],
    { cwd: process.cwd(), env: cliEnv },
  );
  const user = JSON.parse(stdout) as { role?: string };
  if (user.role !== "admin") {
    throw new Error(`CLI did not set admin role for ${userId}`);
  }
}

async function mintAdminToken(
  page: Page,
  identity: { userId: string; deviceId: string },
): Promise<string> {
  return page.evaluate(async ({ userId, deviceId }) => {
    const { setDeviceIdentity } = await import("/src/auth/deviceKey.ts");
    const { getOrMintToken } = await import("/src/auth/token.ts");
    await setDeviceIdentity(deviceId, userId);
    return getOrMintToken("http");
  }, identity);
}

async function generateOneShotLink(
  page: Page,
  baseURL: string,
  adminToken: string,
): Promise<string> {
  const response = await page.request.post(
    `${API_BASE_URL}/api/admin/oneshot-tokens`,
    {
      headers: { Authorization: "Bearer " + adminToken },
      data: {},
    },
  );
  if (!response.ok()) {
    throw new Error(
      `oneshot token creation failed: ${response.status()} ${await response.text()}`,
    );
  }
  const payload = (await response.json()) as { upload_url?: string; token_id?: string };
  const tokenId = payload.token_id;
  const issuedLink =
    payload.upload_url ??
    (tokenId ? `https://placeholder.local/oneshot#token=${tokenId}` : `${baseURL}/oneshot#token=`);
  return toLocalOneShotUrl(issuedLink, baseURL);
}

test.describe("OneShot E2E lifecycle", () => {
  test("full lifecycle: generate link, external upload, admin audit + download", async ({
    page,
    baseURL,
  }) => {
    test.skip(!baseURL, "Playwright baseURL is required for URL normalization.");
    const admin = await prepareAdminIdentity(page);
    const oneShotUrl = await generateOneShotLink(page, baseURL!, admin.token);
    const uploadToken = tokenFromOneShotUrl(oneShotUrl);

    const fileName = "oneshot-e2e-upload.txt";
    const fileContent = "oneshot e2e dummy payload";

    const uploadResponse = await page.request.post(`${API_BASE_URL}/api/oneshot/upload`, {
      headers: { Authorization: "Bearer " + uploadToken },
      multipart: {
        file: {
          name: fileName,
          mimeType: "text/plain",
          buffer: Buffer.from(fileContent, "utf8"),
        },
      },
    });
    expect(uploadResponse.ok()).toBeTruthy();

    const filesResponse = await page.request.get(`${API_BASE_URL}/api/admin/files`, {
      headers: { Authorization: "Bearer " + admin.token },
    });
    expect(filesResponse.ok()).toBeTruthy();
    const files = (await filesResponse.json()) as Array<{
      id: string;
      original_filename: string;
    }>;
    const targetFile = files.find((f) => f.original_filename === fileName);
    expect(targetFile).toBeTruthy();
    const targetFileId = targetFile ? targetFile.id : "";

    const downloadResponse = await page.request.get(
      `${API_BASE_URL}/api/admin/files/${targetFileId}/download`,
      {
        headers: { Authorization: "Bearer " + admin.token },
      },
    );
    expect(downloadResponse.ok()).toBeTruthy();
    const downloaded = await downloadResponse.text();
    expect(downloaded).toBe(fileContent);
  });

  test("ephemerality lockout: reused link shows expired state and blocks file selection", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(!baseURL, "Playwright baseURL is required for URL normalization.");
    const admin = await prepareAdminIdentity(page);
    const oneShotUrl = await generateOneShotLink(page, baseURL!, admin.token);
    const uploadToken = tokenFromOneShotUrl(oneShotUrl);

    const firstUploadResponse = await page.request.post(`${API_BASE_URL}/api/oneshot/upload`, {
      headers: { Authorization: "Bearer " + uploadToken },
      multipart: {
        file: {
          name: "oneshot-first-use.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("first upload", "utf8"),
        },
      },
    });
    expect(firstUploadResponse.ok()).toBeTruthy();

    const secondContext = await browser.newContext();
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.goto(oneShotUrl);
      await expect(secondPage.getByText("Link Expired or Invalid")).toBeVisible({
        timeout: 15_000,
      });
      await expect(secondPage.getByLabel("Upload File")).toBeDisabled();
    } finally {
      await secondContext.close();
    }
  });
});
