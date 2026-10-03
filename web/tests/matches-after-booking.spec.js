// After a meeting is booked, the three suggested matches are no longer shown: the panel becomes
// "Your meeting". They come back if every meeting is cancelled, or when the chat finds new matches.
import { test, expect } from "@playwright/test";
import { T } from "../src/i18n.js";

const API = "http://api.test";
const MATCHES = [
  { advisor_id: "adv-901", name: "Sofia Ramirez", city: "Miami, FL", meeting_types: ["virtual", "in-person"] },
  { advisor_id: "adv-902", name: "Jordan Ellis", city: "Charlotte, NC", meeting_types: ["virtual"] },
  { advisor_id: "adv-903", name: "Mei Lin", city: "San Diego, CA", meeting_types: ["virtual", "in-person"] },
].map((a, i) => ({ ...a, languages: ["English"], focus: ["first-time home buyers"], bio: `${a.name} bio`, open_slots: 4,
  match_score: 90 - i * 5, fit: "Strong fit", reasons: [{ code: "language", value: "English" }], drivers: ["expertise"],
  disclosure: { fee_model: "Fee-based", platform: "SAM" } }));
const NEW_MATCHES = [
  { ...MATCHES[0], advisor_id: "adv-017", name: "Dana Nguyen", city: "Austin, TX", bio: "Dana Nguyen bio" },
  { ...MATCHES[1], advisor_id: "adv-018", name: "Omar Patel", city: "Boston, MA", bio: "Omar Patel bio" },
  { ...MATCHES[2], advisor_id: "adv-019", name: "Grace Rivera", city: "Austin, TX", bio: "Grace Rivera bio" },
];
const DIRECTORY = [...MATCHES, ...NEW_MATCHES];

async function fakeBackend(page, { failBooking = false } = {}) {
  const made = [];
  await page.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: API, region: "us-east-1", identityPoolId: "" } }));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.parse(route.request().postData() || "{}");
    const json = (data, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, json: data });
    const book = (adv, first, date, time) => {
      const booking = { booking_id: `b${String(made.length + 1).padStart(9, "0")}`, advisor_id: adv.advisor_id, advisor_name: adv.name,
        prospect_name: first, meeting_date: date, meeting_time: time, time_slot: `${date} at ${time}`, status: "booked" };
      made.push(booking);
      return booking;
    };
    if (path === "/advisors") return json({ advisors: DIRECTORY, total: DIRECTORY.length });
    if (path === "/availability") return json({ date: body.date, times: [{ time: "09:00", label: "9:00 AM", available: true }] });
    if (path === "/bookings/get") {
      const b = made.find((x) => x.booking_id === body.booking_id);
      return b ? json({ booking: b }) : json({ error: "booking", detail: "gone" }, 404);
    }
    if (path === "/bookings/cancel") {
      const b = made.find((x) => x.booking_id === body.booking_id);
      b.status = "cancelled";
      return json({ booking: b });
    }
    if (path === "/chat") {
      if (body.booking) {
        if (failBooking) return json({ error: "booking", detail: "That time was just taken." }, 409);
        const adv = DIRECTORY.find((a) => a.advisor_id === body.booking.advisor_id);
        const booking = book(adv, body.booking.first_name, body.booking.date, body.booking.time);
        return json({ session_id: "sess-1", reply: `You're booked with ${adv.name}.`, booking });
      }
      if (/other advisors/i.test(body.message)) return json({ session_id: "sess-1", reply: "Here are three more.", matches: NEW_MATCHES });
      if (/advisor/i.test(body.message)) return json({ session_id: "sess-1", reply: "Here are three advisors who fit you.", matches: MATCHES });
      const typed = DIRECTORY.find((a) => body.message.includes(a.name));
      if (typed) {  // booking by typing in the chat: no form, the AI books it
        const booking = book(typed, "Ana", "2030-10-08", "15:00");
        return json({ session_id: "sess-1", reply: `Done! You're booked with ${typed.name}.`, booking });
      }
      return json({ session_id: "sess-1", reply: "Got it." });
    }
    return json({});
  });
}

const visibleMatchNames = (page) => page.locator("#matches .match:visible h3 .name").allInnerTexts();
const bookingCards = (page) => page.locator("#booking .booking-card");

async function say(page, text) {
  await page.fill("#msg", text);
  await page.click("#send");
}
async function getMatches(page) {
  await page.goto("/");
  await say(page, "Find me an advisor");
  await expect(page.locator("#matches .match")).toHaveCount(3);
}
async function chooseAndBook(page, name, box = "#matches") {
  await page.locator(`${box} .match, ${box} .dir-card`).filter({ hasText: name }).locator(".choose").click();
  await page.fill("#bk-name", "Ana");
  await page.click("#bk-submit");
}
async function expectMatchesGone(page, title = T.en.bookedTitle) {
  await expect(page.locator("#matches")).toBeHidden();
  await expect(page.locator("#matches .match:visible, #matches .show-all:visible")).toHaveCount(0);
  await expect(page.locator("#matches-title")).toHaveText(title);
}
async function cancelMeeting(page, name) {
  const card = bookingCards(page).filter({ hasText: name });
  await card.locator(".bk-cancel-meeting").click();
  await card.locator(".bk-yes-cancel").click();
  await expect(bookingCards(page).filter({ hasText: name })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("cleared")) { localStorage.clear(); sessionStorage.setItem("cleared", "1"); } });
});

