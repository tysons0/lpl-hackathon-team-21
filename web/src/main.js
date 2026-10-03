import "./style.css";
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
const T = {
  en: {
    tagline: "Find your advisor. Walk in ready.", tabInvestor: "Investor", tabAdvisor: "Advisor", tabDashboard: "Business dashboard",
    languageLabel: "Language", textSize: "Text size", settings: "Settings", prefContrast: "High contrast", prefRead: "Read replies aloud",
    howEyebrow: "Advisor Match", howTitle: "How it works",
    howStep1Title: "1. Tell us your goals", howStep1Body: "Chat or speak in your own words: what you're saving for, what worries you, and how you like to meet. There are no wrong answers.",
    howStep2Title: "2. Meet 3 matches", howStep2Body: "See three advisors who fit your goals, language and schedule, with a plain-language reason for each one.",
    howStep3Title: "3. Walk in ready", howStep3Body: "Book a time and get a personal prep kit: key terms explained simply, questions to ask, and what to bring. Your advisor gets a briefing too, so you start with your goals, not paperwork.",
    howFootnote: "Free to use. We help you prepare, not invest: your advisor gives the advice.",
    investorTitle: "Let's find the right advisor for you",
    investorLead: "Answer a few quick questions by typing or speaking. It takes about 3 minutes, and there are no wrong answers.",
    starter1: "I'm new to investing and want help getting started", starter2: "I want to buy a house in 5 years but I have student loans",
    msgLabel: "Your message", msgPh: "Type or tap the mic and speak…", send: "Send",
    matchesTitle: "Your matches", matchesEmpty: "Your top 3 advisors will appear here, with the reasons each one fits you.",
    advisorTitle: "New prospects", advisorLead: "Matched clients arrive with a briefing, so the first meeting starts with their goals, not paperwork. Designed to drop into ClientWorks.",
    dashTitle: "Business impact dashboard", dashLead: "Track advisor matches, meeting momentum, and the value this experience could unlock.", refresh: "Refresh",
    roiTitle: "Business impact calculator (illustrative)", roiNote: "Move the sliders to model scenarios. Assumptions are inputs, not forecasts.",
    greeting: "Hi! I'm Advisor Match. I'll ask a few short questions and then show you advisors who fit you. To start: what's one money goal you have right now?",
    readAloud: "Read aloud", thinking: "Thinking…", listening: "Listening… speak now. Tap the mic again to stop.",
    micStart: "Start speaking", micStop: "Stop speaking", choose: "Choose this advisor",
    booked: "You're booked!", with: "with", when: "When", chooseMsg: (n) => `I'd like to meet with ${n}.`,
    matchesAnnounce: (n) => `${n} advisors matched`,
    error: "Sorry, something went wrong. Please try again.",
    tabDirectory: "All advisors", dirTitle: "All advisors", dirLead: "Browse every advisor, not just your top matches. Filter by language or meeting type, then ask to meet anyone who looks right.",
    dirLanguage: "Language", dirMeeting: "Meeting type", dirAny: "Any", dirVirtual: "Virtual", dirInPerson: "In person", dirSearch: "Search", dirSearchPh: "e.g. home buyers, Miami",
    dirCount: (n, total) => `Showing ${n} of ${total} advisors`, dirEmpty: "No advisors match these filters. Try removing one.",
    openSlots: (n) => (n > 0 ? `Accepting new clients · ${n} open slot${n === 1 ? "" : "s"}` : "Not accepting new clients right now"), askToMeet: "Ask to meet",
    bookTitle: (n) => `Book a first meeting with ${n}`, bkFirstName: "Your first name", bkDate: "Date", bkTime: "Time",
    bkPickDate: "Pick a date first", bkNoTimes: "No open times that day. Try another date.", bkTaken: "taken",
    bkPurpose: "What would you like to talk about?", bkPurposePh: "e.g. Saving for a first home while paying off student loans",
    bkPurposeHint: "Optional. Please don't include phone numbers, emails or account numbers.",
    bkSubmit: "Book meeting", bkSave: "Save changes", bkCancel: "Cancel", bkChange: "Change details",
    bkSaved: "Changes saved.", bkWeekdays: "Weekdays only, advisor's local time.", bkPurposeLabel: "Meeting about",
    bkChatMsg: (n, when) => `I'd like to meet with ${n} on ${when}.`, bkChars: (n, max) => `${n}/${max}`,
    bkCancelMeeting: "Cancel meeting", bkCalendar: "Add to Google Calendar", bkConfirmCancel: (n) => `Cancel your meeting with ${n}?`, bkYesCancel: "Yes, cancel it",
    bkKeep: "Keep it", bkCancelled: "Meeting cancelled", bkCancelledNote: "The time is free again and your advisor has been told.",
    bkChatTip: "You can also type changes in the chat, e.g. \"move it to Thursday at 3pm\" or \"cancel my meeting\".",
    matchScore: (n) => `${n}% match`, whyFit: "Why this match",
    langNames: { English: "English", Spanish: "Spanish", Mandarin: "Mandarin" },
    reason: {
      language: (v, t) => `Speaks ${t.langNames[v] ?? v}, your preferred language`,
      meeting: (v) => (v === "in-person" ? "Offers in-person meetings" : "Offers virtual meetings"),
      focus: (v) => `Focuses on ${v}`,
      availability: (n) => `${n} open first-meeting slot${n === 1 ? "" : "s"}`,
    },
    reasonShort: {
      language: (v, t) => t.langNames[v] ?? v, meeting: (v) => (v === "in-person" ? "In person" : "Virtual"),
      focus: (v) => v, availability: (n) => `${n} open slot${n === 1 ? "" : "s"}`,
    },
    more: "More", less: "Less", moreAbout: (n) => `More about ${n}`,
    driversNote: "Ranked mostly by", drivers: { expertise: "fit with your goals", language: "language", meeting: "meeting type", availability: "availability" },
    feeLabel: "How they're paid", formCrs: "You'll get a Form CRS: a short summary of services, fees and conflicts of interest.",
  },
  es: {
    tagline: "Encuentre a su asesor. Llegue preparado.", tabInvestor: "Inversionista", tabAdvisor: "Asesor", tabDashboard: "Panel de negocio",
    languageLabel: "Idioma", textSize: "Tamaño del texto", settings: "Ajustes", prefContrast: "Alto contraste", prefRead: "Leer respuestas en voz alta",
    howEyebrow: "Advisor Match", howTitle: "Cómo funciona",
    howStep1Title: "1. Cuéntenos sus metas", howStep1Body: "Escriba o hable con sus propias palabras: para qué está ahorrando, qué le preocupa y cómo prefiere reunirse. No hay respuestas incorrectas.",
    howStep2Title: "2. Conozca 3 opciones", howStep2Body: "Vea tres asesores que coinciden con sus metas, idioma y horario, con una explicación sencilla de cada coincidencia.",
    howStep3Title: "3. Llegue preparado", howStep3Body: "Reserve una cita y reciba una guía personal: conceptos clave explicados de forma sencilla, preguntas para hacer y qué llevar. Su asesor también recibe un resumen de sus metas.",
    howFootnote: "Uso gratuito. Le ayudamos a prepararse, no a invertir: su asesor le da el consejo.",
    investorTitle: "Encontremos al asesor ideal para usted",
    investorLead: "Responda unas preguntas escribiendo o hablando. Toma unos 3 minutos y no hay respuestas incorrectas.",
    starter1: "Soy nuevo en inversiones y quiero ayuda para empezar", starter2: "Quiero comprar una casa en 5 años pero tengo préstamos estudiantiles",
    msgLabel: "Su mensaje", msgPh: "Escriba o toque el micrófono y hable…", send: "Enviar",
    matchesTitle: "Sus asesores", matchesEmpty: "Aquí aparecerán sus 3 mejores asesores y por qué le convienen.",
    advisorTitle: "Nuevos prospectos", advisorLead: "Los clientes llegan con un resumen, así la primera reunión empieza con sus metas.",
    dashTitle: "Embudo de prospecto a cliente", dashLead: "Cada registro se mide: el impacto se ve.", refresh: "Actualizar",
    roiTitle: "Calculadora de impacto (ilustrativa)", roiNote: "Mueva los controles para modelar escenarios.",
    greeting: "¡Hola! Soy Advisor Match. Le haré unas preguntas cortas y luego le mostraré asesores ideales para usted. Para empezar: ¿cuál es una meta de dinero que tiene ahora?",
    readAloud: "Leer en voz alta", thinking: "Pensando…", listening: "Escuchando… hable ahora. Toque el micrófono otra vez para parar.",
    micStart: "Empezar a hablar", micStop: "Dejar de hablar", choose: "Elegir este asesor",
    booked: "¡Cita reservada!", with: "con", when: "Cuándo", chooseMsg: (n) => `Me gustaría reunirme con ${n}.`,
    matchesAnnounce: (n) => `${n} asesores encontrados`,
    error: "Lo siento, algo salió mal. Intente de nuevo.",
    tabDirectory: "Todos los asesores", dirTitle: "Todos los asesores", dirLead: "Vea a todos los asesores, no solo sus mejores coincidencias. Filtre por idioma o tipo de reunión y pida reunirse con quien le parezca bien.",
    dirLanguage: "Idioma", dirMeeting: "Tipo de reunión", dirAny: "Cualquiera", dirVirtual: "Virtual", dirInPerson: "Presencial", dirSearch: "Buscar", dirSearchPh: "p. ej. compradores de casa, Miami",
    dirCount: (n, total) => `Mostrando ${n} de ${total} asesores`, dirEmpty: "Ningún asesor coincide con estos filtros. Quite alguno.",
    openSlots: (n) => (n > 0 ? `Acepta clientes nuevos · ${n} cita${n === 1 ? "" : "s"} disponible${n === 1 ? "" : "s"}` : "No acepta clientes nuevos por ahora"), askToMeet: "Pedir reunión",
    bookTitle: (n) => `Reserve una primera reunión con ${n}`, bkFirstName: "Su nombre", bkDate: "Fecha", bkTime: "Hora",
    bkPickDate: "Primero elija una fecha", bkNoTimes: "No hay horarios libres ese día. Pruebe otra fecha.", bkTaken: "ocupado",
    bkPurpose: "¿De qué le gustaría hablar?", bkPurposePh: "p. ej. Ahorrar para mi primera casa mientras pago préstamos estudiantiles",
    bkPurposeHint: "Opcional. No incluya números de teléfono, correos ni números de cuenta.",
    bkSubmit: "Reservar reunión", bkSave: "Guardar cambios", bkCancel: "Cancelar", bkChange: "Cambiar detalles",
    bkSaved: "Cambios guardados.", bkWeekdays: "Solo días laborables, hora local del asesor.", bkPurposeLabel: "Tema",
    bkChatMsg: (n, when) => `Me gustaría reunirme con ${n} el ${when}.`, bkChars: (n, max) => `${n}/${max}`,
    bkCancelMeeting: "Cancelar reunión", bkCalendar: "Agregar a Google Calendar", bkConfirmCancel: (n) => `¿Cancelar su reunión con ${n}?`, bkYesCancel: "Sí, cancelarla",
    bkKeep: "Mantenerla", bkCancelled: "Reunión cancelada", bkCancelledNote: "El horario quedó libre y su asesor ya fue avisado.",
    bkChatTip: "También puede escribir cambios en el chat, p. ej. \"muévela al jueves a las 3pm\" o \"cancela mi reunión\".",
    matchScore: (n) => `${n}% de coincidencia`, whyFit: "Por qué coincide",
    langNames: { English: "inglés", Spanish: "español", Mandarin: "mandarín" },
    reason: {
      language: (v, t) => `Habla ${t.langNames[v] ?? v}, su idioma preferido`,
      meeting: (v) => (v === "in-person" ? "Ofrece reuniones presenciales" : "Ofrece reuniones virtuales"),
      focus: (v) => `Se especializa en: ${v}`,
      availability: (n) => `${n} cita${n === 1 ? "" : "s"} disponible${n === 1 ? "" : "s"}`,
    },
    reasonShort: {
      language: (v, t) => t.langNames[v] ?? v, meeting: (v) => (v === "in-person" ? "Presencial" : "Virtual"),
      focus: (v) => v, availability: (n) => `${n} cita${n === 1 ? "" : "s"} libre${n === 1 ? "" : "s"}`,
    },
    more: "Más", less: "Menos", moreAbout: (n) => `Más sobre ${n}`,
    driversNote: "Clasificado principalmente por", drivers: { expertise: "afinidad con sus metas", language: "idioma", meeting: "tipo de reunión", availability: "disponibilidad" },
    feeLabel: "Cómo cobra", formCrs: "Recibirá un Form CRS: un resumen breve de servicios, costos y conflictos de interés.",
  },
  zh: {
    languageLabel: "语言", textSize: "文字大小", settings: "设置", prefContrast: "高对比度", prefRead: "朗读回复",
    howEyebrow: "Advisor Match", howTitle: "使用方法",
    howStep1Title: "1. 告诉我们您的目标", howStep1Body: "用自己的话输入或说出您正在为什​​么储蓄、担心什么，以及喜欢怎样见面。没有错误答案。",
    howStep2Title: "2. 认识 3 位匹配顾问", howStep2Body: "查看符合您目标、语言和时间安排的三位顾问，并了解每位顾问适合您的简单原因。",
    howStep3Title: "3. 做好会面准备", howStep3Body: "预约时间并获得个人准备清单：简单解释的关键术语、可以提出的问题以及需要携带的材料。您的顾问也会收到一份目标摘要。",
    howFootnote: "免费使用。我们帮助您做好准备，而不是替您投资：您的顾问会提供建议。",
    tabDirectory: "所有顾问", dirTitle: "所有顾问", dirLead: "浏览所有顾问，而不仅仅是您的最佳匹配。按语言或会议方式筛选，然后向合适的顾问申请会面。",
    dirLanguage: "语言", dirMeeting: "会议方式", dirAny: "不限", dirVirtual: "线上", dirInPerson: "面对面", dirSearch: "搜索", dirSearchPh: "例如：首次购房、Miami",
    dirCount: (n, total) => `显示 ${n} / ${total} 位顾问`, dirEmpty: "没有符合这些条件的顾问。请尝试移除一个筛选条件。",
    openSlots: (n) => (n > 0 ? `接受新客户 · ${n} 个可预约时段` : "目前不接受新客户"), askToMeet: "申请会面",
    bookTitle: (n) => `预约与 ${n} 的首次会面`, bkFirstName: "您的名字", bkDate: "日期", bkTime: "时间",
    bkPickDate: "请先选择日期", bkNoTimes: "当天没有空闲时间，请选择其他日期。", bkTaken: "已约满",
    bkPurpose: "您想谈些什么？", bkPurposePh: "例如：在偿还学生贷款的同时为首套房储蓄",
    bkPurposeHint: "选填。请勿填写电话号码、电子邮件或账户号码。",
    bkSubmit: "预约会面", bkSave: "保存更改", bkCancel: "取消", bkChange: "修改详情",
    bkSaved: "更改已保存。", bkWeekdays: "仅限工作日，顾问当地时间。", bkPurposeLabel: "会面主题",
    bkChatMsg: (n, when) => `我想在 ${when} 与 ${n} 会面。`, bkChars: (n, max) => `${n}/${max}`,
    bkCancelMeeting: "取消会面", bkCalendar: "添加到 Google 日历", bkConfirmCancel: (n) => `要取消与 ${n} 的会面吗？`, bkYesCancel: "是的，取消",
    bkKeep: "保留", bkCancelled: "会面已取消", bkCancelledNote: "该时间已释放，并已通知您的顾问。",
    bkChatTip: "您也可以在聊天中输入修改，例如“改到周四下午3点”或“取消我的会面”。",
    matchScore: (n) => `匹配度 ${n}%`, whyFit: "匹配原因",
    langNames: { English: "英语", Spanish: "西班牙语", Mandarin: "普通话" },
    reason: {
      language: (v, t) => `会说${t.langNames[v] ?? v}，您偏好的语言`,
      meeting: (v) => (v === "in-person" ? "提供面对面会议" : "提供线上会议"),
      focus: (v) => `专注于：${v}`,
      availability: (n) => `${n} 个可预约时段`,
    },
    reasonShort: {
      language: (v, t) => t.langNames[v] ?? v, meeting: (v) => (v === "in-person" ? "面对面" : "线上"),
      focus: (v) => v, availability: (n) => `${n} 个空档`,
    },
    more: "更多", less: "收起", moreAbout: (n) => `关于 ${n} 的更多信息`, choose: "选择这位顾问",
    driversNote: "主要排序依据", drivers: { expertise: "与您目标的契合度", language: "语言", meeting: "会议方式", availability: "可预约时间" },
    feeLabel: "收费方式", formCrs: "您将收到 Form CRS：一份关于服务、费用和利益冲突的简短说明。",
  },
};
const LANGUAGE_NAMES = { en: "English", es: "Spanish", zh: "Mandarin" };
const state = { lang: "en", autoread: false, sessionId: null, busy: false, dictation: null, lastMatches: [] };
const t = (k) => (T[state.lang] ?? T.en)[k] ?? T.en[k];

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#mic").setAttribute("aria-label", state.dictation ? t("micStop") : t("micStart"));
}

