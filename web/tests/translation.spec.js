// Switching to Spanish or Chinese translates everything on every tab: the top bar, every page, advisor data
// (focus areas, fees, bios, fit labels, meeting types), buttons, labels and screen-reader text. Only the
// language picker itself keeps showing English / Español / 中文.
import { test, expect } from "@playwright/test";
import fs from "fs";
import { T } from "../src/i18n.js";
import { DATA, trData, trBio, SEED_TEXT } from "../src/i18n-data.js";

const API = "http://api.test";
const ADVISORS = JSON.parse(fs.readFileSync(new URL("./fixtures/advisors.json", import.meta.url)))
  .map(({ embedding, ...a }) => ({ ...a, disclosure: { fee_model: a.fee_model, platform: a.platform } }));
const LANGS = ["es", "zh"];

// ---------- 1. dictionaries are complete ----------
function shape(v) { return typeof v === "object" ? Object.keys(v).sort() : typeof v; }

test("every interface text exists in Spanish and Chinese", () => {
  for (const lang of LANGS) {
    const missing = Object.keys(T.en).filter((k) => !(k in T[lang]));
    expect(missing, `${lang} is missing`).toEqual([]);
    for (const k of Object.keys(T.en)) expect(shape(T[lang][k]), `${lang}.${k}`).toEqual(shape(T.en[k]));
  }
});

test("translations are not just copies of the English text", () => {
  const sameOk = new Set(["howEyebrow"]); // the product name
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(T.en)) {
      if (typeof v !== "string" || sameOk.has(k) || v.split(" ").length < 2) continue;
      expect(T[lang][k], `${lang}.${k}`).not.toBe(v);
    }
  }
});

test("every advisor data value in seed/seed.py has a Spanish and Chinese translation", () => {
  const values = [...SEED_TEXT.focus, ...SEED_TEXT.fees, ...SEED_TEXT.platforms, "Strong fit", "Good fit", "Ask your advisor"];
  for (const lang of LANGS) {
    for (const v of values) expect(trData(v, lang), `${lang}: ${v}`).not.toBe(v);
  }
  // and the list in i18n-data.js really matches what seed.py generates
  const seed = fs.readFileSync(new URL("../../seed/seed.py", import.meta.url), "utf8");
  for (const v of [...SEED_TEXT.focus, ...SEED_TEXT.fees, ...SEED_TEXT.platforms]) expect(seed).toContain(`"${v}"`);
  for (const a of ADVISORS) {
    for (const f of a.focus) expect(SEED_TEXT.focus).toContain(f);
    expect(SEED_TEXT.fees).toContain(a.fee_model);
    expect(SEED_TEXT.platforms).toContain(a.platform);
  }
});

test("every advisor bio is translated", () => {
  for (const lang of LANGS) {
    for (const a of ADVISORS) {
      const out = trBio(a.bio, lang);
      expect(out, `${lang} bio of ${a.name}`).not.toBe(a.bio);
      expect(out).not.toMatch(/Works mostly with|Plain-language|Specializes|Bilingual \(/);
    }
  }
  expect(trBio("Something new nobody translated.", "es")).toBe("Something new nobody translated."); // safe fallback
  expect(Object.keys(DATA.es).sort()).toEqual(Object.keys(DATA.zh).sort());
});

// ---------- 2. the whole page, every tab, has no English left ----------
const BOOKING = {
  booking_id: "a1b2c3d4e5", advisor_id: "adv-901", advisor_name: "Sofia Ramirez", prospect_name: "Ana",
  meeting_date: "2030-10-08", meeting_time: "15:00", time_slot: "Tue, Oct 8, 2030 at 3:00 PM", meeting_purpose: "",
  status: "booked", crm_status: "synced", created_at: "2030-10-01T10:00:00Z", session_id: "sess-1",
  briefing: { goals: "Buy a home", worries: "Fees", topics_to_explain: "Fiduciary", communication_preferences: "Virtual" },
};
const TRANSLATED = { es: "(texto traducido)", zh: "（已翻译的内容）", en: "translated text" };

async function fakeBackend(page) {
  const calls = { translate: [] };
  await page.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: API, region: "us-east-1", identityPoolId: "" } }));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.parse(route.request().postData() || "{}");
    const json = (d, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, json: d });
    if (path === "/advisors") return json({ advisors: ADVISORS, total: ADVISORS.length });
    if (path === "/availability") return json({ date: body.date, times: [{ time: "09:00", label: "9:00 AM", available: true }, { time: "11:00", label: "11:00 AM", available: true }, { time: "15:30", label: "3:30 PM", available: false }] });
    if (path === "/translate") { calls.translate.push(body); return json({ text: TRANSLATED[body.lang], lang: body.lang }); }
    if (path === "/bookings") return json({ bookings: [BOOKING, { ...BOOKING, booking_id: "b2c3d4e5f6", status: "cancelled", crm_status: "pending" }] });
    if (path === "/bookings/get") return json({ booking: BOOKING });
    if (path === "/metrics") return json({ range: body.range, start_date: "2030-10-01", end_date: "2030-10-31",
      funnel: { intake_started: 10, matched: 8, booked: 1, briefing_sent: 1, pii_blocked: 1, guardrail_blocked: 2 } });
    if (path === "/insights") return json({ recommendations: [
      { id: "conversion", priority: "high", title: "Improve match-to-meeting conversion", body: "x", metric: "conversion = 13%", values: { conversion: 13 } },
      { id: "handoff", priority: "medium", title: "Close the advisor handoff loop", body: "x", metric: "briefing rate = 13%", values: { rate: 13 } },
      { id: "prove", priority: "medium", title: "Make the value easy to prove", body: "x", metric: "8 matches observed", values: { matched: 8 } }] });
    if (path === "/chat") return json({ session_id: "sess-1", reply: TRANSLATED[body.lang === "Spanish" ? "es" : body.lang === "Mandarin" ? "zh" : "en"],
      matches: ADVISORS.slice(0, 3).map((a, i) => ({ ...a, match_score: 90 - i * 7, fit: i ? "Good fit" : "Strong fit", drivers: ["expertise", "language"],
        reasons: [{ code: "language", value: "English" }, { code: "meeting", value: "virtual" }, { code: "focus", value: a.focus[0] }, { code: "availability", value: 3 }] })) });
    return json({});
  });
  return calls;
}