for (const m of MATCHES) {
  test(`booking ${m.name} from the three matches hides all three`, async ({ page }) => {
    await fakeBackend(page);
    await getMatches(page);
    await chooseAndBook(page, m.name);
    await expect(bookingCards(page).filter({ hasText: m.name })).toHaveCount(1);
    await expectMatchesGone(page);
    await expect(page.locator("#matches .match")).toHaveCount(3);  // hidden, not deleted
  });
}

test("before booking, choosing a match still shows that match and the Show all button", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await page.locator("#matches .match", { hasText: "Mei Lin" }).locator(".choose").click();
  await expect(page.locator("#matches")).toBeVisible();
  expect(await visibleMatchNames(page)).toEqual(["Mei Lin"]);
  await expect(page.locator("#matches .show-all")).toBeVisible();
  await expect(page.locator("#matches-title")).toHaveText(T.en.matchesTitle);
});

test("closing the booking form without booking keeps the matches", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await page.locator("#matches .match", { hasText: "Jordan Ellis" }).locator(".choose").click();
  await page.click("#bk-cancel");
  await expect(page.locator("#matches")).toBeVisible();
  expect(await visibleMatchNames(page)).toEqual(["Jordan Ellis"]);
});

test("a booking that fails keeps the matches", async ({ page }) => {
  await fakeBackend(page, { failBooking: true });
  await getMatches(page);
  await chooseAndBook(page, "Sofia Ramirez");
  await expect(bookingCards(page)).toHaveCount(0);
  await expect(page.locator("#matches")).toBeVisible();
  await expect(page.locator("#matches-title")).toHaveText(T.en.matchesTitle);
});

test("booking from All advisors also hides the three matches", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await page.click("#tab-directory");
  await expect(page.locator(".dir-card")).toHaveCount(DIRECTORY.length);
  await chooseAndBook(page, "Grace Rivera", "#directory");
  await expect(bookingCards(page).filter({ hasText: "Grace Rivera" })).toHaveCount(1);
  await expectMatchesGone(page);
});

test("booking by typing in the chat also hides the three matches", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await say(page, "Book Jordan Ellis on Tuesday at 3pm");
  await expect(bookingCards(page).filter({ hasText: "Jordan Ellis" })).toHaveCount(1);
  await expectMatchesGone(page);
});

test("cancelling the meeting brings the matches back", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await chooseAndBook(page, "Mei Lin");
  await expectMatchesGone(page);
  await cancelMeeting(page, "Mei Lin");
  await expect(page.locator("#matches")).toBeVisible();
  await expect(page.locator("#matches-title")).toHaveText(T.en.matchesTitle);
  expect(await visibleMatchNames(page)).toEqual(["Mei Lin"]);  // the earlier choice, with Show all to pick again
  await page.click("#matches .show-all");
  expect((await visibleMatchNames(page)).sort()).toEqual(MATCHES.map((m) => m.name).sort());
});

test("with two meetings the panel says Your meetings; cancelling one keeps the matches hidden", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await chooseAndBook(page, "Sofia Ramirez");
  await say(page, "Book Jordan Ellis on Tuesday at 3pm");
  await expect(bookingCards(page)).toHaveCount(2);
  await expectMatchesGone(page, T.en.bookedTitleMany);
  await cancelMeeting(page, "Jordan Ellis");
  await expectMatchesGone(page, T.en.bookedTitle);
});

test("asking for other advisors after booking shows the new three; booking one hides them again", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await chooseAndBook(page, "Sofia Ramirez");
  await expectMatchesGone(page);
  await say(page, "Show me other advisors");
  await expect.poll(() => visibleMatchNames(page)).toEqual(NEW_MATCHES.map((m) => m.name));
  await expect(page.locator("#matches-title")).toHaveText(T.en.matchesTitle);
  await expect(bookingCards(page)).toHaveCount(1);  // the existing meeting stays
  await chooseAndBook(page, "Omar Patel");
  await expect(bookingCards(page)).toHaveCount(2);
  await expectMatchesGone(page, T.en.bookedTitleMany);
});

for (const lang of ["es", "zh"]) {
  test(`${lang}: the matches stay hidden after switching language and the title is translated`, async ({ page }) => {
    await fakeBackend(page);
    await getMatches(page);
    await chooseAndBook(page, "Mei Lin");
    await expectMatchesGone(page);
    if (!(await page.locator(`.language-option[data-lang=${lang}]`).isVisible())) await page.click("#settings-toggle");
    await page.click(`.language-option[data-lang=${lang}]`);
    await expectMatchesGone(page, T[lang].bookedTitle);
    await page.click(".language-option[data-lang=en]");
    await expectMatchesGone(page);
  });
}

test("after a refresh with a saved meeting, no empty matches placeholder is shown", async ({ page }) => {
  await fakeBackend(page);
  await getMatches(page);
  await chooseAndBook(page, "Jordan Ellis");
  await expectMatchesGone(page);
  await page.reload();
  await expect(bookingCards(page).filter({ hasText: "Jordan Ellis" })).toHaveCount(1);
  await expectMatchesGone(page);
  await expect(page.getByText(T.en.matchesEmpty)).toBeHidden();
});

test("after a refresh with no meeting, the matches placeholder shows as before", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await expect(page.locator("#matches")).toBeVisible();
  await expect(page.locator("#matches-title")).toHaveText(T.en.matchesTitle);
  await expect(page.getByText(T.en.matchesEmpty)).toBeVisible();
});
