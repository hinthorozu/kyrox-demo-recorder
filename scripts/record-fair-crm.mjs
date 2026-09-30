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

const TUTORIAL_STYLE = {
  color: "#ff7a00",
  glow: "rgba(255, 122, 0, 0.34)",
  strongGlow: "rgba(255, 122, 0, 0.52)",
};

async function showFocus(locator, { strong = false, holdMs = 700, zoom = true } = {}) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();

  const box = await locator.boundingBox();
  if (!box) throw new Error("Unable to resolve tutorial focus bounding box");

  await locator.page().evaluate(
    ({ box, style, strong, zoom }) => {
      document.getElementById("__kyrox_tutorial_focus")?.remove();

      const overlay = document.createElement("div");
      overlay.id = "__kyrox_tutorial_focus";
      overlay.style.position = "fixed";
      overlay.style.left = `${Math.max(4, box.x - (strong ? 8 : 5))}px`;
      overlay.style.top = `${Math.max(4, box.y - (strong ? 8 : 5))}px`;
      overlay.style.width = `${box.width + (strong ? 16 : 10)}px`;
      overlay.style.height = `${box.height + (strong ? 16 : 10)}px`;
      overlay.style.border = `${strong ? 5 : 4}px solid ${style.color}`;
      overlay.style.borderRadius = "10px";
      overlay.style.boxSizing = "border-box";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      overlay.style.boxShadow = strong
        ? `0 0 0 7px ${style.strongGlow}, 0 0 30px ${style.strongGlow}`
        : `0 0 0 5px ${style.glow}, 0 0 22px ${style.glow}`;
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(0.985)";
      overlay.style.transition = "opacity 160ms ease, transform 160ms ease";
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        overlay.style.transform = "scale(1)";
      });

      if (zoom) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        document.documentElement.style.transformOrigin = `${centerX}px ${centerY}px`;
        document.documentElement.style.transition = "transform 220ms ease";
        document.documentElement.style.transform = "scale(1.018)";
      }
    },
    { box, style: TUTORIAL_STYLE, strong, zoom }
  );

  await locator.page().waitForTimeout(holdMs);
}

async function pulseFocus(locator) {
  await locator.page().evaluate(() => {
    const overlay = document.getElementById("__kyrox_tutorial_focus");
    if (!overlay) return;
    overlay.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(1.055)", opacity: 0.88 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 330, easing: "ease-out" }
    );
  });
  await locator.page().waitForTimeout(280);
}

async function clearFocus(page) {
  await page.evaluate(() => {
    const overlay = document.getElementById("__kyrox_tutorial_focus");
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 180);
    }
    document.documentElement.style.transform = "";
    document.documentElement.style.transformOrigin = "";
  });
  await page.waitForTimeout(220);
}

async function clickVisible(locator, label, { strong = false } = {}) {
  await showFocus(locator, { strong, holdMs: strong ? 850 : 650, zoom: true });
  await pulseFocus(locator);
  await locator.click();
  console.log(`✓ ${label}`);
  await locator.page().waitForTimeout(280);
  try { await clearFocus(locator.page()); } catch {}
}

async function fillWithHighlight(locator, value, label) {
  await showFocus(locator, { holdMs: 650, zoom: true });
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 28 });
  console.log(`✓ ${label}`);
  await locator.page().waitForTimeout(500);
  await clearFocus(locator.page());
}

async function selectWithHighlight(locator, value, label) {
  await showFocus(locator, { holdMs: 650, zoom: true });
  await locator.selectOption(value);
  await pulseFocus(locator);
  console.log(`✓ ${label}`);
  await locator.page().waitForTimeout(350);
  await clearFocus(locator.page());
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

  await fillWithHighlight(page.locator("#login-email"), DEMO_EMAIL, "E-posta");
  await pause(page, 500);
  await fillWithHighlight(page.locator("#login-password"), DEMO_PASSWORD, "Şifre");
  await pause(page, 700);
  await clickVisible(page.getByRole("button", { name: "Giriş Yap" }), "Giriş Yap", { strong: true });

  await page.waitForURL(/\/dashboard(?:\/)?$/, { timeout: 30000 });
  await pause(page, 1400);

  await clickVisible(page.getByRole("link", { name: "Müşteriler" }), "Müşteriler");
  await page.waitForURL(/\/customers(?:\/)?$/, { timeout: 20000 });
  await page.getByRole("heading", { name: "Müşteriler" }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1100);

  await clickVisible(page.getByRole("button", { name: "Yeni Müşteri" }), "Yeni Müşteri", { strong: true });
  await page.getByRole("heading", { name: "Yeni Müşteri" }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 700);

  await fillWithHighlight(page.locator("#customer-display-name"), CUSTOMER_NAME, "Müşteri Adı");
  await pause(page, 350);
  await fillWithHighlight(page.locator("#customer-trade-name"), CUSTOMER_NAME, "Ticari Ünvan");
  await pause(page, 350);

  await selectWithHighlight(page.locator("#customer-type"), "exhibitor", "Tip");
  await fillWithHighlight(page.locator("#customer-country"), "Türkiye", "Ülke");
  await fillWithHighlight(page.locator("#customer-city"), "İstanbul", "Şehir");

  await pause(page, 900);
  await clickVisible(page.getByRole("button", { name: "Kaydet", exact: true }), "Müşteri Kaydet", { strong: true });

  await page.waitForURL(/\/customers\/[^/?#]+$/, { timeout: 30000 });
  await page.getByRole("heading", { name: CUSTOMER_NAME }).waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1600);

  await clickVisible(page.locator("#tab-projects"), "Standlar sekmesi");
  await page.locator("#panel-projects").waitFor({ state: "visible", timeout: 15000 });
  await pause(page, 1200);

  // FAIR CRM intentionally opens Stand projects in a new tab. For one continuous
  // tutorial recording, keep the exact target route but normalize that navigation
  // into the current tab before pressing the real UI button.
  await page.evaluate(() => {
    window.open = (url) => {
      if (typeof url === "string") window.location.assign(url);
      return window;
    };
  });

  const newProjectButton = page
    .locator("#panel-projects .table-toolbar")
    .getByRole("button", { name: "Yeni Proje", exact: true });
  await clickVisible(newProjectButton, "Yeni Proje", { strong: true });

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
