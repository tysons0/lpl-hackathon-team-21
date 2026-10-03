import "./style.css";
import { T } from "./i18n.js";
import { trData, trBio } from "./i18n-data.js";
import { startDictation } from "./dictation.js";
import { advisorPicture, wirePhotoFallbacks } from "./avatar.js";
import { GLOSSARY, tagTerms } from "./glossary.js";

// ---------- config ----------
let CFG = { apiUrl: "", region: "us-east-1", identityPoolId: "" };
const api = (path) => CFG.apiUrl.replace(/\/$/, "") + path;
async function post(path, body = {}) {
  const r = await fetch(api(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.detail || data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}

// ---------- i18n ----------
const LANGUAGE_NAMES = { en: "English", es: "Spanish", zh: "Mandarin" };
const state = { lang: "en", autoread: false, sessionId: null, busy: false, dictation: null, lastMatches: [], bookings: [], booking: null, chosenAdvisor: null };
const t = (k) => (T[state.lang] ?? T.en)[k] ?? T.en[k];

const LOCALES = { en: "en-US", es: "es-US", zh: "zh-CN" };
const locale = () => LOCALES[state.lang] || "en-US";
// Advisor data from the backend is English; show it in the chosen language (see i18n-data.js).
const tr = (text) => trData(text, state.lang);
const meetingWords = (types) => (types || []).map((m) => (T[state.lang] ?? T.en).reasonShort.meeting(m)).join(" / ");
const langWord = (l) => ((T[state.lang] ?? T.en).langNames ?? T.en.langNames)[l] ?? l;
// "15:00" -> "3:00 PM" / "3:00 p. m." / "下午3:00"
function fmtTime(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return hhmm || "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $("#mic").setAttribute("aria-label", state.dictation ? t("micStop") : t("micStart"));
  $("#chat-collapse").textContent = document.body.classList.contains("chat-collapsed") ? t("chatShow") : t("chatHide");
  document.querySelectorAll("#metrics-month option[value]:not([value=''])").forEach((o) => {
    o.textContent = new Date(2000, Number(o.value) - 1, 1).toLocaleDateString(locale(), { month: "long" });
  });
  document.querySelectorAll("#metrics-quarter option").forEach((o) => { o.textContent = t("quarterN")(o.value); });
}

// ---------- tiny safe markdown ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(text) {
  const lines = esc(text).split(/\n/);
  let html = "", list = null;
  const inline = (s) => s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1<em>$2</em>");
  for (const raw of lines) {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)/), ol = line.match(/^\d+[.)]\s+(.*)/);
    const want = ul ? "ul" : ol ? "ol" : null;
    if (list && want !== list) { html += `</${list}>`; list = null; }
    if (want) { if (!list) { html += `<${want}>`; list = want; } html += `<li>${inline((ul || ol)[1])}</li>`; continue; }
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) html += `<p><strong>${inline(h[1])}</strong></p>`;
    else if (line) html += `<p>${inline(line)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}
const plain = (s) => s.replace(/\*\*|__|#+\s|[*_`]/g, "").replace(/^\s*[-•]\s+/gm, "");

let termTipId = 0;
function tagGlossaryTerms(html, text) {
  const matches = tagTerms(text);
  if (!matches.length) return html;

  // Walk Markdown's HTML text nodes, mapping their escaped text back to the
  // source string so inline formatting and block structure remain intact.
  const root = document.createElement("div");
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let rawCursor = 0;
  let matchIndex = 0;
  for (const node of nodes) {
    const sourceText = node.nodeValue;
    let sourceStart = text.indexOf(sourceText, rawCursor);
    if (sourceStart < 0) continue;
    rawCursor = sourceStart + sourceText.length;
    const fragments = document.createDocumentFragment();
    let cursor = 0;
    while (matchIndex < matches.length) {
      const match = matches[matchIndex];
      if (match.start < sourceStart) { matchIndex++; continue; }
      if (match.start >= sourceStart + sourceText.length) break;
      const start = match.start - sourceStart;
      const end = match.end - sourceStart;
      fragments.append(document.createTextNode(sourceText.slice(cursor, start)));
      const id = `tip-${++termTipId}`;
      const button = document.createElement("button");
      button.className = "term";
      button.setAttribute("aria-describedby", id);
      button.setAttribute("aria-expanded", "false");
      button.type = "button";
      button.textContent = sourceText.slice(start, end);
      const tip = document.createElement("span");
      tip.id = id;
      tip.setAttribute("role", "tooltip");
      tip.className = "term-tip";
      tip.hidden = true;
      tip.textContent = GLOSSARY[match.term][state.lang] || GLOSSARY[match.term].en;
      const wrap = document.createElement("span");
      wrap.className = "term-wrap";
      wrap.append(button, tip);
      fragments.append(wrap);
      cursor = end;
      matchIndex++;
    }
    fragments.append(document.createTextNode(sourceText.slice(cursor)));
    node.replaceWith(fragments);
  }
  return root.innerHTML;
}