async function setLanguage(page, lang) {
  const opt = page.locator(`.language-option[data-lang=${lang}]`);
  if (!(await opt.isVisible())) await page.click("#settings-toggle");
  await opt.click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

// Text the user can see or a screen reader can hear, excluding chat bubbles (checked separately).
const collectText = (page) => page.evaluate(() => {
  const out = [];
  const shown = (el) => el && !el.closest("[hidden], .msg, script, style") && getComputedStyle(el).display !== "none";
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const t = walk.currentNode.nodeValue.replace(/\s+/g, " ").trim();
    if (t && shown(walk.currentNode.parentElement)) out.push(t);
  }
  for (const el of document.querySelectorAll("[placeholder], [aria-label], [title], option")) {
    if (!shown(el) && el.tagName !== "OPTION") continue;
    if (el.tagName === "OPTION" && el.closest("[hidden]")) continue;
    for (const a of ["placeholder", "aria-label", "title"]) if (el.getAttribute(a)) out.push(el.getAttribute(a));
    if (el.tagName === "OPTION") out.push(el.textContent.trim());
  }
  return out;
});

// Proper nouns and codes that stay as they are in every language.
const KEEP = new Set(["Advisor Match", "AM", "English", "Español", "中文", "A", "A+", "A++", "Ana", "CRM", "CSV", "UTC", "CRS", "Form CRS",
  "SAM", "MWP", "ClientWorks", "Morgan Stanley", "Google", "FINRA", "IA", "AI", "Q1", "Q2", "Q3", "Q4", "PM", "AM"]);
for (const a of ADVISORS) { KEEP.add(a.name); for (const w of a.name.split(" ")) KEEP.add(w); KEEP.add(a.city); for (const w of a.city.split(/[ ,]+/)) KEEP.add(w); }

const ENGLISH = /\b(the|and|with|your|you|of|for|is|are|this|that|from|how|what|will|be|meeting|meetings|advisor|advisors|clients|year|month|today|matches|choose|book|change|cancel|fee|fees|first|home|buyers|investors|loans?|saving|business|owners|parents|families|teachers|military|employees|equity|estate|income|plain-language|patient|works|mostly|based|only|managed|annual|assets|download|range|quarter|january|february|march|april|may|june|july|august|september|october|november|december|daily|hide|show|chat|strong|good|fit|accepting|slots?|more|less|ask|prototype|fictional|advice|next|settings|views|open|report|period|synced|goals|worries|explain|simply|prefer|briefed|booked|started|intake|carried|blocked|guardrail|interventions?|illustrative|model|opportunity|delivered|rate|sent|calendar|skip|content|portrait|illustrated|language|size|speaking|message|send|search|any|refresh|new|prospects?|cancelled|taken|pick|date|time|optional|share|talk|about)\b/i;

function leftovers(texts, lang) {
  return [...new Set(texts)].filter((t) => {
    let rest = t;
    for (const k of [...KEEP].sort((x, y) => y.length - x.length)) rest = rest.split(k).join(" ");
    return lang === "zh" ? /[A-Za-z]{3,}/.test(rest) : ENGLISH.test(rest);
  });
}

