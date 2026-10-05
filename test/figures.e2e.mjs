// End-to-end check of question and option figures in page.html against a real `serve`.
//   PLAYWRIGHT_PKG=/path/to/@playwright/test/index.mjs [CHROMIUM=/usr/bin/chromium] node test/figures.e2e.mjs
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PKG || "@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, "..", "server.mjs");
const home = mkdtempSync(join(tmpdir(), "grill-fig-home-"));
const env = { ...process.env, GRILL_HOME: home };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { session } = JSON.parse(execFileSync(process.execPath, [SERVER, "new", "--topic", "Figures topic"], { encoding: "utf8", env, cwd: mkdtempSync(join(tmpdir(), "grill-fig-proj-")) }));
const patch = (body) => execFileSync(process.execPath, [SERVER, "patch", "--session", session], { input: JSON.stringify(body), encoding: "utf8", env });
mkdirSync(join(session, "figures"));

// A figure: its own colour scheme, a height report like figure-brief.md asks for, and a probe
// that records whether the sandbox kept it away from the page that holds it.
const figure = (label, h, bg = "#fff", darkBg = "#14181f") => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>:root{--bg:${bg};--fg:#111}@media (prefers-color-scheme: dark){:root{--bg:${darkBg};--fg:#eee}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px system-ui}.box{height:${h}px;padding:12px}</style>
<div class="box" id="box">${label}</div>
<script>
(function () {
  try { void parent.document.title; document.body.dataset.sandbox = "leaked"; } catch (e) { document.body.dataset.sandbox = "contained"; }
  function post() {
    var b = document.body, c = getComputedStyle(b);
    parent.postMessage({ grillFigureHeight: b.getBoundingClientRect().height + parseFloat(c.marginTop) + parseFloat(c.marginBottom) }, "*");
  }
  addEventListener("load", post); addEventListener("resize", post);
})();
</script>`;
writeFileSync(join(session, "figures", "q1-A.html"), figure("Mockup A", 380));
writeFileSync(join(session, "figures", "q1-B.html"), figure("Mockup B", 380));
writeFileSync(join(session, "figures", "q2.html"), figure("Diagram", 200));
writeFileSync(join(session, "figures", "q1-B-v2.html"), figure("Mockup B again", 380));

patch({ agent: { status: "waiting", handled: 0 }, questions: [
  { id: "q1", round: 1, title: "Where does the filter bar go?", body: "Layout of the list page.", options: [{ k: "A", text: "Above the list", figure: { kind: "mockup", file: "figures/q1-A.html", alt: "bar above" } }, { k: "B", text: "In a left rail", figure: { kind: "mockup", drawing: true } }, { k: "C", text: "Floating" }], rec: { option: "A", why: "Fewer clicks." } },
  { id: "q2", round: 1, title: "Which service owns the retry queue?", body: "Data flow.", figure: { kind: "diagram", file: "figures/q2.html", alt: "services and queue" }, options: [{ k: "A", text: "Worker" }, { k: "B", text: "API" }], rec: { option: "A", why: "Fewer hops." } },
  { id: "q3", round: 1, title: "What do we call a saved filter?", body: "Wording.", options: [{ k: "A", text: "View" }, { k: "B", text: "Preset" }], rec: { option: "A", why: "Short." } },
] });

const child = spawn(process.execPath, [SERVER, "serve", "--session", session], { env, stdio: ["ignore", "pipe", "inherit"] });
const url = await new Promise((res) => { let b = ""; child.stdout.on("data", (d) => { b += d; if (b.includes("\n")) res(JSON.parse(b.split("\n")[0]).url); }); });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(m.text() + " " + m.location().url); });
page.on("pageerror", (e) => errors.push(String(e)));
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(ok ? "ok  " : "FAIL", name, ok ? "" : extra); };
const select = async (id) => { await page.locator(".item", { hasText: id.toUpperCase() }).first().click(); await page.locator("article.card").waitFor(); };
const frameOf = (name) => page.frames().find((f) => f.url().includes("/figure/" + name));
const shot = process.env.SHOT_DIR;
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(50); } };

try {
  await page.goto(url);
  await page.locator(".item").first().waitFor();
  await select("q1");
  await page.locator(".fig-frame iframe").first().waitFor();
  const frames = page.locator(".fig-frame iframe");
  check("q1: one frame for the option with a landed figure, a placeholder for the pending one", (await frames.count()) === 1 && (await page.locator(".fig-wait").count()) === 1);
  check("q1: the written options all remain", (await page.locator(".opt").count()) === 3 && (await page.locator(".opts").textContent()).includes("Above the list"));
  check("figure frame is sandboxed with scripts only", (await frames.first().getAttribute("sandbox")) === "allow-scripts");
  await page.waitForFunction(() => document.querySelector(".fig-frame iframe").style.height === "404px");
  check("the figure's reported height sizes its frame", true);
  const f = frameOf("q1-A.html");
  check("a figure cannot reach the page that holds it", f && (await f.locator("body").getAttribute("data-sandbox")) === "contained");
  // the pending figure lands without a page reload
  await page.evaluate(() => { window.__same = true; });
  patch({ questions: [{ id: "q1", options: [{ k: "A", text: "Above the list" }, { k: "B", text: "In a left rail", figure: { kind: "mockup", file: "figures/q1-B.html", alt: "rail" } }, { k: "C", text: "Floating" }] }] });
  await page.waitForFunction(() => document.querySelectorAll(".fig-frame iframe").length === 2);
  await until(() => frameOf("q1-A.html") && frameOf("q1-B.html"));
  check("q1: option A kept its figure when the options were restated without it; B's landed in place of the placeholder",
    (await page.locator(".fig-wait").count()) === 0 && !!frameOf("q1-A.html") && !!frameOf("q1-B.html") && (await page.evaluate(() => window.__same === true)));
  const [a, b] = await Promise.all([page.locator(".fig").nth(0).boundingBox(), page.locator(".fig").nth(1).boundingBox()]);
  check("two option figures sit side by side at desktop width", Math.abs(a.y - b.y) < 2 && b.x > a.x + a.width - 2);
  if (shot) await page.screenshot({ path: join(shot, "q1-desktop.png") });
  // Open larger
  await page.locator(".fig-open").first().click();
  await page.locator("#fig-dialog[open]").waitFor();
  check("Open larger shows the figure in a dialog", (await page.locator("#fig-dialog-frame").getAttribute("src")).startsWith("/figure/q1-A.html"));
  const box = await page.locator("#fig-dialog").boundingBox();
  check("the larger view is larger than the inline figure", box.width > a.width * 1.5);
  await page.keyboard.press("Escape");
  const closed = await until(async () => !(await page.locator("#fig-dialog").evaluate((d) => d.open)) && !(await page.locator("#fig-dialog-frame").getAttribute("src")));
  check("Escape closes the larger view and drops its source", !!closed);
  // question figure
  await select("q2");
  await page.locator(".fig-q iframe").waitFor();
  await page.waitForFunction(() => document.querySelector(".fig-q iframe").style.height === "224px");
  check("a figure shorter than the default frame shrinks its frame", true);
  check("q2: the question's own figure sits above the options", (await page.locator(".fig-q").boundingBox()).y < (await page.locator(".opts").boundingBox()).y);
  // none
  await select("q3");
  check("q3: a wording question has no figure and no placeholder", (await page.locator(".fig, .fig-wait").count()) === 0 && !(await page.locator("article.card").getAttribute("class")).includes("has-figs"));
  // a layout question asked with no figure stays bare until Explore deeper marks one
  patch({ questions: [{ id: "q4", round: 2, title: "Where does the sort control go?", body: "Layout of the list page.", options: [{ k: "A", text: "In the header" }, { k: "B", text: "Beside each column" }], rec: { option: "A", why: "One place." } }] });
  await select("q4");
  check("q4: a layout question asked with no figure shows no figure and no placeholder", (await page.locator(".fig, .fig-wait").count()) === 0);
  patch({ questions: [{ id: "q4", explore: { rows: [{ option: "A", pros: ["One place", "Fewer clicks"], cons: ["Far from the data"] }, { option: "B", pros: ["Near the data", "Clear"], cons: ["Repeats", "Noisy"] }] }, options: [{ k: "A", text: "In the header", figure: { kind: "mockup", drawing: true } }, { k: "B", text: "Beside each column", figure: { kind: "mockup", drawing: true } }] }] });
  await page.locator(".fig-wait").first().waitFor();
  check("q4: explore marks a figure per option and the page shows a placeholder for each", (await page.locator(".fig-wait").count()) === 2);
  writeFileSync(join(session, "figures", "q4-A.html"), figure("Sort in header", 300));
  writeFileSync(join(session, "figures", "q4-B.html"), figure("Sort per column", 300));
  patch({ questions: [{ id: "q4", options: [{ k: "A", text: "In the header", figure: { kind: "mockup", file: "figures/q4-A.html", alt: "sort in header" } }, { k: "B", text: "Beside each column", figure: { kind: "mockup", file: "figures/q4-B.html", alt: "sort per column" } }] }] });
  await page.locator(".fig-frame iframe").nth(1).waitFor();
  check("q4: both figures replace their placeholders without a reload", (await page.locator(".fig-frame iframe").count()) === 2 && (await page.locator(".fig-wait").count()) === 0);
  // theme
  await select("q1");
  await page.locator(".fig-frame iframe").first().waitFor();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(150);
  const bg = async () => frameOf("q1-A.html").evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(150);
  check("a figure follows the system colour scheme", dark !== (await bg()), `${dark}`);
  // phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const [pa, pb] = await Promise.all([page.locator(".fig").nth(0).boundingBox(), page.locator(".fig").nth(1).boundingBox()]);
  check("phone width: no horizontal scroll, figures stack, each fits the screen", overflow <= 0 && pb.y > pa.y + pa.height - 2 && pa.width <= 390 && pb.width <= 390, `overflow ${overflow}`);
  if (shot) await page.screenshot({ path: join(shot, "q1-phone.png"), fullPage: true });
  // redraw: same file, new at -> frame reloads
  const before = await page.locator(".fig-frame iframe").first().getAttribute("src");
  await sleep(1100);
  patch({ questions: [{ id: "q1", options: [{ k: "A", text: "Above the list", figure: { kind: "mockup", file: "figures/q1-A.html", alt: "bar above" } }, { k: "B", text: "In a left rail", figure: null }, { k: "C", text: "Floating" }] }] });
  await page.waitForFunction((s) => document.querySelector(".fig-frame iframe").getAttribute("src") !== s, before);
  check("a figure patched again reloads its frame; an option restated with figure null drops it", (await page.locator(".fig-frame iframe").count()) === 1);
  check("no console or page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("test ran to the end", false, String(e && e.stack || e));
} finally {
  await browser.close();
  child.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
