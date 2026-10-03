// Choosing one of the three suggested advisors: the other two match cards are hidden (not deleted), the
// chat shows the choice and one sensible follow-up question, and everyone is still in All advisors.
import { test, expect } from "@playwright/test";

const API = "http://api.test";
const MATCHES = [
  { advisor_id: "adv-901", name: "Sofia Ramirez", city: "Miami, FL", meeting_types: ["virtual", "in-person"] },
  { advisor_id: "adv-902", name: "Jordan Ellis", city: "Charlotte, NC", meeting_types: ["virtual"] },
  { advisor_id: "adv-903", name: "Mei Lin", city: "San Diego, CA", meeting_types: ["virtual", "in-person"] },
].map((a, i) => ({ ...a, languages: ["English"], focus: ["first-time home buyers"], bio: `${a.name} bio`, open_slots: 4,
  match_score: 90 - i * 5, fit: "Strong fit", reasons: [{ code: "language", value: "English" }], drivers: ["expertise"],
  disclosure: { fee_model: "Fee-based", platform: "SAM" } }));
const DIRECTORY = [...MATCHES, { ...MATCHES[0], advisor_id: "adv-017", name: "Dana Nguyen", city: "Austin, TX", bio: "Dana Nguyen bio" }];
const OTHERS = (chosen) => MATCHES.filter((m) => m.name !== chosen);

async function fakeBackend(page) {
  const chats = [];
  const made = [];
  await page.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: API, region: "us-east-1", identityPoolId: "" } }));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.parse(route.request().postData() || "{}");
    const json = (data, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, json: data });
    if (path === "/advisors") return json({ advisors: DIRECTORY, total: DIRECTORY.length });
    if (path === "/availability") return json({ date: body.date, times: [{ time: "09:00", label: "9:00 AM", available: true }] });
    if (path === "/chat") {
      chats.push(body);
      if (body.booking) {
        const adv = DIRECTORY.find((a) => a.advisor_id === body.booking.advisor_id);
        const booking = {
          booking_id: `b${String(chats.length).padStart(9, "0")}`, advisor_id: adv.advisor_id, advisor_name: adv.name,
          prospect_name: body.booking.first_name, meeting_date: body.booking.date, meeting_time: body.booking.time,
          time_slot: `${body.booking.date} at 9:00 AM`, status: "booked" };
        made.push(booking);
        return json({ session_id: "sess-1", reply: `You're booked with ${adv.name}.`, booking });
      }
      if (/advisor/i.test(body.message)) return json({ session_id: "sess-1", reply: "Here are three advisors who fit you.", matches: MATCHES });
      return json({ session_id: "sess-1", reply: "Got it." });
    }
    if (path === "/bookings/get") {
      const b = made.find((x) => x.booking_id === body.booking_id);
      return b ? json({ booking: b }) : json({ error: "booking", detail: "gone" }, 404);
    }
    return json({});
  });
  return chats;
}

const visibleMatchNames = (page) => page.locator("#matches .match:visible h3 .name").allInnerTexts();
const userBubbles = (page) => page.locator(".msg.user").allInnerTexts();

async function getMatches(page) {
  await page.goto("/");
  await page.fill("#msg", "Find me an advisor");
  await page.click("#send");
  await expect(page.locator("#matches .match")).toHaveCount(3);
}

async function choose(page, name) {
  await page.locator("#matches .match", { hasText: name }).locator(".choose").click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("cleared")) { localStorage.clear(); sessionStorage.setItem("cleared", "1"); } });
});

for (const chosen of MATCHES.map((m) => m.name)) {
  test(`choosing ${chosen} hides the other two matches`, async ({ page }) => {
    await fakeBackend(page);
    await getMatches(page);
    await choose(page, chosen);
    expect(await visibleMatchNames(page)).toEqual([chosen]);
    await expect(page.locator("#matches .match")).toHaveCount(3); // hidden, not deleted
    await expect(page.locator("#booking-form h3")).toContainText(chosen);
  });

  test(`after choosing ${chosen}, the other two are still in All advisors and can be booked`, async ({ page }) => {
    await fakeBackend(page);
    await getMatches(page);
    await choose(page, chosen);
    await page.click("#tab-directory");
    for (const other of OTHERS(chosen)) {
      const card = page.locator(".dir-card", { hasText: other.name });
      await expect(card).toHaveCount(1);
      await expect(card.locator(".choose")).toBeEnabled();
    }
    const other = OTHERS(chosen)[0];
    await page.locator(".dir-card", { hasText: other.name }).locator(".choose").click();
    await expect(page.locator("#booking-form h3")).toContainText(other.name);
    await page.fill("#bk-name", "Ana");
    await page.click("#bk-submit");
    await expect(page.locator("#booking .booking-card", { hasText: other.name })).toHaveCount(1);
  });
}

