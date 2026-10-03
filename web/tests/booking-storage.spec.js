// The booking card is remembered in localStorage so it survives a reload. These tests check that when
// that saved booking is dumped (cleared, corrupted, blocked) or no longer exists on the server, the app
// treats it as fully gone instead of showing a stale card.
import { test, expect } from "@playwright/test";

const KEY = "advisor-match.booking";
const API = "http://api.test";

const booking = (over = {}) => ({
  booking_id: "a1b2c3d4e5",
  advisor_id: "adv-901",
  advisor_name: "Sofia Ramirez",
  prospect_name: "Ana",
  meeting_date: "2030-10-08",
  meeting_time: "15:00",
  time_slot: "Tue, Oct 8, 2030 at 3:00 PM",
  meeting_purpose: "First home",
  status: "booked",
  session_id: "sess-saved-01",
  ...over,
});

// Fake backend. `lookup` answers POST /bookings/get: a booking object, a status number, or "offline".
async function fakeBackend(page, { lookup } = {}) {
  const calls = [];
  await page.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: API, region: "us-east-1", identityPoolId: "" } }));
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.parse(route.request().postData() || "{}");
    calls.push({ path, body });
    const cors = { "access-control-allow-origin": "*" };
    if (path === "/bookings/get") {
      if (lookup === "offline") return route.abort("internetdisconnected");
      if (typeof lookup === "number") return route.fulfill({ status: lookup, headers: cors, json: { error: "booking", detail: "We couldn't find that booking." } });
      return route.fulfill({ headers: cors, json: { booking: lookup } });
    }
    if (path === "/chat") return route.fulfill({ headers: cors, json: { session_id: body.session_id || "sess-new-02", reply: "Hi!" } });
    return route.fulfill({ headers: cors, json: {} });
  });
  return calls;
}

const saveInStorage = (page, value) =>
  page.addInitScript(([k, v]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } }, [KEY, value]);
const storedValue = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const bookingCard = (page) => page.locator("#booking .booking-card");

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".msg.bot").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  return errors;
}

test("no saved booking: no booking card and no booking lookup", async ({ page }) => {
  const calls = await fakeBackend(page);
  const errors = await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  expect(calls.filter((c) => c.path === "/bookings/get")).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("storage cleared after booking: reload shows nothing and starts a new session", async ({ page }) => {
  const saved = booking();
  const calls = await fakeBackend(page, { lookup: saved });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, booking: saved }));
  await open(page);
  await expect(bookingCard(page)).toBeVisible();

  await page.evaluate(() => localStorage.clear()); // dumped
  await page.reload();
  await expect(page.locator(".msg.bot").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(bookingCard(page)).toHaveCount(0);

  // The old session must not come back either: the next chat message starts fresh.
  await page.fill("#msg", "Hello");
  await page.click("#send");
  await expect.poll(() => calls.filter((c) => c.path === "/chat").length).toBe(1);
  expect(calls.find((c) => c.path === "/chat").body.session_id ?? null).toBeNull();
});

test("corrupt saved data is ignored and removed", async ({ page }) => {
  await fakeBackend(page);
  await saveInStorage(page, "{not json");
  const errors = await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  expect(await storedValue(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("saved data without a booking id is ignored and removed", async ({ page }) => {
  await fakeBackend(page);
  await saveInStorage(page, JSON.stringify({ sessionId: "sess-x", booking: { advisor_name: "Sofia Ramirez" } }));
  await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  expect(await storedValue(page)).toBeNull();
});

test("blocked storage (private mode) does not break the page", async ({ page }) => {
  await fakeBackend(page);
  await page.addInitScript(() => {
    const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
    Object.defineProperty(window, "localStorage", { configurable: true, get: blocked });
  });
  const errors = await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  await page.fill("#msg", "Hello");
  await page.click("#send");
  await expect(page.locator(".msg.bot").last()).toContainText("Hi!");
  expect(errors).toEqual([]);
});

test("saved booking the server no longer has is treated as gone", async ({ page }) => {
  const saved = booking();
  await fakeBackend(page, { lookup: 404 });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, booking: saved }));
  await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  expect(await storedValue(page)).toBeNull();
});

test("saved booking that was cancelled elsewhere is treated as gone", async ({ page }) => {
  const saved = booking();
  await fakeBackend(page, { lookup: booking({ status: "cancelled" }) });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, booking: saved }));
  await open(page);
  await expect(bookingCard(page)).toHaveCount(0);
  expect(await storedValue(page)).toBeNull();
});

test("saved booking still active shows the server's latest details", async ({ page }) => {
  const saved = booking();
  const latest = booking({ meeting_time: "10:30", time_slot: "Tue, Oct 8, 2030 at 10:30 AM", meeting_purpose: "First home and fees" });
  const calls = await fakeBackend(page, { lookup: latest });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, booking: saved }));
  await open(page);
  await expect(bookingCard(page)).toContainText("10:30 AM");
  await expect(bookingCard(page)).toContainText("First home and fees");
  expect(calls.find((c) => c.path === "/bookings/get").body).toEqual({ booking_id: saved.booking_id, session_id: saved.session_id });
  expect(JSON.parse(await storedValue(page)).bookings[0].meeting_time).toBe("10:30");
});

test("bookings saved in the current format (a list) survive a reload", async ({ page }) => {
  const saved = booking();
  await fakeBackend(page, { lookup: saved });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, bookings: [saved] }));
  await open(page);
  await expect(bookingCard(page)).toHaveCount(1);
  await expect(bookingCard(page)).toContainText("Sofia Ramirez");
  await page.reload();
  await expect(page.locator(".msg.bot").first()).toBeVisible();
  await expect(bookingCard(page)).toHaveCount(1);
});

test("server unreachable: keeps showing the saved booking", async ({ page }) => {
  const saved = booking();
  await fakeBackend(page, { lookup: "offline" });
  await saveInStorage(page, JSON.stringify({ sessionId: saved.session_id, booking: saved }));
  await open(page);
  await expect(bookingCard(page)).toContainText("3:00 PM");
  expect(await storedValue(page)).not.toBeNull();
});