async function visitEverything(page) {
  const texts = [];
  const grab = async () => texts.push(...(await collectText(page)));
  await page.fill("#msg", "hola");
  await page.click("#send");
  await expect(page.locator("#matches .match")).toHaveCount(3);
  await grab();
  await page.locator("#matches .match .more").first().click();
  await grab();
  await page.locator("#matches .match .choose").first().click();
  await expect(page.locator("#booking-form")).toBeVisible();
  await expect(page.locator("#bk-time option")).toHaveCount(3);
  await grab();
  await page.fill("#bk-name", "Ana");
  await page.locator("#bk-cancel").click();
  await page.click("#tab-directory");
  await expect(page.locator(".dir-card")).toHaveCount(ADVISORS.length);
  await grab();
  await page.click("#tab-advisor");
  await expect(page.locator("#bookings .bk")).toHaveCount(2);
  const shown = await page.evaluate(() => document.documentElement.lang);
  if (shown !== "en") await expect(page.locator("#bookings")).toContainText(TRANSLATED[shown]);
  else await expect(page.locator("#bookings")).toContainText("Buy a home"); // English: the briefing as written
  await grab();
  await page.click("#tab-dashboard");
  await expect(page.locator("#funnel .frow")).toHaveCount(4);
  await expect(page.locator("#recommendations .recommendation")).toHaveCount(3);
  await grab();
  for (const range of ["quarter", "custom"]) { await page.selectOption("#metrics-range", range); await grab(); }
  return texts;
}

for (const lang of LANGS) {
  test(`${lang}: no English left anywhere on any tab`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fakeBackend(page);
    await page.goto("/");
    await setLanguage(page, lang);
    const texts = await visitEverything(page);
    expect(texts.length).toBeGreaterThan(150);
    expect(leftovers(texts, lang)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${lang}: switching language after everything is on screen translates it too`, async ({ page }) => {
    await fakeBackend(page);
    await page.goto("/");
    const texts = await visitEverything(page); // visit everything in English first
    expect(leftovers(texts, lang).length).toBeGreaterThan(20); // sanity: the English page really is English
    await page.click("#tab-investor");
    await setLanguage(page, lang);
    const after = [];
    for (const tab of ["investor", "directory", "advisor", "dashboard"]) {
      await page.click(`#tab-${tab}`);
      await page.waitForLoadState("networkidle");
      after.push(...(await collectText(page)));
    }
    expect(leftovers(after, lang)).toEqual([]);
  });

  test(`${lang}: the language picker keeps its own names`, async ({ page }) => {
    await fakeBackend(page);
    await page.goto("/");
    await setLanguage(page, lang);
    expect(await page.locator(".language-option").allInnerTexts()).toEqual(["English", "Español", "中文"]);
  });

  test(`${lang}: greeting and app messages switch locally; AI replies go through /translate`, async ({ page }) => {
    const calls = await fakeBackend(page);
    await page.goto("/");
    await expect(page.locator(".msg.bot").first()).toContainText(T.en.greeting.slice(0, 20));
    await setLanguage(page, lang);
    await expect(page.locator(".msg.bot").first()).toContainText(T[lang].greeting.slice(0, 10));
    expect(calls.translate.filter((c) => c.text === T.en.greeting)).toEqual([]); // no AI call for our own text
  });

  test(`${lang}: advisor briefings are translated once and cached`, async ({ page }) => {
    const calls = await fakeBackend(page);
    await page.goto("/");
    await setLanguage(page, lang);
    await page.click("#tab-advisor");
    await expect(page.locator("#bookings")).toContainText(TRANSLATED[lang]);
    const first = calls.translate.length;
    expect(calls.translate.map((c) => c.text)).toEqual(expect.arrayContaining(["Buy a home", "Fees", "Fiduciary", "Virtual"]));
    await page.click("#tab-investor");
    await page.click("#tab-advisor");
    await expect(page.locator("#bookings")).toContainText(TRANSLATED[lang]);
    expect(calls.translate.length).toBe(first);
  });
}

test("switching language with the booking form open translates it and keeps what was typed", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await page.fill("#msg", "hola");
  await page.click("#send");
  await page.locator("#matches .match .choose").first().click();
  await expect(page.locator("#bk-time option")).toHaveCount(3);
  const time = await page.locator("#bk-time option:not([disabled])").last().getAttribute("value");
  await page.fill("#bk-name", "Ana");
  await page.selectOption("#bk-time", time);
  await page.fill("#bk-purpose", "Plan for a first home");
  const date = await page.inputValue("#bk-date");
  await setLanguage(page, "es");
  await expect(page.locator("#booking-form h3")).toContainText(T.es.bookTitle("").trim().split(" ")[0]);
  await expect(page.locator("#bk-submit")).toHaveText(T.es.bkSubmit);
  await expect(page.locator("#bk-time")).toHaveValue(time);
  expect(await page.inputValue("#bk-name")).toBe("Ana");
  expect(await page.inputValue("#bk-date")).toBe(date);
  expect(await page.inputValue("#bk-purpose")).toBe("Plan for a first home");
});

test("switching back to English restores English text", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await setLanguage(page, "zh");
  await setLanguage(page, "en");
  await expect(page.locator("#tab-investor")).toHaveText(T.en.tabInvestor);
  await expect(page.locator("#tab-dashboard")).toHaveText(T.en.tabDashboard);
  await expect(page.locator(".foot")).toHaveText(T.en.footer);
  await page.click("#tab-directory");
  await expect(page.locator(".dir-card").first()).toContainText(/Accepting new clients|Not accepting/);
});