// ---------- tiny safe markdown ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(text) {
  const lines = esc(text).split(/\n/);
  let html = "", list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1<em>$2</em>");
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
    const b = document.createElement("button");
    b.className = "speak";
    b.type = "button";
    b.textContent = "🔊 " + t("readAloud");
    b.setAttribute("aria-label", t("readAloud"));
    b.onclick = () => speak(div.querySelector(".msg-body")?.dataset.speakText || text);
    body.dataset.speakText = text;
    body.appendChild(b);
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
    const button = document.createElement("button");
    button.className = "speak";
    button.type = "button";
    button.textContent = "🔊 " + t("readAloud");
    button.setAttribute("aria-label", t("readAloud"));
    button.onclick = () => speak(body.dataset.speakText);
    body.appendChild(button);
  }
}

async function translateChatHistory() {
  const messages = [...chat().querySelectorAll(".msg[data-source-text]")].filter((div) => !div.classList.contains("typing") && !div.classList.contains("error"));
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
async function speak(text) {
  try {
    const cleanText = plain(text).trim();
    if (!cleanText) return;
    const { audio_b64 } = await post("/speak", { text: cleanText, lang: state.lang });
    if (!audio_b64) throw new Error("Speech audio was not returned by the server");
    if (audioEl) audioEl.pause();
    audioEl = new Audio("data:audio/mpeg;base64," + audio_b64);
    audioEl.onended = () => { audioEl = null; };
    await audioEl.play();
  } catch (e) {
    console.warn("[speak]", e);
    $("#live-hint").textContent = `Read aloud unavailable: ${e.message}`;
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
    const res = await post("/chat", { message: text, session_id: state.sessionId, lang: LANGUAGE_NAMES[state.lang], ...extra });
    state.sessionId = res.session_id;
    typing.remove();
    addMsg("bot", res.reply || "…");
    if (res.matches) renderMatches((state.lastMatches = res.matches));
    if (res.booking) { saveBookingLocally(res.booking); renderBooking(res.booking); }
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
  return fn ? fn(r.value, L.langNames ? L : T.en) : "";
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
    const fee = d ? `${d.fee_model} · ${d.platform}` : "";
    const id = `match-more-${++moreId}`;
    card.innerHTML = `
      <div class="card-head">${advisorPicture(a, esc)}
        <div class="card-title">
          <h3><span class="name" title="${esc(a.name)}">${esc(a.name)}</span>${a.fit ? `<span class="fit">${esc(a.fit)}</span>` : ""}</h3>
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
        <div class="meta">${esc(a.meeting_types.join(" / "))}</div>
        <div class="tags">${a.languages.map((l) => `<span class="tag">${esc(l)}</span>`).join("")}${a.focus.map((f) => `<span class="tag">${esc(f)}</span>`).join("")}</div>
        ${reasons.length ? `<div class="why"><strong>${esc(t("whyFit"))}</strong><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${drivers ? `<div class="fineprint">${esc(t("driversNote"))}: ${esc(drivers)}</div>` : ""}</div>` : ""}
        <p class="meta">${esc(a.bio)}</p>
        ${d ? `<div class="disclosure"><strong>${esc(t("feeLabel"))}:</strong> ${esc(fee)}<div class="fineprint">${esc(t("formCrs"))}</div></div>` : ""}
      </div>`;
    const more = card.querySelector(".more"), panel = card.querySelector(".match-more");
    more.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      more.textContent = `${t(open ? "less" : "more")} ${open ? "▴" : "▾"}`;
    };
    card.querySelector(".choose").onclick = () => openBookingForm(a);
    wirePhotoFallbacks(card);
    box.appendChild(card);
  });
  // On narrow screens the matches sit below the chat: bring all three into view together.
  const side = $(".side");
  if (side.getBoundingClientRect().top > innerHeight * 0.6) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    side.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }
}

