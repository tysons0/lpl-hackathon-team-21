// Every advisor shown in the app can be booked: "Ask to meet" on each All advisors card and "Choose this
// advisor" on each match card open the booking form for that exact person and send their advisor_id.
import { test, expect } from "@playwright/test";

const API = "http://api.test";
const ADVISORS = [
  { advisor_id: "adv-901", name: "Sofia Ramirez", city: "Miami, FL", languages: ["English", "Spanish"], meeting_types: ["virtual", "in-person"], focus: ["first-time home buyers"], open_slots: 5 },
  { advisor_id: "adv-902", name: "Jordan Ellis", city: "Charlotte, NC", languages: ["English"], meeting_types: ["virtual"], focus: ["student loan payoff"], open_slots: 4 },
  { advisor_id: "adv-903", name: "Mei Lin", city: "San Diego, CA", languages: ["English", "Mandarin"], meeting_types: ["virtual"], focus: ["first-time home buyers"], open_slots: 5 },
  { advisor_id: "adv-017", name: "Dana Nguyen", city: "Austin, TX", languages: ["English"], meeting_types: ["in-person"], focus: ["small business owners"], open_slots: 2 },
].map((a) => ({ ...a, bio: `${a.name} bio`, disclosure: { fee_model: "Fee-based", platform: "SAM" } }));

const TIMES = ["09:00", "09:30", "10:00"].map((t) => ({ time: t, label: t, available: true }));

async function fakeBackend(page) {
  const bookings = [];
  const made = [];
  await page.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: API, region: "us-east-1", identityPoolId: "" } }));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.parse(route.request().postData() || "{}");
    const json = (data, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, json: data });
    if (path === "/advisors") return json({ advisors: ADVISORS, total: ADVISORS.length });
    if (path === "/availability") return json({ date: body.date, times: TIMES });
    if (path === "/chat" && body.booking) {
      const adv = ADVISORS.find((a) => a.advisor_id === body.booking.advisor_id);
      if (!adv) return json({ error: "unknown advisor", detail: "We couldn't find that advisor." }, 404);
      bookings.push(body.booking);
      const booking = { booking_id: `b${String(made.length + 1).padStart(9, "0")}`, advisor_id: adv.advisor_id, advisor_name: adv.name, prospect_name: body.booking.first_name,
        meeting_date: body.booking.date, meeting_time: body.booking.time, time_slot: `${body.booking.date} at 9:00 AM`, status: "booked" };
      made.push({ ...booking });
      return json({ session_id: "sess-1", reply: `You're booked with ${adv.name}.`, booking });
    }
    if (path === "/chat") {
      const matches = ADVISORS.slice(0, 3).map((a, i) => ({ ...a, match_score: 90 - i * 5, fit: "Strong fit", reasons: [], drivers: [] }));
      return json({ session_id: "sess-1", reply: "Here are three advisors who fit you.", matches });
    }
    if (path === "/bookings/cancel") {
      const b = made.find((x) => x.booking_id === body.booking_id);
      b.status = "cancelled";
      return json({ booking: { ...b } });
    }
    if (path === "/bookings/get") {
      const b = made.find((x) => x.booking_id === body.booking_id);
      return b ? json({ booking: { ...b } }) : json({ error: "booking", detail: "gone" }, 404);
    }
    return json({});
  });
  return bookings;
}

async function bookFromOpenForm(page, expectedName) {
  const form = page.locator("#booking-form");
  await expect(form.locator("h3")).toContainText(expectedName);
  await expect(page.locator("#bk-time option")).toHaveCount(TIMES.length);
  await page.fill("#bk-name", "Ana");
  await page.click("#bk-submit");
  await expect(page.locator("#booking .booking-card", { hasText: expectedName })).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  // Start each test with nothing saved (only on the first load, so reloads keep what the test saved).
  await page.addInitScript(() => { if (!sessionStorage.getItem("cleared")) { localStorage.clear(); sessionStorage.setItem("cleared", "1"); } });
});

for (const advisor of ADVISORS) {
  test(`All advisors: "Ask to meet" books ${advisor.name}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const bookings = await fakeBackend(page);
    await page.goto("/");
    await page.click("#tab-directory");
    const card = page.locator(".dir-card", { hasText: advisor.name });
    await expect(card).toHaveCount(1);
    await card.locator(".choose").click();
    await bookFromOpenForm(page, advisor.name);
    expect(bookings.map((b) => b.advisor_id)).toEqual([advisor.advisor_id]);
    await expect(page.locator(".msg.bot").last()).not.toContainText(/doesn't exist|does not exist|couldn't find/i);
    expect(errors).toEqual([]);
  });
}

test("every name in All advisors comes from the advisor list", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await page.click("#tab-directory");
  await expect(page.locator(".dir-card")).toHaveCount(ADVISORS.length);
  const shown = await page.locator(".dir-card h3").allInnerTexts();
  expect(shown.map((s) => s.trim()).sort()).toEqual(ADVISORS.map((a) => a.name).sort());
});

test('match cards: "Choose this advisor" books each suggested advisor', async ({ page }) => {
  const bookings = await fakeBackend(page);
  await page.goto("/");
  await page.fill("#msg", "I'm new to investing");
  await page.click("#send");
  await expect(page.locator(".match")).toHaveCount(3);
  for (const advisor of ADVISORS.slice(0, 3)) {
    if (await page.locator("#matches .show-all").count()) await page.click("#matches .show-all");  // choosing hides the others
    await page.locator(".match", { hasText: advisor.name }).locator(".choose").click();
    await bookFromOpenForm(page, advisor.name);
  }
  expect(bookings.map((b) => b.advisor_id)).toEqual(ADVISORS.slice(0, 3).map((a) => a.advisor_id));
});

test("two bookings show as two cards; cancelling one leaves the other, also after a reload", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await page.click("#tab-directory");
  for (const name of ["Sofia Ramirez", "Dana Nguyen"]) {
    await page.click("#tab-directory");
    await page.locator(".dir-card", { hasText: name }).locator(".choose").click();
    await bookFromOpenForm(page, name);
  }
  const cards = page.locator("#booking .booking-card");
  await expect(cards).toHaveCount(2);

  const sofia = cards.filter({ hasText: "Sofia Ramirez" });
  await sofia.locator(".bk-cancel-meeting").click();
  await expect(sofia.locator(".bk-confirm")).toBeVisible();
  await sofia.locator(".bk-keep").click();
  await expect(cards).toHaveCount(2);
  await sofia.locator(".bk-cancel-meeting").click();
  await sofia.locator(".bk-yes-cancel").click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Dana Nguyen");
  await expect(page.locator("#booking-announcement")).toContainText(/cancelled/i);

  await page.reload();
  await expect(page.locator(".msg.bot").first()).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Dana Nguyen");
});
