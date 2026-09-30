import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.BASE_URL || "https://fuar.kyrox.studio").replace(/\/$/, "");
const DEMO_EMAIL = process.env.DEMO_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const CUSTOMER_NAME = process.env.DEMO_CUSTOMER_NAME || "Kyrox Studio Ar-Ge Hizmetleri A.Ş.";
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "fair-crm-02-sahne-olusturma.webm");
const TIMELINE_FILE = path.join(OUTPUT_DIR, "fair-crm-02.timeline.json");

const STYLE = {
  color: "#ff7a00",
  glow: "rgba(255, 122, 0, 0.34)",
  strongGlow: "rgba(255, 122, 0, 0.52)",
};

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function showFocus(page, locator, { strong = false, holdMs = 650 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Unable to resolve focus box");

  await page.evaluate(({ box, style, strong }) => {
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
    overlay.style.transform = "scale(.985)";
    overlay.style.transition = "opacity 160ms ease, transform 160ms ease";
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      overlay.style.transform = "scale(1)";
    });
  }, { box, style: STYLE, strong });

  await pause(page, holdMs);
}

async function pulse(page) {
  await page.evaluate(() => {
    document.getElementById("__kyrox_tutorial_focus")?.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(1.055)", opacity: .88 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 330, easing: "ease-out" },
    );
  });
  await pause(page, 300);
}

async function clearFocus(page) {
  await page.evaluate(() => {
    const el = document.getElementById("__kyrox_tutorial_focus");
    if (el) el.remove();
  });
}

async function clickFocus(page, locator, { strong = false, holdMs = 650 } = {}) {
  await showFocus(page, locator, { strong, holdMs });
  await pulse(page);
  await locator.click();
  await pause(page, 300);
  await clearFocus(page);
}

async function fillFocus(page, locator, value) {
  await showFocus(page, locator, { holdMs: 600 });
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 45 });
  await pause(page, 450);
  await clearFocus(page);
}

async function selectFocus(page, locator, value, { holdOpenMs = 850 } = {}) {
  await showFocus(page, locator, { holdMs: 600 });
  await locator.click();
  await pause(page, holdOpenMs);
  await locator.selectOption(value);
  await pulse(page);
  await pause(page, 500);
  await clearFocus(page);
}

required("DEMO_EMAIL", DEMO_EMAIL);
required("DEMO_PASSWORD", DEMO_PASSWORD);
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Preparation context: authenticate and resolve an already-created demo customer.
// This context is intentionally NOT video-recorded.
const prepContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const prepPage = await prepContext.newPage();
await prepPage.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
await prepPage.locator("#login-email").fill(DEMO_EMAIL);
await prepPage.locator("#login-password").fill(DEMO_PASSWORD);
await prepPage.getByRole("button", { name: "Giriş Yap" }).click();
await prepPage.waitForURL(/\/dashboard(?:\/)?$/, { timeout: 30000 });

