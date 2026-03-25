import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin";

function toLocalOneShotUrl(issuedLink: string, baseURL: string): string {
  const parsed = new URL(issuedLink);
  const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
  if (!token) {
    throw new Error(`Missing token in generated link: ${issuedLink}`);
  }
  return new URL(`/oneshot#token=${token}`, baseURL).toString();
}

async function loginAsAdmin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-username-input").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password-input").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-password-btn").click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();
}

async function generateOneShotLink(
  page: import("@playwright/test").Page,
  baseURL: string,
): Promise<string> {
  await page.getByTestId("admin-generate-link").click();
  const linkInput = page.getByTestId("admin-generated-link-input");
  await expect(linkInput).toHaveValue(/#token=/, { timeout: 10_000 });
  const issuedLink = await linkInput.inputValue();
  return toLocalOneShotUrl(issuedLink, baseURL);
}

test.describe("OneShot E2E lifecycle", () => {
  test("full lifecycle: generate link, external upload, admin audit + download", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(!baseURL, "Playwright baseURL is required for URL normalization.");
    await loginAsAdmin(page);
    const oneShotUrl = await generateOneShotLink(page, baseURL!);

    const fileName = "oneshot-e2e-upload.txt";
    const fileContent = "oneshot e2e dummy payload";

    const externalContext = await browser.newContext();
    try {
      const externalPage = await externalContext.newPage();
      await externalPage.goto(oneShotUrl);
      await expect(externalPage.getByLabel("Upload File")).toBeVisible();
      await externalPage.setInputFiles('input[type="file"]', {
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileContent, "utf8"),
      });
      await externalPage.getByRole("button", { name: "Upload" }).click();
      await expect(externalPage.getByText("Upload complete")).toBeVisible();
    } finally {
      await externalContext.close();
    }

    await page.reload();
    await page.getByTestId("admin-audit-logs-tab").click();
    const fileRow = page.locator("tr", { hasText: fileName }).first();
    await expect(fileRow).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download");
    await fileRow.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(fileName);

    const outPath = test.info().outputPath(fileName);
    await download.saveAs(outPath);
    const downloaded = await fs.readFile(outPath, "utf8");
    expect(downloaded).toBe(fileContent);
  });

  test("ephemerality lockout: reused link shows expired state and blocks file selection", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(!baseURL, "Playwright baseURL is required for URL normalization.");
    await loginAsAdmin(page);
    const oneShotUrl = await generateOneShotLink(page, baseURL!);

    const firstContext = await browser.newContext();
    try {
      const firstPage = await firstContext.newPage();
      await firstPage.goto(oneShotUrl);
      await expect(firstPage.getByLabel("Upload File")).toBeVisible();
      await firstPage.setInputFiles('input[type="file"]', {
        name: "oneshot-first-use.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("first upload", "utf8"),
      });
      await firstPage.getByRole("button", { name: "Upload" }).click();
      await expect(firstPage.getByText("Upload complete")).toBeVisible();
    } finally {
      await firstContext.close();
    }

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