// ---------- booking: pick a date, a time and what the meeting is about ----------
const BOOKING_KEY = "advisor-match.booking";
function saveBookingLocally(b) {
  const bookings = state.bookings || [];
  const index = bookings.findIndex((item) => item.booking_id === b.booking_id);
  if (index >= 0) bookings[index] = b;
  else bookings.push(b);
  state.bookings = bookings.filter((item) => item.status !== "cancelled");
  state.booking = b;
  try { localStorage.setItem(BOOKING_KEY, JSON.stringify({ sessionId: state.sessionId, bookings: state.bookings })); } catch (_) {}
  renderBookings(state.bookings);
}
function forgetBooking() {
  state.booking = null;
  try { localStorage.removeItem(BOOKING_KEY); } catch (_) {}
}
// Show the booking saved in this browser only if the server still has it. Cleared, corrupt or blocked
// storage, or a booking that was deleted or cancelled elsewhere, means there is no booking.
async function restoreBooking() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(BOOKING_KEY) || "null"); } catch (_) { forgetBooking(); return; }
  if (!saved) return;
  const { sessionId, booking } = saved;
  if (!booking?.booking_id || !sessionId) { forgetBooking(); return; }
  try {
    const { booking: latest } = await post("/bookings/get", { booking_id: booking.booking_id, session_id: sessionId });
    if (!latest || latest.status === "cancelled") { forgetBooking(); return; }
    state.sessionId = sessionId;
    saveBookingLocally(latest);
    renderBooking(latest);
  } catch (e) {
    if (e.status) { forgetBooking(); return; }  // the server answered: the booking is gone or not ours
    state.sessionId = sessionId;  // server unreachable: keep showing what we saved
    state.booking = booking;
    renderBooking(booking);
  }
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextWeekday(from) {
  const d = new Date(from);
  do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}
function friendlyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const loc = { en: "en-US", es: "es-US", zh: "zh-CN" }[state.lang] || "en-US";
  return new Date(y, m - 1, d).toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// advisor: {advisor_id, name}; existing: a booking to edit (date, time and purpose prefilled)
function openBookingForm(advisor, existing = null) {
  const box = $("#booking");
  const today = new Date();
  const min = isoDay(nextWeekday(today));
  const max = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60));
  const purpose = existing?.meeting_purpose || "";
  box.innerHTML = `
    <form class="booking-form" id="booking-form" novalidate>
      <h3>${esc(t("bookTitle")(advisor.name))}</h3>
      ${existing ? "" : `<label for="bk-name">${esc(t("bkFirstName"))}
        <input id="bk-name" name="first_name" required maxlength="40" autocomplete="given-name" /></label>`}
      <div class="bk-row">
        <label for="bk-date">${esc(t("bkDate"))}
          <input id="bk-date" type="date" required min="${min}" max="${max}" value="${esc(existing?.meeting_date || min)}" /></label>
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

  async function loadTimes() {
    err.textContent = "";
    timeEl.innerHTML = `<option value="">${esc(t("thinking"))}</option>`;
    try {
      const { times } = await post("/availability", { advisor_id: advisor.advisor_id, date: dateEl.value });
      const keep = existing && dateEl.value === existing.meeting_date ? existing.meeting_time : null;
      const open = (s) => s.available || s.time === keep;
      if (!times.some(open)) { timeEl.innerHTML = `<option value="">${esc(t("bkNoTimes"))}</option>`; return; }
      timeEl.innerHTML = times.map((s) =>
        `<option value="${s.time}" ${open(s) ? "" : "disabled"}>${esc(s.label)}${open(s) ? "" : ` (${esc(t("bkTaken"))})`}</option>`).join("");
      timeEl.value = keep || times.find(open).time;
    } catch (e) {
      timeEl.innerHTML = `<option value="">${esc(t("bkPickDate"))}</option>`;
      err.textContent = e.message;
    }
  }
  dateEl.onchange = loadTimes;
  loadTimes();

  $("#bk-cancel").onclick = () => { if (state.bookings?.length) renderBookings(state.bookings); else box.innerHTML = ""; };
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
        saveBookingLocally(booking);
        renderBooking(booking, t("bkSaved"));
      } else {
        const when = `${friendlyDate(dateEl.value)}, ${timeEl.selectedOptions[0].textContent}`;
        await send((T[state.lang] ?? T.en).bkChatMsg?.(advisor.name, when) ?? T.en.bkChatMsg(advisor.name, when), {
          selected_advisor_id: advisor.advisor_id,
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

function renderBooking(b, notice = "") {
  state.booking = b;
  renderBookings([b], notice);
}

function renderBookings(bookings, notice = "") {
  const box = $("#booking");
  const active = bookings.filter((item) => item.status !== "cancelled");
  if (!active.length) { box.innerHTML = ""; return; }
  box.innerHTML = active.map((b) => {
  const time = b.time_slot?.split(" at ")[1] || b.meeting_time;
  const when = b.meeting_date ? `${friendlyDate(b.meeting_date)} · ${time}` : b.time_slot;
  const calendarLink = b.meeting_date ? (() => {
    const [year, month, day] = b.meeting_date.split("-").map(Number);
    const [hour, minute] = (b.meeting_time || "00:00").split(":").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const stamp = (date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}00`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Meeting with ${b.advisor_name || "your advisor"}`,
      dates: `${stamp(start)}/${stamp(end)}`,
      details: b.meeting_purpose || "",
      location: b.location || "",
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  })() : "";
  const advisor = { advisor_id: b.advisor_id, name: b.advisor_name };
  if (b.status === "cancelled") {
    // A cancelled meeting simply disappears; screen readers still hear that it was cancelled.
    $("#booking").innerHTML = "";
    state.booking = null;
    try { localStorage.removeItem(BOOKING_KEY); } catch (_) {}
    $("#booking-announcement").textContent = `${t("bkCancelled")}. ${t("bkCancelledNote")}`;
    return;
  }
  $("#booking").innerHTML = `
    <div class="booking-card" role="status">
      <h3>✓ ${t("booked")}</h3>
      <div>${esc(b.prospect_name)} ${t("with")} <strong>${esc(b.advisor_name)}</strong></div>
      <div class="meta">${t("when")}: ${esc(when)}</div>
      ${b.meeting_purpose ? `<div class="meta">${esc(t("bkPurposeLabel"))}: ${esc(b.meeting_purpose)}</div>` : ""}
      ${notice && b.booking_id === bookings[0].booking_id ? `<p class="saved-note">${esc(notice)}</p>` : ""}
      <div class="bk-actions">
        ${b.meeting_date ? `<button type="button" class="secondary" id="bk-change">${esc(t("bkChange"))}</button>` : ""}
        ${calendarLink ? `<a class="secondary" href="${esc(calendarLink)}" target="_blank" rel="noopener">${esc(t("bkCalendar"))}</a>` : ""}
        <button type="button" class="secondary danger" id="bk-cancel-meeting">${esc(t("bkCancelMeeting"))}</button>
      </div>
      <div class="bk-confirm" id="bk-confirm" hidden>
        <p>${esc(t("bkConfirmCancel")(b.advisor_name))}</p>
        <div class="bk-actions">
          <button type="button" class="primary danger" id="bk-yes-cancel">${esc(t("bkYesCancel"))}</button>
          <button type="button" class="secondary" id="bk-keep">${esc(t("bkKeep"))}</button>
        </div>
        <p class="form-error" id="bk-cancel-error" role="alert"></p>
      </div>
      <p class="fineprint">${esc(t("bkChatTip"))}</p>
    </div>`;
  }).join("");
  box.querySelectorAll(".bk-change").forEach((button) => button.onclick = () => {
    const booking = active.find((item) => item.booking_id === button.dataset.bookingId);
    openBookingForm({ advisor_id: booking.advisor_id, name: booking.advisor_name }, booking);
  });
  box.querySelectorAll(".bk-cancel-meeting").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    try {
      const { booking } = await post("/bookings/cancel", { booking_id: button.dataset.bookingId, session_id: state.sessionId });
      state.bookings = state.bookings.filter((item) => item.booking_id !== booking.booking_id);
      localStorage.setItem(BOOKING_KEY, JSON.stringify({ sessionId: state.sessionId, bookings: state.bookings }));
      renderBookings(state.bookings);
    } catch (e) { button.disabled = false; }
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
      <div class="card-head">${advisorPicture(a, esc)}<h3>${esc(a.name)}</h3></div>
      <div class="meta">${esc(a.city)} · ${esc(a.meeting_types.join(" / "))}</div>
      <div class="slots ${a.open_slots > 0 ? "open" : ""}">${esc(t("openSlots")(a.open_slots))}</div>
      <div class="tags">${a.languages.map((l) => `<span class="tag">${esc(l)}</span>`).join("")}${a.focus.map((f) => `<span class="tag">${esc(f)}</span>`).join("")}</div>
      <p class="meta">${esc(a.bio)}</p>
      <div class="disclosure"><strong>${esc(t("feeLabel"))}:</strong> ${esc(d.fee_model || "")} · ${esc(d.platform || "")}</div>
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
async function loadBookings() {
  const box = $("#bookings");
  box.innerHTML = `<p class="muted">${t("thinking")}</p>`;
  try {
    const { bookings } = await post("/bookings");
    if (!bookings.length) { box.innerHTML = `<p class="muted">No prospects yet. Complete a booking in the Investor view.</p>`; return; }
    box.innerHTML = "";
    bookings.forEach((b) => {
      const br = b.briefing || {};
      const el = document.createElement("article");
      el.className = "bk";
      el.innerHTML = `
        <h3>${esc(b.prospect_name || "New prospect")} → ${esc(b.advisor_name || b.advisor_id)}</h3>
        <div class="meta">First meeting: ${b.status === "cancelled" ? `<s>${esc(b.time_slot || "")}</s> <span class="crm cancelled-pill">Cancelled</span>` : esc(b.time_slot || "")}
          ${b.crm_status ? `<span class="crm ${b.crm_status === "synced" ? "ok" : ""}">${b.crm_status === "synced" ? "✓ Synced to CRM" : "CRM sync pending"}</span>` : ""}</div>
        <dl>
          ${b.meeting_purpose ? `<dt>Meeting about</dt><dd>${esc(b.meeting_purpose)}</dd>` : ""}
          <dt>Goals</dt><dd>${esc(br.goals || "—")}</dd>
          <dt>Worries</dt><dd>${esc(br.worries || "—")}</dd>
          <dt>Explain simply</dt><dd>${esc(br.topics_to_explain || "—")}</dd>
          <dt>How they prefer to communicate</dt><dd>${esc(br.communication_preferences || "—")}</dd>
        </dl>`;
      box.appendChild(el);
    });
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
}

// ---------- dashboard ----------
const STAGES = [["intake_started", "Intake started"], ["matched", "Matched to advisors"], ["booked", "First meeting booked"], ["briefing_sent", "Advisor briefed"]];
let currentMetricsReport = null;
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
        box.innerHTML = `<p class="muted">Choose both dates to view a custom report.</p>`;
        return;
      }
    }
    const report = await post("/metrics", request);
    const { funnel, start_date, end_date } = report;
    currentMetricsReport = report;
    const matched = funnel.matched || 0;
    const booked = funnel.booked || 0;
    const briefed = funnel.briefing_sent || 0;
    const conversion = matched ? Math.round((booked / matched) * 100) : 0;
    const aum = +$("#r-aum").value;
    const fee = +$("#r-fee").value;
    const opportunity = booked * aum * (fee / 100);
    $("#metrics-day").textContent = `${start_date === end_date ? start_date : `${start_date} to ${end_date}`} · UTC`;
    $("#kpi-matched").textContent = matched.toLocaleString();
    $("#kpi-conversion").textContent = `${conversion}%`;
    $("#kpi-briefed").textContent = briefed.toLocaleString();
    $("#kpi-opportunity").textContent = usd(opportunity);
    renderRecommendations({ matched, booked, briefed, conversion });
    loadInsights(report);
    const max = Math.max(1, ...STAGES.map(([k]) => funnel[k] || 0));
    box.innerHTML = `<div class="meta">${start_date === end_date ? `Daily report · ${esc(start_date)}` : `Report period · ${esc(start_date)} to ${esc(end_date)}`}</div>`;
    STAGES.forEach(([k, label], i) => {
      const v = funnel[k] || 0;
      const row = document.createElement("div");
      row.className = "frow";
      row.innerHTML = `<div>${label}</div><div class="bar" style="width:${(v / max) * 100}%" role="img" aria-label="${label}: ${v}"></div><div class="val">${v}</div>`;
      box.appendChild(row);
      if (i > 0) {
        const prev = funnel[STAGES[i - 1][0]] || 0;
        if (prev) {
          const d = document.createElement("div");
          d.className = "drop";
          d.textContent = `${Math.round((v / prev) * 100)}% carried on from the previous step`;
          box.appendChild(d);
        }
      }
    });
    // Compliance guardrails at work: blocked PII and guardrail interventions (never shown as funnel drop-off).
    const pii = funnel.pii_blocked || 0, gr = funnel.guardrail_blocked || 0;
    const c = document.createElement("div");
    c.className = "meta compliance";

    c.textContent = `Compliance in period: ${pii} message${pii === 1 ? "" : "s"} with personal identifiers blocked · ${gr} guardrail intervention${gr === 1 ? "" : "s"}`;
    box.appendChild(c);

  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
}

async function loadInsights(report) {
  try {
    const result = await post("/insights", {
      funnel: report.funnel,
      start_date: report.start_date,
      end_date: report.end_date,
    });
    renderRecommendations(result.recommendations || []);
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
  const rows = [
    ["Metric", "Value", "Period", "Start date", "End date", "Notes"],
    ["Advisor matches delivered", matched, range, start_date, end_date, "Observed ranked matches"],
    ["Match-to-meeting rate", `${conversion}%`, range, start_date, end_date, "Booked divided by matches"],
    ["Advisor briefs sent", briefed, range, start_date, end_date, "Observed advisor handoffs"],
    ["Modeled annual fee opportunity", usd(booked * aum * (fee / 100)), range, start_date, end_date, `Illustrative model at ${usd(aum)} assets and ${fee.toFixed(2)}% fee`],
    ...STAGES.map(([key, label]) => [label, funnel[key] || 0, range, start_date, end_date, "Observed funnel event count"]),
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

function renderRecommendations(input) {
  if (Array.isArray(input)) {
    $("#recommendations").innerHTML = input.map((item, index) => `<article class="recommendation ${item.priority === "positive" ? "positive" : ""}"><span class="recommendation-number">${index + 1}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><small>${esc(item.metric || "")}</small></div></article>`).join("");
    return;
  }
  const { matched, briefed, conversion } = input;
  const box = $("#recommendations");
  const items = [];
  if (!matched) items.push({ tone: "priority", title: "Create the first proof point", body: "Run 3 to 5 golden-path intakes so the demo can show advisor matches, booking momentum, and a before-and-after story." });
  else if (conversion < 25) items.push({ tone: "priority", title: "Improve match-to-meeting conversion", body: "Test a stronger next step after matching: show the best-fit advisor first, explain why, and offer two concrete meeting times." });
  else items.push({ tone: "positive", title: "Scale the matching motion", body: "Conversion is showing momentum. The biggest upside now comes from routing more qualified prospects into the same guided experience." });
  if (matched && briefed / matched < 0.8) items.push({ tone: "focus", title: "Close the advisor handoff loop", body: "Increase briefing completion so advisors receive goals and concerns before the meeting. This protects the value of the match beyond the first click." });
  if (matched >= 3) items.push({ tone: "focus", title: "Make the value easy to prove", body: "Lead the pitch with matches delivered, booking rate, and modeled fee opportunity. Keep the model labeled illustrative and pair it with observed counts." });
  box.innerHTML = items.map((item, index) => `<article class="recommendation ${item.tone}"><span class="recommendation-number">${index + 1}</span><div><strong>${item.title}</strong><p>${item.body}</p></div></article>`).join("");
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
    if (state.booking && $("#booking .booking-card")) renderBooking(state.booking);
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
  $("#pref-autoread").onchange = (e) => (state.autoread = e.target.checked);
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
    $("#chat-collapse").textContent = collapsed ? "Show chat" : "Hide chat";
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
  addMsg("bot", t("greeting"));
  restoreBooking();
  if (!CFG.apiUrl) addMsg("bot", "Setup note: config.json has no apiUrl yet. Run the deploy script.", { cls: "error" });
}
init();