const customerId = await prepPage.evaluate(async (customerName) => {
  const raw = localStorage.getItem("fair-crm.auth.session");
  if (!raw) throw new Error("Authenticated FAIR CRM session is missing");
  const session = JSON.parse(raw);
  const params = new URLSearchParams({ page: "1", pageSize: "100", search: customerName });
  const response = await fetch(`/api/v1/customers?${params}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "X-Organization-Id": session.organizationId,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`Customer lookup failed: HTTP ${response.status}`);
  const body = await response.json();
  const items = Array.isArray(body.items) ? body.items : [];
  const exact = items.find((item) => item.display_name === customerName && !item.deleted_at) || items[0];
  if (!exact?.id) throw new Error(`Demo customer not found: ${customerName}`);
  return exact.id;
}, CUSTOMER_NAME);

const storageState = await prepContext.storageState();
await prepContext.close();

// Recording starts directly on the scene-creation screen.
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  storageState,
  recordVideo: {
    dir: OUTPUT_DIR,
    size: { width: 1920, height: 1080 },
  },
});

const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();
const events = [];
const mark = (name) => {
  const atMs = Date.now() - startedAt;
  events.push({ name, atMs });
  console.log(`◷ ${name} @ ${atMs}ms`);
};

try {
  await page.goto(`${BASE_URL}/stand-projects/new?customerId=${encodeURIComponent(customerId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const iframe = page.locator('iframe[data-testid="fair-stand-frame"]');
  await iframe.waitFor({ state: "visible", timeout: 30000 });
  const frame = page.frameLocator('iframe[data-testid="fair-stand-frame"]');

  const standSummary = frame.locator("summary.panel-summary").filter({ hasText: "Stand Tipi" });
  const uStand = frame.locator('[data-stand-type="u-stand"]');
  const alreadyOpen = await uStand.isVisible().catch(() => false);
  if (!alreadyOpen) {
    await clickFocus(page, standSummary, { strong: true, holdMs: 800 });
  }
  await uStand.waitFor({ state: "visible", timeout: 20000 });

  mark("setup-ready");
  await pause(page, 6500);

  // Stand type: briefly show all alternatives, then choose U Stand.
  for (const type of ["back-wall", "u-stand", "l-left", "l-right", "island"]) {
    await showFocus(page, frame.locator(`[data-stand-type="${type}"]`), { holdMs: 420 });
    await clearFocus(page);
  }
  await clickFocus(page, uStand, { strong: true, holdMs: 800 });
  mark("stand-type-selected");
  await pause(page, 6500);

  await fillFocus(page, frame.locator("#stand-size-x"), "1000");
  await fillFocus(page, frame.locator("#stand-size-y"), "500");
  mark("dimensions-set");
  await pause(page, 10200);

  const floor = frame.locator("#floor-type");
  await selectFocus(page, floor, "karolaj", { holdOpenMs: 1200 });
  mark("floor-selected");
  await pause(page, 7800);

  const depotEnabled = frame.locator("#auto-depot-enabled");
  await clickFocus(page, depotEnabled, { strong: true, holdMs: 700 });
  mark("depot-enabled");
  await pause(page, 3500);

  const depotSize = frame.locator("#auto-depot-size");
  await selectFocus(page, depotSize, "200x100", { holdOpenMs: 1200 });
  mark("depot-size-selected");
  await pause(page, 4700);

  const depotContents = frame.locator("#auto-depot-contents");
  await clickFocus(page, depotContents, { strong: true, holdMs: 700 });
  const depotNote = frame.locator(".muted").filter({ hasText: "Mini Buzdolabı" });
  await showFocus(page, depotNote, { holdMs: 1100 });
  await clearFocus(page);
  mark("depot-contents-selected");
  await pause(page, 6600);

  const createStage = frame.locator("#create-stage");
  await clickFocus(page, createStage, { strong: true, holdMs: 950 });
  mark("create-stage-clicked");

  const projectNameInput = frame.locator('input[name="projectName"]');
  await projectNameInput.waitFor({ state: "visible", timeout: 10000 });
  await pause(page, 3100);
  await fillFocus(page, projectNameInput, "Kyrox Demo Sahne");
  mark("project-name");
  await pause(page, 3600);

  const createProject = frame.getByRole("button", { name: "Projeyi Oluştur", exact: true });
  await clickFocus(page, createProject, { strong: true, holdMs: 850 });

  await frame.locator("#viewport-empty").waitFor({ state: "hidden", timeout: 30000 });
  await frame.locator("#stage-result").filter({ hasText: "U Stand" }).waitFor({ state: "visible", timeout: 30000 });
  mark("scene-created");

  const viewport = frame.locator("#viewport");
  await showFocus(page, viewport, { strong: true, holdMs: 900 });
  await clearFocus(page);
  await pause(page, 12500);

  // Show the automatically created depot contents using the application's real camera shortcuts.
  await viewport.click({ position: { x: 700, y: 400 } });
  await viewport.press("o");
  await pause(page, 500);
  await viewport.press("t");
  await pause(page, 1000);
  mark("depot-top-view");
  await showFocus(page, viewport, { strong: true, holdMs: 900 });
  await clearFocus(page);
  await pause(page, 9000);

  // Return to the normal perspective/home view for the closing shot.
  await viewport.press("h");
  await pause(page, 450);
  await viewport.press("p");
  await pause(page, 900);
  mark("final-home-view");
  await pause(page, 5200);

  console.log("✓ FAIR CRM sahne oluşturma tutorial tamamlandı");
} finally {
  await context.close();

  if (video) {
    await video.saveAs(OUTPUT_FILE);
    console.log(`Video: ${OUTPUT_FILE}`);
  }

  const timeline = {
    scenarioId: "fair-crm-02",
    visualTemplate: "kyrox-orange-v1",
    sourceVideo: path.basename(OUTPUT_FILE),
    durationMs: Date.now() - startedAt,
    events,
  };
  await fs.writeFile(TIMELINE_FILE, JSON.stringify(timeline, null, 2) + "\n", "utf8");
  console.log(`Timeline: ${TIMELINE_FILE}`);

  await browser.close();
}