// ---------- DOM helpers ----------
const $ = (s) => document.querySelector(s);
const chat = () => $("#chat");
function addMsg(role, text, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}${opts.cls ? " " + opts.cls : ""}`;
  div.dataset.sourceText = text;
  div.dataset.messageRole = role;
  if (opts.i18n) div.dataset.i18nMsg = JSON.stringify(opts.i18n);
  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = role === "bot" && !opts.cls ? tagGlossaryTerms(md(text), text) : `<p>${esc(text)}</p>`;
  if (role === "bot") {
    const avatar = document.createElement("span");
    avatar.className = "agent-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "AM";
    div.append(avatar, body);
  } else div.append(body);
  if (role === "bot" && !opts.cls) {
    body.dataset.speakText = text;
    body.appendChild(createSpeakButton(() => body.dataset.speakText || text));
  }
  chat().appendChild(div);
  chat().scrollTop = chat().scrollHeight;
  return div;
}

function renderMessageText(div, text) {
  const role = div.dataset.messageRole;
  const body = div.querySelector(".msg-body");
  if (!body) return;
  body.dataset.speakText = text;
  body.innerHTML = role === "bot" ? tagGlossaryTerms(md(text), text) : `<p>${esc(text)}</p>`;
  if (role === "bot") {
    body.appendChild(createSpeakButton(() => body.dataset.speakText));
  }
}

function createSpeakButton(getText) {
  const button = document.createElement("button");
  button.className = "speak";
  button.type = "button";
  setSpeakButtonState(button, false);
  button.onclick = () => {
    if (activeSpeakButton === button) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    speak(getText(), button);
  };
  return button;
}

function setSpeakButtonState(button, active) {
  button.textContent = active ? "⏹ " + t("readAloud") : "🔊 " + t("readAloud");
  button.setAttribute("aria-label", active ? t("readAloudStop") : t("readAloud"));
  button.setAttribute("aria-pressed", String(active));
}

// Messages the app wrote itself (greeting, "you chose ..." follow-ups) come from the dictionary.
function localMessage({ key, args = [] }) {
  const L = T[state.lang] ?? T.en;
  if (key === "chosenFollowUp") {
    const [name, types] = args;
    const words = L.meetingWord ?? T.en.meetingWord;
    return (L.chosenFollowUp ?? T.en.chosenFollowUp)(name, (types || []).map((m) => words[m] ?? m).join(` ${words.or} `));
  }
  const v = L[key] ?? T.en[key];
  return typeof v === "function" ? v(...args) : v;
}

async function translateChatHistory() {
  chat().querySelectorAll(".msg[data-i18n-msg]").forEach((div) => renderMessageText(div, localMessage(JSON.parse(div.dataset.i18nMsg))));
  const messages = [...chat().querySelectorAll(".msg[data-source-text]:not([data-i18n-msg])")].filter((div) => !div.classList.contains("typing") && !div.classList.contains("error"));
  await Promise.all(messages.map(async (div) => {
    try {
      const result = await post("/translate", { text: div.dataset.sourceText, lang: state.lang });
      renderMessageText(div, result.text);
    } catch (e) {
      console.warn("[translate] keeping original message", e);
    }
  }));
}

let audioEl = null;
let activeSpeakButton = null;
let speakRequest = 0;
function stopSpeaking() {
  speakRequest++;
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  if (activeSpeakButton) setSpeakButtonState(activeSpeakButton, false);
  activeSpeakButton = null;
}
async function speak(text, button) {
  const request = ++speakRequest;
  try {
    const cleanText = plain(text).trim();
    if (!cleanText) return;
    const { audio_b64 } = await post("/speak", { text: cleanText, lang: state.lang });
    if (request !== speakRequest) return;
    if (!audio_b64) throw new Error("Speech audio was not returned by the server");
    audioEl = new Audio("data:audio/mpeg;base64," + audio_b64);
    activeSpeakButton = button || null;
    if (button) setSpeakButtonState(button, true);
    audioEl.onended = () => {
      if (request !== speakRequest) return;
      audioEl = null;
      activeSpeakButton = null;
      if (button) setSpeakButtonState(button, false);
    };
    await audioEl.play();
  } catch (e) {
    if (request !== speakRequest) return;
    if (activeSpeakButton === button) {
      activeSpeakButton = null;
      audioEl = null;
      if (button) setSpeakButtonState(button, false);
    }
    console.warn("[speak]", e);
    $("#live-hint").textContent = t("readAloudUnavailable")(e.message);
  }
}

// ---------- chat ----------
async function send(text, extra = {}) {
  text = (text || "").trim();
  if (!text || state.busy) return;
  stopDictation();
  state.busy = true;
  $("#send").disabled = true;
  $("#starters").hidden = true;
  addMsg("user", text);
  $("#msg").value = "";
  const typing = addMsg("bot", t("thinking"), { cls: "typing" });
  try {
    const chosen = state.chosenAdvisor ? { selected_advisor_id: state.chosenAdvisor.advisor_id } : {};
    const res = await post("/chat", { message: text, session_id: state.sessionId, lang: LANGUAGE_NAMES[state.lang], ...chosen, ...extra });
    state.sessionId = res.session_id;
    typing.remove();
    addMsg("bot", res.reply || "…");
    if (res.matches) { state.chosenAdvisor = null; renderMatches((state.lastMatches = res.matches)); }
    if (res.booking) saveBookingLocally(res.booking);
    if (state.autoread) speak(res.reply);
  } catch (e) {
    typing.remove();
    addMsg("bot", `${t("error")} (${e.message})`, { cls: "error" });
    if (extra.booking) throw e;
  } finally {
    state.busy = false;
    $("#send").disabled = false;
    $("#msg").focus();
  }
}

// Explainable match notes: deterministic reasons from the ranking, rendered in the user's language.
function reasonText(r, kind = "reason") {
  const L = T[state.lang] ?? T.en;
  const fn = (L[kind] ?? T.en[kind])[r.code];
  return fn ? fn(r.code === "focus" ? tr(r.value) : r.value, L.langNames ? L : T.en) : "";
}

// Compact cards so all three matches fit on one screen; the full details sit behind "More".
let moreId = 0;
function renderMatches(list) {
  $("#matches-announcement").textContent = t("matchesAnnounce")(list.length);
  const box = $("#matches");
  box.innerHTML = "";
  list.forEach((a) => {
    const card = document.createElement("article");
    card.className = "match";
    const reasons = (a.reasons || []).map((r) => reasonText(r)).filter(Boolean);
    const short = (a.reasons || []).map((r) => reasonText(r, "reasonShort")).filter(Boolean).join(" · ");
    const drivers = (a.drivers || []).map((d) => t("drivers")[d] ?? d).join(", ");
    const d = a.disclosure;
    const fee = d ? `${tr(d.fee_model)} · ${tr(d.platform)}` : "";
    const id = `match-more-${++moreId}`;
    card.innerHTML = `
      <div class="card-head">${advisorPicture(a, esc, { portrait: t("portraitOf")(a.name), photo: t("photoOf")(a.name) })}
        <div class="card-title">
          <h3><span class="name" title="${esc(a.name)}">${esc(a.name)}</span>${a.fit ? `<span class="fit">${esc(tr(a.fit))}</span>` : ""}</h3>
          <div class="meta one-line">${a.match_score != null ? `<span class="score">${esc(t("matchScore")(a.match_score))}</span> · ` : ""}${esc(a.city)}</div>
        </div>
      </div>
      ${short ? `<div class="one-line why-short" title="${esc(reasons.join(" · "))}">${esc(short)}</div>` : ""}
      ${fee ? `<div class="one-line fee-short" title="${esc(fee)}"><strong>${esc(t("feeLabel"))}:</strong> ${esc(fee)}</div>` : ""}
      <div class="match-actions">
        <button class="secondary more" type="button" aria-expanded="false" aria-controls="${id}" aria-label="${esc(t("moreAbout")(a.name))}">${esc(t("more"))} ▾</button>
        <button class="secondary choose" type="button">${esc(t("choose"))}</button>
      </div>
      <div class="match-more" id="${id}" hidden>
        <div class="meta">${esc(meetingWords(a.meeting_types))}</div>
        <div class="tags">${a.languages.map((l) => `<span class="tag">${esc(langWord(l))}</span>`).join("")}${a.focus.map((f) => `<span class="tag">${esc(tr(f))}</span>`).join("")}</div>
        ${reasons.length ? `<div class="why"><strong>${esc(t("whyFit"))}</strong><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${drivers ? `<div class="fineprint">${esc(t("driversNote"))}: ${esc(drivers)}</div>` : ""}</div>` : ""}
        <p class="meta">${esc(trBio(a.bio, state.lang))}</p>
        ${d ? `<div class="disclosure"><strong>${esc(t("feeLabel"))}:</strong> ${esc(fee)}<div class="fineprint">${esc(t("formCrs"))}</div></div>` : ""}
      </div>`;
    const more = card.querySelector(".more"), panel = card.querySelector(".match-more");
    more.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      more.textContent = `${t(open ? "less" : "more")} ${open ? "▴" : "▾"}`;
    };
    card.dataset.advisorId = a.advisor_id;
    card.querySelector(".choose").onclick = () => chooseMatch(a);
    wirePhotoFallbacks(card);
    box.appendChild(card);
  });
  applyChoice();
  // On narrow screens the matches sit below the chat: bring all three into view together.
  const side = $(".side");
  if (side.getBoundingClientRect().top > innerHeight * 0.6) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    side.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }
}

// Choosing one of the three matches: hide the other two (they stay in All advisors), and show the choice
// plus one follow-up question in the chat. No AI call here; the next chat message says who was chosen.
function chooseMatch(a) {
  if (state.chosenAdvisor?.advisor_id !== a.advisor_id) {
    state.chosenAdvisor = a;
    const L = T[state.lang] ?? T.en;
    const words = L.meetingWord ?? T.en.meetingWord;
    const types = (a.meeting_types || []).map((m) => words[m] ?? m).join(` ${words.or} `);
    addMsg("user", (L.chooseMsg ?? T.en.chooseMsg)(a.name), { i18n: { key: "chooseMsg", args: [a.name] } });
    addMsg("bot", (L.chosenFollowUp ?? T.en.chosenFollowUp)(a.name, types), { i18n: { key: "chosenFollowUp", args: [a.name, a.meeting_types] } });
    applyChoice();
  }
  openBookingForm(a);
}

function applyChoice() {
  const box = $("#matches");
  const chosenId = state.chosenAdvisor?.advisor_id;
  const inList = chosenId && box.querySelector(`.match[data-advisor-id="${chosenId}"]`);
  box.querySelectorAll(".match").forEach((card) => {
    const isChosen = inList && card.dataset.advisorId === chosenId;
    card.hidden = Boolean(inList) && !isChosen;
    card.classList.toggle("chosen", Boolean(isChosen));
    card.querySelector(".chosen-label")?.remove();
    if (isChosen) card.querySelector(".card-title h3").insertAdjacentHTML("afterend", `<div class="chosen-label">${esc(t("yourChoice"))}</div>`);
  });
  box.querySelector(".show-all")?.remove();
  if (inList) {
    box.insertAdjacentHTML("beforeend", `<button type="button" class="secondary show-all">${esc(t("showAll"))}</button>`);
    box.querySelector(".show-all").onclick = () => { state.chosenAdvisor = null; applyChoice(); box.querySelector(".match .choose")?.focus(); };
  }
}

// ---------- booking: pick a date, a time and what the meeting is about ----------
const BOOKING_KEY = "advisor-match.booking";
function persistBookings() {
  try {
    if (state.bookings.length) localStorage.setItem(BOOKING_KEY, JSON.stringify({ sessionId: state.sessionId, bookings: state.bookings }));
    else localStorage.removeItem(BOOKING_KEY);
  } catch (_) {}
}
// Add or update a booking (a cancelled one is removed), remember it in the browser and redraw the cards.
function saveBookingLocally(b, notice = "") {
  const had = (state.bookings || []).some((x) => x.booking_id === b.booking_id);
  state.bookings = (state.bookings || []).filter((x) => x.booking_id !== b.booking_id);
  if (b.status !== "cancelled") state.bookings.push(b);
  else if (had) $("#booking-announcement").textContent = `${t("bkCancelled")}. ${t("bkCancelledNote")}`;
  state.booking = state.bookings.at(-1) || null;
  persistBookings();
  renderBookings(notice ? { id: b.booking_id, text: notice } : null);
}
function forgetBooking() {
  state.bookings = [];
  state.booking = null;
  try { localStorage.removeItem(BOOKING_KEY); } catch (_) {}
}
// Show the bookings saved in this browser only if the server still has them. Cleared, corrupt or blocked
// storage, or bookings that were deleted or cancelled elsewhere, mean there is nothing to show.
async function restoreBooking() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(BOOKING_KEY) || "null"); } catch (_) { forgetBooking(); return; }
  if (!saved) return;
  const sessionId = saved.sessionId;
  const list = (Array.isArray(saved.bookings) ? saved.bookings : saved.booking ? [saved.booking] : []).filter((b) => b?.booking_id);
  if (!sessionId || !list.length) { forgetBooking(); return; }
  const checked = await Promise.all(list.map(async (b) => {
    try {
      const { booking } = await post("/bookings/get", { booking_id: b.booking_id, session_id: sessionId });
      return booking && booking.status !== "cancelled" ? booking : null;
    } catch (e) {
      return e.status ? null : b;  // the server answered: gone or not ours. Unreachable: keep what we saved.
    }
  }));
  const keep = checked.filter(Boolean);
  if (!keep.length) { forgetBooking(); return; }
  state.sessionId = sessionId;
  state.bookings = keep;
  state.booking = keep.at(-1);
  persistBookings();
  renderBookings();
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextWeekday(from) {
  const d = new Date(from);
  do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}
function bookingFormValues() {
  return { first_name: $("#bk-name")?.value || "", date: $("#bk-date").value, time: $("#bk-time").value,
           purpose: $("#bk-purpose").value };
}
function friendlyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// advisor: {advisor_id, name}; existing: a booking to edit (date, time and purpose prefilled);
// keep: values typed so far ({first_name, date, time, purpose}), restored when the form is redrawn in another language
function openBookingForm(advisor, existing = null, keep = null) {
  state.bookingForm = { advisor, existing };
  const box = $("#booking");
  const today = new Date();
  const min = isoDay(nextWeekday(today));
  const max = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60));
  const purpose = keep ? keep.purpose : existing?.meeting_purpose || "";
  box.innerHTML = `
    <form class="booking-form" id="booking-form" novalidate>
      <h3>${esc(t("bookTitle")(advisor.name))}</h3>
      ${existing ? "" : `<label for="bk-name">${esc(t("bkFirstName"))}
        <input id="bk-name" name="first_name" required maxlength="40" autocomplete="given-name" /></label>`}
      <div class="bk-row">
        <label for="bk-date">${esc(t("bkDate"))}
          <input id="bk-date" type="date" required min="${min}" max="${max}" value="${esc(keep?.date || existing?.meeting_date || min)}" /></label>
        <label for="bk-time">${esc(t("bkTime"))}
          <select id="bk-time" required><option value="">${esc(t("bkPickDate"))}</option></select></label>
      </div>
      <p class="fineprint">${esc(t("bkWeekdays"))}</p>
      <label for="bk-purpose">${esc(t("bkPurpose"))}
        <textarea id="bk-purpose" rows="3" maxlength="500" placeholder="${esc(t("bkPurposePh"))}">${esc(purpose)}</textarea></label>
      <div class="bk-hint"><span class="fineprint">${esc(t("bkPurposeHint"))}</span><span class="fineprint" id="bk-count"></span></div>
      <p class="form-error" id="bk-error" role="alert"></p>
      <div class="bk-actions">
        <button type="submit" class="primary" id="bk-submit">${esc(existing ? t("bkSave") : t("bkSubmit"))}</button>
        <button type="button" class="secondary" id="bk-cancel">${esc(t("bkCancel"))}</button>
      </div>
    </form>`;
  const form = $("#booking-form"), dateEl = $("#bk-date"), timeEl = $("#bk-time"), purposeEl = $("#bk-purpose"), err = $("#bk-error");
  const count = () => ($("#bk-count").textContent = t("bkChars")(purposeEl.value.length, 500));
  purposeEl.oninput = () => { count(); err.textContent = ""; };
  count();
  if (keep && $("#bk-name")) $("#bk-name").value = keep.first_name;

  async function loadTimes() {
    err.textContent = "";
    timeEl.innerHTML = `<option value="">${esc(t("thinking"))}</option>`;
    try {
      const { times } = await post("/availability", { advisor_id: advisor.advisor_id, date: dateEl.value });
      const held = existing && dateEl.value === existing.meeting_date ? existing.meeting_time : null;
      const open = (s) => s.available || s.time === held;
      if (!times.some(open)) { timeEl.innerHTML = `<option value="">${esc(t("bkNoTimes"))}</option>`; return; }
      timeEl.innerHTML = times.map((s) =>
        `<option value="${s.time}" ${open(s) ? "" : "disabled"}>${esc(fmtTime(s.time))}${open(s) ? "" : ` (${esc(t("bkTaken"))})`}</option>`).join("");
      const typed = times.find((s) => s.time === wanted && open(s));
      wanted = null;
      timeEl.value = typed ? typed.time : held || times.find(open).time;
    } catch (e) {
      timeEl.innerHTML = `<option value="">${esc(t("bkPickDate"))}</option>`;
      err.textContent = e.message;
    }
  }
  let wanted = keep?.time || null;
  dateEl.onchange = loadTimes;
  loadTimes();

  $("#bk-cancel").onclick = () => renderBookings();
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = "";
    const first = $("#bk-name")?.value.trim();
    if (!existing && !first) { err.textContent = t("bkFirstName"); $("#bk-name").focus(); return; }
    if (!timeEl.value) { err.textContent = t("bkPickDate"); timeEl.focus(); return; }
    const submit = $("#bk-submit");
    submit.disabled = true;
    try {
      if (existing) {
        const { booking } = await post("/bookings/update", {
          booking_id: existing.booking_id, session_id: state.sessionId, date: dateEl.value, time: timeEl.value,
          purpose: purposeEl.value, lang: LANGUAGE_NAMES[state.lang],
        });
        saveBookingLocally(booking, t("bkSaved"));
      } else {
        const when = `${friendlyDate(dateEl.value)}, ${timeEl.selectedOptions[0].textContent}`;
        await send((T[state.lang] ?? T.en).bkChatMsg?.(advisor.name, when) ?? T.en.bkChatMsg(advisor.name, when), {
          booking: { advisor_id: advisor.advisor_id, first_name: first, date: dateEl.value, time: timeEl.value, purpose: purposeEl.value },
        });
      }
    } catch (e2) {
      err.textContent = e2.message;
    } finally {
      if (document.body.contains(submit)) submit.disabled = false;
    }
  };
  (existing ? dateEl : $("#bk-name")).focus();
  box.scrollIntoView({ block: "nearest" });
}

function calendarLink(b) {
  if (!b.meeting_date) return "";
  const [year, month, day] = b.meeting_date.split("-").map(Number);
  const [hour, minute] = (b.meeting_time || "00:00").split(":").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: t("calendarText")(b.advisor_name || t("yourAdvisor")),
    dates: `${stamp(start)}/${stamp(end)}`,
    details: b.meeting_purpose || "",
    location: b.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function bookingCardHtml(b, notice) {
  const when = b.meeting_date ? `${friendlyDate(b.meeting_date)} · ${fmtTime(b.meeting_time)}` : b.time_slot;
  const cal = calendarLink(b);
  return `
    <div class="booking-card" role="status" data-booking-id="${esc(b.booking_id)}">
      <h3>✓ ${t("booked")}</h3>
      <div>${esc(b.prospect_name)} ${t("with")} <strong>${esc(b.advisor_name)}</strong></div>
      <div class="meta">${t("when")}: ${esc(when)}</div>
      ${b.meeting_purpose ? `<div class="meta">${esc(t("bkPurposeLabel"))}: ${esc(b.meeting_purpose)}</div>` : ""}
      ${notice ? `<p class="saved-note">${esc(notice)}</p>` : ""}
      <div class="bk-actions">
        ${b.meeting_date ? `<button type="button" class="secondary bk-change">${esc(t("bkChange"))}</button>` : ""}
        ${cal ? `<a class="secondary" href="${esc(cal)}" target="_blank" rel="noopener">${esc(t("bkCalendar"))}</a>` : ""}
        <button type="button" class="secondary danger bk-cancel-meeting">${esc(t("bkCancelMeeting"))}</button>
      </div>
      <div class="bk-confirm" hidden>
        <p>${esc(t("bkConfirmCancel")(b.advisor_name))}</p>
        <div class="bk-actions">
          <button type="button" class="primary danger bk-yes-cancel">${esc(t("bkYesCancel"))}</button>
          <button type="button" class="secondary bk-keep">${esc(t("bkKeep"))}</button>
        </div>
        <p class="form-error bk-cancel-error" role="alert"></p>
      </div>
      <p class="fineprint">${esc(t("bkChatTip"))}</p>
    </div>`;
}

// One card per active booking, each with its own Change / Calendar / Cancel controls.
function renderBookings(notice = null) {
  const box = $("#booking");
  const list = state.bookings || [];
  box.innerHTML = list.map((b) => bookingCardHtml(b, notice?.id === b.booking_id ? notice.text : "")).join("");
  box.querySelectorAll(".booking-card").forEach((card) => {
    const b = list.find((x) => x.booking_id === card.dataset.bookingId);
    const q = (sel) => card.querySelector(sel);
    q(".bk-change")?.addEventListener("click", () => openBookingForm({ advisor_id: b.advisor_id, name: b.advisor_name }, b));
    q(".bk-cancel-meeting").onclick = () => { q(".bk-confirm").hidden = false; q(".bk-keep").focus(); };
    q(".bk-keep").onclick = () => { q(".bk-confirm").hidden = true; q(".bk-cancel-meeting").focus(); };
    q(".bk-yes-cancel").onclick = async () => {
      q(".bk-yes-cancel").disabled = true;
      try {
        const { booking } = await post("/bookings/cancel", { booking_id: b.booking_id, session_id: state.sessionId });
        saveBookingLocally(booking);
        $("#msg").focus();  // the button that had focus is gone
      } catch (e) {
        q(".bk-cancel-error").textContent = e.message;
        q(".bk-yes-cancel").disabled = false;
      }
    };
  });
}

// ---------- dictation ----------
function stopDictation() {
  if (state.dictation) { state.dictation.stop(); state.dictation = null; }
  $("#mic").setAttribute("aria-pressed", "false");
  $("#mic").setAttribute("aria-label", t("micStart"));
  $("#live-hint").textContent = "";
}
async function toggleMic() {
  if (state.dictation) { stopDictation(); return; }
  try {
    state.dictation = await startDictation(CFG, state.lang, (text) => {
      const nextText = text.trim();
      if (!nextText) return;
      $("#msg").value = nextText;
      $("#msg").dispatchEvent(new Event("input", { bubbles: true }));
    });
    $("#mic").setAttribute("aria-pressed", "true");
    $("#mic").setAttribute("aria-label", t("micStop"));
    $("#live-hint").textContent = `${t("listening")} (${state.dictation.engine})`;
  } catch (e) {
    $("#live-hint").textContent = e.message;
  }
}

// ---------- advisor directory ----------
let dirTimer = null;
async function loadDirectory() {
  const box = $("#directory");
  box.setAttribute("aria-busy", "true");
  try {
    const { advisors, total } = await post("/advisors", {
      language: $("#dir-lang").value, meeting_type: $("#dir-meeting").value, text: $("#dir-text").value,
    });
    state.directory = { advisors, total };
    renderDirectory();
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
  finally { box.removeAttribute("aria-busy"); }
}
function renderDirectory() {
  if (!state.directory) return;
  const { advisors, total } = state.directory;
  const box = $("#directory");
  $("#dir-count").textContent = t("dirCount")(advisors.length, total);
  box.innerHTML = advisors.length ? "" : `<p class="muted">${esc(t("dirEmpty"))}</p>`;
  advisors.forEach((a) => {
    const d = a.disclosure || {};
    const card = document.createElement("article");
    card.className = "match dir-card";
    card.innerHTML = `
      <div class="card-head">${advisorPicture(a, esc, { portrait: t("portraitOf")(a.name), photo: t("photoOf")(a.name) })}<h3>${esc(a.name)}</h3></div>
      <div class="meta">${esc(a.city)} · ${esc(meetingWords(a.meeting_types))}</div>
      <div class="slots ${a.open_slots > 0 ? "open" : ""}">${esc(t("openSlots")(a.open_slots))}</div>
      <div class="tags">${a.languages.map((l) => `<span class="tag">${esc(langWord(l))}</span>`).join("")}${a.focus.map((f) => `<span class="tag">${esc(tr(f))}</span>`).join("")}</div>
      <p class="meta">${esc(trBio(a.bio, state.lang))}</p>
      <div class="disclosure"><strong>${esc(t("feeLabel"))}:</strong> ${esc(tr(d.fee_model || ""))} · ${esc(tr(d.platform || ""))}</div>
      <button class="secondary choose" type="button" ${a.open_slots > 0 ? "" : "disabled"}>${esc(t("askToMeet"))}</button>`;
    card.querySelector(".choose").onclick = () => {
      showView("investor");
      openBookingForm(a);
    };
    wirePhotoFallbacks(card);
    box.appendChild(card);
  });
}

// ---------- advisor view ----------
// Briefings are written by the AI in English; translate them once per language and remember the result.
const translations = new Map();
function translateText(text) {
  if (!text || state.lang === "en") return Promise.resolve(text);
  const key = `${state.lang}\u0000${text}`;
  if (!translations.has(key)) {
    translations.set(key, post("/translate", { text, lang: state.lang }).then((r) => r.text || text).catch(() => { translations.delete(key); return text; }));
  }
  return translations.get(key);
}
function translateMarked(root) {
  root.querySelectorAll("[data-tr]").forEach(async (el) => {
    const lang = state.lang;
    const out = await translateText(el.dataset.tr);
    if (lang === state.lang && document.body.contains(el)) el.textContent = out;
  });
}

let lastBookings = null;
async function loadBookings() {
  const box = $("#bookings");
  box.innerHTML = `<p class="muted">${t("thinking")}</p>`;
  try {
    const { bookings } = await post("/bookings");
    lastBookings = bookings;
    renderAdvisorBookings();
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
}
function renderAdvisorBookings() {
  const box = $("#bookings");
  const bookings = lastBookings || [];
  if (!bookings.length) { box.innerHTML = `<p class="muted">${esc(t("noProspects"))}</p>`; return; }
  box.innerHTML = "";
  const field = (text) => (text ? `<span data-tr="${esc(text)}">${esc(text)}</span>` : "—");
  bookings.forEach((b) => {
    const br = b.briefing || {};
    const when = b.meeting_date ? `${friendlyDate(b.meeting_date)} · ${fmtTime(b.meeting_time)}` : field(b.time_slot || "");
    const el = document.createElement("article");
    el.className = "bk";
    el.innerHTML = `
      <h3>${esc(b.prospect_name || t("newProspect"))} → ${esc(b.advisor_name || b.advisor_id)}</h3>
      <div class="meta">${esc(t("firstMeeting"))}: ${b.status === "cancelled" ? `<s>${when}</s> <span class="crm cancelled-pill">${esc(t("cancelledPill"))}</span>` : when}
        ${b.crm_status ? `<span class="crm ${b.crm_status === "synced" ? "ok" : ""}">${esc(b.crm_status === "synced" ? t("crmSynced") : t("crmPending"))}</span>` : ""}</div>
      <dl>
        ${b.meeting_purpose ? `<dt>${esc(t("bkPurposeLabel"))}</dt><dd>${field(b.meeting_purpose)}</dd>` : ""}
        <dt>${esc(t("briefGoals"))}</dt><dd>${field(br.goals)}</dd>
        <dt>${esc(t("briefWorries"))}</dt><dd>${field(br.worries)}</dd>
        <dt>${esc(t("briefExplain"))}</dt><dd>${field(br.topics_to_explain)}</dd>
        <dt>${esc(t("briefComms"))}</dt><dd>${field(br.communication_preferences)}</dd>
      </dl>`;
    box.appendChild(el);
  });
  translateMarked(box);
}

// ---------- dashboard ----------
const STAGE_KEYS = ["intake_started", "matched", "booked", "briefing_sent"];
const stageLabel = (k) => t("stages")[k];
let currentMetricsReport = null;
let lastRecommendations = null;
function setupMetricDateSelectors() {
  const year = new Date().getUTCFullYear();
  $("#metrics-year").innerHTML = Array.from({ length: 6 }, (_, index) => year - index)
    .map((value) => `<option value="${value}">${value}</option>`).join("");
  $("#metrics-year").value = String(year);
  $("#metrics-month").value = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  $("#metrics-quarter").value = String(Math.floor(new Date().getUTCMonth() / 3) + 1);
}

function applyYearMonthRange() {
  const year = $("#metrics-year").value;
  const month = $("#metrics-month").value;
  if (!year) return;
  $("#metrics-range").value = month ? "month" : "year";
  $("#custom-range").hidden = true;
  loadMetrics();
}

async function loadMetrics() {
  const box = $("#funnel");
  box.innerHTML = `<p class="muted">${t("thinking")}</p>`;
  try {
    const range = $("#metrics-range").value;
    const request = { range, year: Number($("#metrics-year").value) };
    if (range === "month") request.month = Number($("#metrics-month").value);
    if (range === "quarter") request.quarter = Number($("#metrics-quarter").value);
    if (range === "custom") {
      request.start_date = $("#metrics-start").value;
      request.end_date = $("#metrics-end").value;
      if (!request.start_date || !request.end_date) {
        box.innerHTML = `<p class="muted">${esc(t("chooseBothDates"))}</p>`;
        return;
      }
    }
    const report = await post("/metrics", request);
    currentMetricsReport = report;
    renderMetrics();
    loadInsights(report);
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
}

function renderMetrics() {
  const box = $("#funnel");
  const report = currentMetricsReport;
  if (!report) return;
  {
    const { funnel, start_date, end_date } = report;
    const matched = funnel.matched || 0;
    const booked = funnel.booked || 0;
    const briefed = funnel.briefing_sent || 0;
    const conversion = matched ? Math.round((booked / matched) * 100) : 0;
    const aum = +$("#r-aum").value;
    const fee = +$("#r-fee").value;
    const opportunity = booked * aum * (fee / 100);
    $("#metrics-day").textContent = `${start_date === end_date ? start_date : t("periodShort")(start_date, end_date)} · UTC`;
    $("#kpi-matched").textContent = matched.toLocaleString();
    $("#kpi-conversion").textContent = `${conversion}%`;
    $("#kpi-briefed").textContent = briefed.toLocaleString();
    $("#kpi-opportunity").textContent = usd(opportunity);
    if (!lastRecommendations) renderRecommendations({ matched, booked, briefed, conversion });
    else renderRecommendations(lastRecommendations);
    const max = Math.max(1, ...STAGE_KEYS.map((k) => funnel[k] || 0));
    box.innerHTML = `<div class="meta">${esc(start_date === end_date ? t("periodDay")(start_date) : t("periodRange")(start_date, end_date))}</div>`;
    STAGE_KEYS.forEach((k, i) => {
      const label = esc(stageLabel(k));
      const v = funnel[k] || 0;
      const row = document.createElement("div");
      row.className = "frow";
      row.innerHTML = `<div>${label}</div><div class="bar" style="width:${(v / max) * 100}%" role="img" aria-label="${label}: ${v}"></div><div class="val">${v}</div>`;
      box.appendChild(row);
      if (i > 0) {
        const prev = funnel[STAGE_KEYS[i - 1]] || 0;
        if (prev) {
          const d = document.createElement("div");
          d.className = "drop";
          d.textContent = t("carriedOn")(Math.round((v / prev) * 100));
          box.appendChild(d);
        }
      }
    });
    // Compliance guardrails at work: blocked PII and guardrail interventions (never shown as funnel drop-off).
    const pii = funnel.pii_blocked || 0, gr = funnel.guardrail_blocked || 0;
    const c = document.createElement("div");
    c.className = "meta compliance";

    c.textContent = t("complianceLine")(pii, gr);
    box.appendChild(c);
  }
}

async function loadInsights(report) {
  try {
    const result = await post("/insights", {
      funnel: report.funnel,
      start_date: report.start_date,
      end_date: report.end_date,
    });
    lastRecommendations = result.recommendations || [];
    renderRecommendations(lastRecommendations);
  } catch (e) {
    console.warn("[insights] falling back to local recommendations", e);
  }
}

function exportMetricsCsv() {
  if (!currentMetricsReport) return;
  const { funnel, range, start_date, end_date } = currentMetricsReport;
  const matched = funnel.matched || 0;
  const booked = funnel.booked || 0;
  const briefed = funnel.briefing_sent || 0;
  const conversion = matched ? Math.round((booked / matched) * 100) : 0;
  const aum = +$("#r-aum").value;
  const fee = +$("#r-fee").value;
  const notes = t("csvNotes");
  const period = $("#metrics-range").selectedOptions[0]?.textContent || range;
  const rows = [
    t("csvHeaders"),
    [t("kpiMatched"), matched, period, start_date, end_date, notes.matched],
    [t("kpiConversion"), `${conversion}%`, period, start_date, end_date, notes.conversion],
    [t("kpiBriefed"), briefed, period, start_date, end_date, notes.briefed],
    [t("kpiOpportunity"), usd(booked * aum * (fee / 100)), period, start_date, end_date, notes.opportunity(usd(aum), fee.toFixed(2))],
    ...STAGE_KEYS.map((key) => [stageLabel(key), funnel[key] || 0, period, start_date, end_date, notes.funnel]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `advisor-match-impact-${start_date}-to-${end_date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Recommendations have an id (see actionable_insights in the backend) so they can be shown in any language.
function recommendationText(item) {
  const r = (T[state.lang] ?? T.en).rec?.[item.id] ?? T.en.rec[item.id];
  if (!r) return { title: item.title, body: item.body, metric: item.metric || "" };
  return { title: r.title, body: r.body, metric: r.metric(item.values || {}) };
}
function renderRecommendations(input) {
  let items = input;
  if (!Array.isArray(input)) {
    const { matched, briefed, conversion } = input;
    items = [];
    if (!matched) items.push({ id: "first_proof", priority: "high", values: {} });
    else if (conversion < 25) items.push({ id: "conversion", priority: "high", values: { conversion } });
    else items.push({ id: "scale", priority: "positive", values: { conversion } });
    if (matched && briefed / matched < 0.8) items.push({ id: "handoff", priority: "medium", values: { rate: Math.round((briefed / matched) * 100) } });
    if (matched >= 3) items.push({ id: "prove", priority: "medium", values: { matched } });
  }
  $("#recommendations").innerHTML = items.map((item, index) => {
    const { title, body, metric } = recommendationText(item);
    return `<article class="recommendation ${item.priority === "positive" ? "positive" : ""}"><span class="recommendation-number">${index + 1}</span><div><strong>${esc(title)}</strong><p>${esc(body)}</p><small>${esc(metric)}</small></div></article>`;
  }).join("");
}

const usd = (n) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
function calcRoi() {
  const adv = +$("#r-adv").value, cli = +$("#r-cli").value, aum = +$("#r-aum").value, fee = +$("#r-fee").value;
  $("#o-adv").textContent = adv.toLocaleString();
  $("#o-cli").textContent = cli;
  $("#o-aum").textContent = usd(aum);
  $("#o-fee").textContent = fee.toFixed(2) + "%";
  const clients = adv * cli, assets = clients * aum, rev = assets * (fee / 100);
  $("#k-clients").textContent = clients.toLocaleString();
  $("#k-assets").textContent = usd(assets);
  $("#k-rev").textContent = usd(rev);
}

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll("[role=tab]").forEach((b) => {
    const on = b.dataset.view === name;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll("[role=tabpanel]").forEach((p) => (p.hidden = p.id !== "view-" + name));
  if (name === "advisor") loadBookings();
  if (name === "directory") loadDirectory();
  if (name === "dashboard") loadMetrics();
}

// ---------- init ----------
async function init() {
  try { CFG = { ...CFG, ...(await (await fetch("/config.json", { cache: "no-store" })).json()) }; } catch (_) {}
  const tabs = [...document.querySelectorAll("[role=tab]")];
  chat().addEventListener("click", (e) => {
    const button = e.target.closest("button.term");
    if (!button || !chat().contains(button)) return;
    const tip = document.getElementById(button.getAttribute("aria-describedby"));
    if (!tip) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    tip.hidden = expanded;
  });
  chat().addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const button = e.target.closest("button.term[aria-expanded='true']");
    if (!button) return;
    const tip = document.getElementById(button.getAttribute("aria-describedby"));
    button.setAttribute("aria-expanded", "false");
    if (tip) tip.hidden = true;
    button.focus();
  });
  tabs.forEach((b, i) => {
    b.onclick = () => showView(b.dataset.view);
    b.onkeydown = (e) => {
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const n = tabs[e.key === "Home" ? 0 : tabs.length - 1];
        n.focus(); showView(n.dataset.view);
        return;
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); showView(n.dataset.view);
    };
  });
  document.querySelectorAll(".language-option").forEach((button) => (button.onclick = () => {
    const typed = state.bookingForm && $("#booking-form") ? bookingFormValues() : null; // before anything redraws
    state.lang = button.dataset.lang;
    document.querySelectorAll(".language-option").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", active);
    });
    applyI18n();
    translateChatHistory();
    if ($("#matches .match")) renderMatches(state.lastMatches || []);
    renderDirectory();
    if (state.bookings?.length) renderBookings();
    if (typed) openBookingForm(state.bookingForm.advisor, state.bookingForm.existing, typed);
    if (lastBookings) renderAdvisorBookings();
    if (currentMetricsReport) renderMetrics();
    calcRoi();
  }));
  document.querySelectorAll(".size-option").forEach((button) => (button.onclick = () => {
    const size = Number(button.dataset.size);
    document.documentElement.style.setProperty("--base", `${size / 100 * 17}px`);
    $("#mobile-text-size").value = String(size);
    document.querySelectorAll(".size-option").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", active);
    });
  }));
  $("#mobile-text-size").oninput = (e) => {
    const size = Number(e.target.value);
    document.documentElement.style.setProperty("--base", `${size / 100 * 17}px`);
    document.querySelectorAll(".size-option").forEach((option) => {
      option.classList.remove("active");
      option.setAttribute("aria-pressed", "false");
    });
  };
  $("#pref-contrast").onchange = (e) => document.documentElement.classList.toggle("contrast", e.target.checked);
  $("#pref-autoread").onchange = (e) => {
    state.autoread = e.target.checked;
    if (!state.autoread && audioEl) stopSpeaking();
  };
  $("#settings-toggle").onclick = () => {
    const open = $("#settings-panel").classList.toggle("open");
    $("#settings-toggle").setAttribute("aria-expanded", open);
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#settings-panel").classList.remove("open");
      $("#settings-toggle").setAttribute("aria-expanded", "false");
    }
  });
  $("#composer").onsubmit = (e) => { e.preventDefault(); send($("#msg").value); };
  $("#msg").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("#msg").value); } };
  $("#mic").onclick = toggleMic;
  $("#chat-collapse").onclick = () => {
    const collapsed = document.body.classList.toggle("chat-collapsed");
    $("#chat-collapse").setAttribute("aria-expanded", String(!collapsed));
    $("#chat-collapse").textContent = collapsed ? t("chatShow") : t("chatHide");
  };
  document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => send(c.textContent)));
  $("#refresh-bookings").onclick = loadBookings;
  $("#dir-filters").onsubmit = (e) => { e.preventDefault(); loadDirectory(); };
  $("#dir-lang").onchange = loadDirectory;
  $("#dir-meeting").onchange = loadDirectory;
  $("#dir-text").oninput = () => { clearTimeout(dirTimer); dirTimer = setTimeout(loadDirectory, 250); };
  $("#refresh-metrics").onclick = loadMetrics;
  $("#metrics-range").onchange = (e) => {
    $("#custom-range").hidden = e.target.value !== "custom";
    if (e.target.value !== "custom") loadMetrics();
  };
  $("#metrics-year").onchange = applyYearMonthRange;
  $("#metrics-month").onchange = applyYearMonthRange;
  $("#metrics-quarter").onchange = loadMetrics;
  $("#metrics-start").onchange = loadMetrics;
  $("#metrics-end").onchange = loadMetrics;
  $("#export-metrics").onclick = exportMetricsCsv;
  ["#r-adv", "#r-cli", "#r-aum", "#r-fee"].forEach((s) => ($(s).oninput = calcRoi));
  calcRoi();
  setupMetricDateSelectors();
  applyI18n();
  addMsg("bot", t("greeting"), { i18n: { key: "greeting" } });
  restoreBooking();
  if (!CFG.apiUrl) addMsg("bot", t("setupNote"), { cls: "error", i18n: { key: "setupNote" } });
}
init();
