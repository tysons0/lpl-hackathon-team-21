const DEMO_ADVISORS = [
  { advisor_id: "adv-901", name: "Sofia Ramirez", city: "Miami, FL", languages: ["English", "Spanish"], meeting_types: ["virtual", "in-person"], focus: ["first-time investors", "first-time home buyers"], min_assets: 0, bio: "A patient guide for first-time investors and future home buyers." },
  { advisor_id: "adv-902", name: "Jordan Ellis", city: "Charlotte, NC", languages: ["English"], meeting_types: ["virtual"], focus: ["student loans", "retirement saving"], min_assets: 0, bio: "Helps young professionals balance student loans, savings and retirement goals." },
  { advisor_id: "adv-demo-03", name: "Priya Shah", city: "Austin, TX", languages: ["English", "Spanish"], meeting_types: ["virtual", "in-person"], focus: ["retirement planning", "family finances"], min_assets: 0, bio: "Works with families preparing for retirement and the next generation." },
  { advisor_id: "adv-demo-04", name: "Marcus Bell", city: "Boston, MA", languages: ["English"], meeting_types: ["virtual", "in-person"], focus: ["small business owners", "business transitions"], min_assets: 0, bio: "Helps business owners prepare for major changes and life after work." },
];

const QUESTIONS = {
  en: {
    goal: "What would you like help planning or understanding?",
    mode: "Would you prefer to meet virtually or in person?",
    geography: "What city or state should I use when looking for an advisor?",
    assets: "You can share a broad savings range, or say you would rather not share it.",
  },
  es: {
    goal: "¿Sobre qué le gustaría recibir ayuda o información?",
    mode: "¿Prefiere reunirse virtualmente o en persona?",
    geography: "¿Qué ciudad o estado debo usar para buscar un asesor?",
    assets: "Puede compartir un rango general de ahorros o decir que prefiere no compartirlo.",
  },
  zh: {
    goal: "您希望在哪方面获得规划或了解方面的帮助？",
    mode: "您更喜欢线上还是面对面会谈？",
    geography: "您希望我根据哪个城市或州寻找顾问？",
    assets: "您可以提供大致的资产范围，也可以选择不透露。",
  },
};

const GOALS = [
  { id: "retirement", terms: /\b(retir(?:e|ement|ing)|401k|pension)\b/i, label: "retirement planning" },
  { id: "home", terms: /\b(home|house|first[- ]time buyer)\b/i, label: "first-time home buyers" },
  { id: "business", terms: /\b(business|company|sell my firm)\b/i, label: "small business owners" },
  { id: "investing", terms: /\b(invest(?:ing|ment)?|start saving)\b/i, label: "first-time investors" },
];
const PLACES = [
  ["Miami", "FL"], ["Charlotte", "NC"], ["Austin", "TX"], ["Boston", "MA"],
  ["San Diego", "CA"], ["Fort Mill", "SC"],
];
const ASSET_CEILINGS = { under_25k: 25000, "25k_100k": 100000, "100k_500k": 500000, "500k_plus": Infinity, prefer_not_to_say: Infinity };

export function createLocalIntake() {
  return { servicesNeeded: [], communicationMode: null, geography: null, investableAssetsBand: null, languagePref: "en", sourceText: "" };
}

function updateFromText(text, intake, language) {
  const goal = GOALS.find((item) => item.terms.test(text));
  if (goal && !intake.servicesNeeded.includes(goal.label)) intake.servicesNeeded.push(goal.label);

  if (/\b(in[- ]person|face[- ]to[- ]face|office)\b/i.test(text)) intake.communicationMode = "in-person";
  else if (/\b(virtual|online|video call|zoom)\b/i.test(text)) intake.communicationMode = "virtual";

  const place = PLACES.find(([city, state]) => new RegExp(`\\b(?:${city.replace(" ", "[- ]")}|${state})\\b`, "i").test(text));
  if (place) intake.geography = { city: place[0], state: place[1] };
  else {
    const state = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
    if (state) intake.geography = { state: state[0].toUpperCase() };
  }

  if (/\b(prefer not to say|rather not share|don't want to share|do not want to share|prefer not to share)\b/i.test(text)) {
    intake.investableAssetsBand = "prefer_not_to_say";
  } else {
    const band = text.match(/\b(under|below|less than)\s*\$?\s*(25\s*k|25,?000)\b/i);
    const range = text.match(/\b(25\s*k|25,?000)\s*(?:to|[-–])\s*(100\s*k|100,?000)\b/i);
    const mid = text.match(/\b(100\s*k|100,?000)\s*(?:to|[-–])\s*(500\s*k|500,?000)\b/i);
    const high = text.match(/\b(over|more than|above)\s*\$?\s*(500\s*k|500,?000)\b/i);
    if (band) intake.investableAssetsBand = "under_25k";
    else if (range) intake.investableAssetsBand = "25k_100k";
    else if (mid) intake.investableAssetsBand = "100k_500k";
    else if (high) intake.investableAssetsBand = "500k_plus";
  }
  intake.languagePref = language;
}

function matchesFor(intake) {
  const goal = GOALS.find((item) => intake.servicesNeeded.includes(item.label));
  const requestedCity = intake.geography?.city?.toLowerCase();
  const requestedState = intake.geography?.state?.toLowerCase();
  const ceiling = ASSET_CEILINGS[intake.investableAssetsBand];
  return DEMO_ADVISORS.filter((advisor) => {
    const specialtyFit = goal && advisor.focus.some((focus) => focus.includes(goal.id) || focus.includes(goal.label.split(" ")[0]));
    const languageName = { en: "English", es: "Spanish", zh: "Mandarin" }[intake.languagePref];
    const languageFit = !languageName || advisor.languages.includes(languageName);
    const meetingFit = advisor.meeting_types.includes(intake.communicationMode);
    const locationFit = intake.communicationMode !== "in-person" ||
      ((!requestedCity || advisor.city.split(",")[0].toLowerCase() === requestedCity) &&
       (!requestedState || advisor.city.split(",")[1]?.trim().toLowerCase() === requestedState));
    return Boolean(specialtyFit && languageFit && meetingFit && locationFit && advisor.min_assets <= ceiling);
  }).map((advisor) => ({
    ...advisor,
    score: 100,
    fit: "100%",
    reasons: ["Supports your stated planning goal.", `Offers ${intake.communicationMode} meetings.`, `Supports ${intake.languagePref} conversations.`],
    fee_disclosure: "Fee and compensation arrangements vary. Confirm services and total cost directly with an advisor.",
    demo: true,
  }));
}

export function replyToLocalTurn(message, language, intake) {
  intake.sourceText = `${intake.sourceText} ${message}`.trim();
  updateFromText(message, intake, language);
  const question = !intake.servicesNeeded.length ? "goal"
    : !intake.communicationMode ? "mode"
      : !intake.geography ? "geography"
        : !intake.investableAssetsBand ? "assets" : null;
  if (question) return { ready: false, followup: (QUESTIONS[language] || QUESTIONS.en)[question], missing: question };
  return { ready: true, matches: matchesFor(intake), missing: null };
}
