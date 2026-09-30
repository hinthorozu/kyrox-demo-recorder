import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.BASE_URL || "https://fuar.kyrox.studio").replace(/\/$/, "");
const DEMO_EMAIL = process.env.DEMO_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const CUSTOMER_NAME = process.env.DEMO_CUSTOMER_NAME || "Kyrox Studio Ar-Ge Hizmetleri A.Ş.";
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "fair-crm-01-musteri-proje-sahne.webm");

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function pause(page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function clickVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.click();
  console.log(`✓ ${label}`);
}

requireEnv("DEMO_EMAIL", DEMO_EMAIL);
requireEnv("DEMO_PASSWORD", DEMO_PASSWORD);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: {
    dir: OUTPUT_DIR,
    size: { width: 1920, height: 1080 },
  },
});

const page = await context.newPage();
const video = page.video();

try {
  console.log(`Opening ${BASE_URL}/login`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "Giriş" }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1200);

  await page.getByLabel("E-posta").fill(DEMO_EMAIL);
  await pause(page, 500);
  await page.getByLabel("Şifre").fill(DEMO_PASSWORD);
  await pause(page, 700);
  await clickVisible(page.getByRole("button", { name: "Giriş Yap" }), "Giriş Yap");

  await page.waitForURL(/\/dashboard(?:\/)?$/, { timeout: 30000 });
  await pause(page, 1400);

  await clickVisible(page.getByRole("link", { name: "Müşteriler" }), "Müşteriler");
  await page.waitForURL(/\/customers(?:\/)?$/, { timeout: 20000 });
  await page.getByRole("heading", { name: "Müşteriler" }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1100);

  await clickVisible(page.getByRole("button", { name: "Yeni Müşteri" }), "Yeni Müşteri");
  await page.getByRole("heading", { name: "Yeni Müşteri" }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 700);

  await page.getByLabel("Müşteri Adı").fill(CUSTOMER_NAME);
  await pause(page, 350);
  await page.getByLabel("Ticari Ünvan").fill(CUSTOMER_NAME);
  await pause(page, 350);

  const typeField = page.getByLabel("Tip");
  if (await typeField.count()) {
    await typeField.selectOption("exhibitor");
  }

  const countryField = page.getByLabel("Ülke");
  if (await countryField.count()) {
    await countryField.fill("Türkiye");
  }

  const cityField = page.getByLabel("Şehir");
  if (await cityField.count()) {
    await cityField.fill("İstanbul");
  }

  await pause(page, 900);
  await clickVisible(page.getByRole("button", { name: "Kaydet", exact: true }), "Müşteri Kaydet");

  await page.waitForURL(/\/customers\/[^/?#]+$/, { timeout: 30000 });
  await page.getByRole("heading", { name: CUSTOMER_NAME }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1600);

  const standTab = page.getByRole("tab", { name: /Standlar/ });
  if (await standTab.count()) {
    await clickVisible(standTab, "Standlar sekmesi");
  } else {
    await clickVisible(page.getByText("Standlar", { exact: true }).first(), "Standlar sekmesi");
  }
  await pause(page, 1200);

  await clickVisible(page.getByRole("button", { name: "Yeni Proje" }), "Yeni Proje");

  await page.waitForURL(/\/stand-projects\/new\?customerId=/, { timeout: 30000 });
  await page.getByText("Yeni stand projesi", { exact: true }).waitFor({ state: "visible", timeout: 20000 });

  const host = page.locator('[data-testid="fair-stand-host"]');
  await host.waitFor({ state: "visible", timeout: 30000 });
  await pause(page, 5000);

  console.log("✓ Fair Stand sahnesi açıldı");
} catch (error) {
  console.error("Recorder failed:", error);
  throw error;
} finally {
  await context.close();

  if (video) {
    await video.saveAs(OUTPUT_FILE);
    console.log(`Video: ${OUTPUT_FILE}`);
  }

  await browser.close();
}