test("the chat shows the choice and one follow-up question, without calling the AI", async ({ page }) => {
  const chats = await fakeBackend(page);
  await getMatches(page);
  const before = chats.length;
  const botsBefore = await page.locator(".msg.bot").count();
  await choose(page, "Jordan Ellis");
  expect((await userBubbles(page)).at(-1)).toContain("I'd like to meet with Jordan Ellis");
  await expect(page.locator(".msg.bot")).toHaveCount(botsBefore + 1);
  const followUp = page.locator(".msg.bot").last();
  await expect(followUp).toContainText("Jordan Ellis");
  await expect(followUp).toContainText(/day and time/i);
  await expect(followUp).toContainText(/what you('|’)d like to talk about/i);
  await expect(followUp).not.toContainText(/doesn't exist|does not exist|couldn't find|not available/i);
  await expect(followUp).not.toContainText(/which (one|advisor)/i); // never re-asks who they want
  expect(chats.length).toBe(before);
});

test("choosing the same advisor again doesn't repeat the messages", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Jordan Ellis");
  const users = (await userBubbles(page)).length, bots = await page.locator(".msg.bot").count();
  await page.click("#bk-cancel");
  await choose(page, "Jordan Ellis");
  expect((await userBubbles(page)).length).toBe(users);
  await expect(page.locator(".msg.bot")).toHaveCount(bots);
  await expect(page.locator("#booking-form h3")).toContainText("Jordan Ellis");
});

test("the next chat message tells the AI who was chosen", async ({ page }) => {
  const chats = await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Mei Lin");
  await page.fill("#msg", "Thursday at 3pm works");
  await page.click("#send");
  await expect.poll(() => chats.length).toBeGreaterThan(1);
  expect(chats.at(-1).selected_advisor_id).toBe("adv-903");
});

test('"Show all 3 matches" brings the other two back', async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Sofia Ramirez");
  await page.click("#matches .show-all");
  expect((await visibleMatchNames(page)).sort()).toEqual(MATCHES.map((m) => m.name).sort());
  await choose(page, "Mei Lin");
  expect(await visibleMatchNames(page)).toEqual(["Mei Lin"]);
  expect((await userBubbles(page)).at(-1)).toContain("Mei Lin");
});

test("booking the chosen advisor keeps only that match card", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Jordan Ellis");
  await page.fill("#bk-name", "Ana");
  await page.click("#bk-submit");
  await expect(page.locator("#booking .booking-card", { hasText: "Jordan Ellis" })).toHaveCount(1);
  expect(await visibleMatchNames(page)).toEqual(["Jordan Ellis"]);
});

test("a new set of matches shows all three again", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Jordan Ellis");
  await page.click("#bk-cancel");
  await page.fill("#msg", "Show me other advisors");
  await page.click("#send");
  await expect.poll(() => visibleMatchNames(page)).toHaveLength(3);
});

test("switching language keeps the choice; the follow-up is in the chosen language", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await page.click("[data-lang=es]");
  await choose(page, "Sofia Ramirez");
  await expect(page.locator(".msg.user").last()).toContainText("Me gustaría reunirme con Sofia Ramirez");
  await expect(page.locator(".msg.bot").last()).toContainText(/fecha y (una )?hora/i);
  await page.click("[data-lang=en]");
  expect(await visibleMatchNames(page)).toEqual(["Sofia Ramirez"]);
});

// ---------- the choice is not saved in the browser: a refresh resets it ----------
const savedText = (page) => page.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join("\n"));

async function reload(page) {
  await page.reload();
  await expect(page.locator(".msg.bot").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("refresh after choosing: the choice is reset and nothing stays hidden", async ({ page }) => {
  const chats = await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Jordan Ellis");
  expect(await visibleMatchNames(page)).toEqual(["Jordan Ellis"]);
  const saved = await savedText(page);
  expect(saved).not.toContain("Jordan Ellis");
  expect(saved).not.toContain("adv-902");

  await reload(page);
  await expect(page.locator("#matches .match")).toHaveCount(0);
  await expect(page.locator(".chosen-label, #matches .show-all, #booking-form")).toHaveCount(0);
  expect((await userBubbles(page)).join(" ")).not.toContain("Jordan Ellis");

  const before = chats.length;
  await page.fill("#msg", "Find me an advisor");
  await page.click("#send");
  await expect(page.locator("#matches .match")).toHaveCount(3);
  expect((await visibleMatchNames(page)).sort()).toEqual(MATCHES.map((m) => m.name).sort());
  expect(chats.slice(before).every((c) => !c.selected_advisor_id)).toBe(true);
});

test("refresh after booking: the booking stays, the choice is reset", async ({ page }) => {
  const chats = await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Mei Lin");
  await page.fill("#bk-name", "Ana");
  await page.click("#bk-submit");
  await expect(page.locator("#booking .booking-card", { hasText: "Mei Lin" })).toHaveCount(1);

  await reload(page);
  await expect(page.locator("#booking .booking-card", { hasText: "Mei Lin" })).toHaveCount(1);
  await expect(page.locator(".chosen-label, #matches .show-all")).toHaveCount(0);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("advisor-match.booking")));
  expect(Object.keys(saved).sort()).toEqual(["bookings", "sessionId"]);  // only the booking is saved, no choice

  const before = chats.length;
  await page.fill("#msg", "Find me an advisor");
  await page.click("#send");
  await expect.poll(() => visibleMatchNames(page)).toHaveLength(3);
  expect(chats.slice(before).every((c) => !c.selected_advisor_id)).toBe(true);
});

test("a choice in one tab doesn't carry over to a new tab", async ({ page, context }) => {
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Sofia Ramirez");
  const tab = await context.newPage();
  await fakeBackend(tab);
  await getMatches(tab);
  expect((await visibleMatchNames(tab)).sort()).toEqual(MATCHES.map((m) => m.name).sort());
  await expect(tab.locator(".chosen-label")).toHaveCount(0);
});

test("choosing still works when browser storage is blocked", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  await fakeBackend(page);
  await getMatches(page);
  await choose(page, "Jordan Ellis");
  expect(await visibleMatchNames(page)).toEqual(["Jordan Ellis"]);
  await page.click("#matches .show-all");
  await expect.poll(() => visibleMatchNames(page)).toHaveLength(3);
  expect(errors).toEqual([]);
});
