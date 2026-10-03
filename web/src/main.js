import "./style.css";
import { startDictation } from "./dictation.js";
import { createLocalIntake, replyToLocalTurn } from "./local-intake.js";
import { createIcons, ArrowUp, AudioLines, ChevronLeft, ChevronRight, Columns2, LockKeyhole, Mic, RotateCcw, Settings2, ShieldCheck, Sparkles, X } from "lucide";

// ---------- config ----------
let CFG = { apiUrl: "", region: "us-east-1", identityPoolId: "" };
const api = (path) => CFG.apiUrl.replace(/\/$/, "") + path;
let adminToken = "";
const icons = { ArrowUp, AudioLines, ChevronLeft, ChevronRight, Columns2, LockKeyhole, Mic, RotateCcw, Settings2, ShieldCheck, Sparkles, X };
const drawIcons = () => createIcons({ icons, attrs: { "stroke-width": 1.8 } });
async function post(path, body = {}) {
  const headers = { "content-type": "application/json" };
  if (adminToken && ["/metrics", "/bookings"].includes(path)) headers["x-admin-token"] = adminToken;
  const r = await fetch(api(path), { method: "POST", headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const error = new Error(data.detail || data.error || `HTTP ${r.status}`); error.code = data.code; error.status = r.status; throw error; }
  return data;
}

// ---------- i18n ----------
const T = {
  en: {
    tagline: "Find your advisor. Walk in ready.", tabInvestor: "Investor", tabAdvisor: "Advisor", tabDashboard: "Business dashboard",
    languageLabel: "Language", textSize: "Text size", settings: "Settings", prefContrast: "High contrast", prefRead: "Read replies aloud",
    howEyebrow: "Advisor Match", howTitle: "How it works",
    howStep1Title: "1. Tell us your goals", howStep1Body: "Chat or speak in your own words: what you're saving for, what worries you, and how you like to meet. There are no wrong answers.",
    howStep2Title: "2. Meet 3 matches", howStep2Body: "See three advisors who fit your goals, language and schedule, with a plain-language reason for each one. Verify any of them on FINRA BrokerCheck.",
    howStep3Title: "3. Walk in ready", howStep3Body: "Book a time and get a personal prep kit: key terms explained simply, questions to ask, and what to bring. Your advisor gets a briefing too, so you start with your goals, not paperwork.",
    howFootnote: "Free to use. We help you prepare, not invest: your advisor gives the advice.",
    investorTitle: "Find your advisor.",
    investorLead: "Start with what matters to you. Find someone who gets it.",
    starter1: "I'm new to investing and want help getting started", starter2: "I want to buy a house in 5 years but I have student loans",
    msgLabel: "Your message", msgPh: "Type or tap the mic and speakÃ¢â‚¬Â¦", send: "Send",
    matchesTitle: "Your matches", matchesEmpty: "Your top 3 advisors will appear here, with the reasons each one fits you.",
    advisorTitle: "New prospects", advisorLead: "Matched clients arrive with a briefing, so the first meeting starts with their goals, not paperwork. Designed to drop into ClientWorks.",
    dashTitle: "Prospect-to-client funnel", dashLead: "Every intake is measured, so impact is visible, not claimed.", refresh: "Refresh",
    roiTitle: "Business impact calculator (illustrative)", roiNote: "Move the sliders to model scenarios. Assumptions are inputs, not forecasts.",
    greeting: "Hi! I'm Advisor Match. I'll ask a few short questions and then show you advisors who fit you. To start: what's one money goal you have right now?",
    readAloud: "Read aloud", thinking: "ThinkingÃ¢â‚¬Â¦", listening: "ListeningÃ¢â‚¬Â¦ speak now. Tap the mic again to stop.",
    micStart: "Start speaking", micStop: "Stop speaking", choose: "Choose this advisor", verify: "Verify on FINRA BrokerCheck",
    booked: "You're booked!", with: "with", when: "When", chooseMsg: (n) => `I'd like to meet with ${n}.`,
    error: "Sorry, something went wrong. Please try again.",
    journeyGoals: "Your priorities", journeyMatches: "Your matches", journeyMeeting: "Your first meeting", conversationTitle: "Let's talk about you", conversationSub: "A few questions. A more personal match.", privateLabel: "Private session", startOver: "Start over", starter3: "I'm thinking about retirement", privacyNote: "No account numbers, passwords, or contact details needed.", emptyEyebrow: "THE RIGHT CONVERSATION CHANGES THINGS", emptyTitle: "More than a financial fit.", compare: "Compare advisors", glossaryTitle: "A little clarity goes a long way", feeTerm: "How are advisors paid?", feeDefinition: "Fee-only advisors charge their clients. Fee-based advisors may also receive commissions. Ask for the total cost in writing.", fiduciaryTerm: "What is a fiduciary?", fiduciaryDefinition: "Someone required to put your interests first when providing advice. Ask which services that duty covers.", adminLabel: "Advisor access token", unlock: "Unlock", localStatus: "Local preview Ã‚Â· nothing leaves this browser", connectedStatus: "Secure advisor matching", advisorCount: (n) => `${n} advisors`, reasons: "Why this may fit", feeDisclosure: "Fee and compensation arrangements vary. Confirm services and total cost directly with an advisor.", scoreLabel: "Preference alignment", bookingNote: "This is a demo request. No appointment was scheduled and no advisor was contacted.", noAdminData: "For your privacy, this demo does not save or display prospect details for advisors.", chatIntro: "I can help you prepare to meet with a financial advisor. What matters most to you right now? For example, planning for retirement, saving for a home, or managing a business transition.", chatShowMatches: "Thanks for sharing. Here are fictional advisors who fit the preferences you shared.", meetingQuestion: "This demo cannot schedule meetings. In a live service, how would you prefer an advisor to contact you?", demoRequested: "Meeting request preview", unavailable: "No contact details were collected.", fitPrimary: "Relevant areas of focus", fitLanguage: "Language match", fitMeeting: "Meeting preference", compareClose: "Close comparison", brokerCheckDemo: "Demo profile. This is not an active advisor listing.", details: "View match details", useBackend: "The matching service is unavailable. Please try again later.", localPreview: "Local preview. Your text stays in this browser. Profiles and matches are fictional.", adminReady: "Access granted.", advisorAccess: "Advisor tools require access provided by your administrator.", sampleData: "Sample data Ã‚Â· fictional profiles",
  },
  es: {
    tagline: "Encuentre a su asesor. Llegue preparado.", tabInvestor: "Inversionista", tabAdvisor: "Asesor", tabDashboard: "Panel de negocio",
    languageLabel: "Idioma", textSize: "TamaÃƒÂ±o del texto", settings: "Ajustes", prefContrast: "Alto contraste", prefRead: "Leer respuestas en voz alta",
    howEyebrow: "Advisor Match", howTitle: "CÃƒÂ³mo funciona",
    howStep1Title: "1. CuÃƒÂ©ntenos sus metas", howStep1Body: "Escriba o hable con sus propias palabras: para quÃƒÂ© estÃƒÂ¡ ahorrando, quÃƒÂ© le preocupa y cÃƒÂ³mo prefiere reunirse. No hay respuestas incorrectas.",
    howStep2Title: "2. Conozca 3 opciones", howStep2Body: "Vea tres asesores que coinciden con sus metas, idioma y horario, con una explicaciÃƒÂ³n sencilla de cada coincidencia. Verifique cualquiera en FINRA BrokerCheck.",
    howStep3Title: "3. Llegue preparado", howStep3Body: "Reserve una cita y reciba una guÃƒÂ­a personal: conceptos clave explicados de forma sencilla, preguntas para hacer y quÃƒÂ© llevar. Su asesor tambiÃƒÂ©n recibe un resumen de sus metas.",
    howFootnote: "Uso gratuito. Le ayudamos a prepararse, no a invertir: su asesor le da el consejo.",
    investorTitle: "Encuentre a su asesor.",
    investorLead: "Empiece por lo que mÃƒÂ¡s le importa. Encuentre a alguien que le entienda.",
    starter1: "Soy nuevo en inversiones y quiero ayuda para empezar", starter2: "Quiero comprar una casa en 5 aÃƒÂ±os pero tengo prÃƒÂ©stamos estudiantiles",
    msgLabel: "Su mensaje", msgPh: "Escriba o toque el micrÃƒÂ³fono y hableÃ¢â‚¬Â¦", send: "Enviar",
    matchesTitle: "Sus asesores", matchesEmpty: "AquÃƒÂ­ aparecerÃƒÂ¡n sus 3 mejores asesores y por quÃƒÂ© le convienen.",
    advisorTitle: "Nuevos prospectos", advisorLead: "Los clientes llegan con un resumen, asÃƒÂ­ la primera reuniÃƒÂ³n empieza con sus metas.",
    dashTitle: "Embudo de prospecto a cliente", dashLead: "Cada registro se mide: el impacto se ve.", refresh: "Actualizar",
    roiTitle: "Calculadora de impacto (ilustrativa)", roiNote: "Mueva los controles para modelar escenarios.",
    greeting: "Ã‚Â¡Hola! Soy Advisor Match. Le harÃƒÂ© unas preguntas cortas y luego le mostrarÃƒÂ© asesores ideales para usted. Para empezar: Ã‚Â¿cuÃƒÂ¡l es una meta de dinero que tiene ahora?",
    readAloud: "Leer en voz alta", thinking: "PensandoÃ¢â‚¬Â¦", listening: "EscuchandoÃ¢â‚¬Â¦ hable ahora. Toque el micrÃƒÂ³fono otra vez para parar.",
    micStart: "Empezar a hablar", micStop: "Dejar de hablar", choose: "Elegir este asesor", verify: "Verificar en FINRA BrokerCheck",
    booked: "Ã‚Â¡Cita reservada!", with: "con", when: "CuÃƒÂ¡ndo", chooseMsg: (n) => `Me gustarÃƒÂ­a reunirme con ${n}.`,
    error: "Lo siento, algo saliÃƒÂ³ mal. Intente de nuevo.",
    journeyGoals: "Sus prioridades", journeyMatches: "Sus opciones", journeyMeeting: "Su primera reuniÃƒÂ³n", conversationTitle: "Hablemos de usted", conversationSub: "Unas preguntas. Una mejor coincidencia.", privateLabel: "SesiÃƒÂ³n privada", startOver: "Empezar de nuevo", starter3: "Estoy pensando en la jubilaciÃƒÂ³n", privacyNote: "No necesitamos nÃƒÂºmeros de cuenta, contraseÃƒÂ±as ni datos de contacto.", emptyEyebrow: "UNA BUENA CONVERSACIÃƒâ€œN IMPORTA", emptyTitle: "MÃƒÂ¡s que una coincidencia financiera.", compare: "Comparar asesores", glossaryTitle: "Algunos tÃƒÂ©rminos ÃƒÂºtiles", feeTerm: "Ã‚Â¿CÃƒÂ³mo cobran los asesores?", feeDefinition: "Los asesores que cobran solo honorarios cobran a sus clientes. Los que cobran honorarios y comisiones tambiÃƒÂ©n pueden recibir comisiones. Pida el costo total por escrito.", fiduciaryTerm: "Ã‚Â¿QuÃƒÂ© es un fiduciario?", fiduciaryDefinition: "Alguien que debe anteponer sus intereses al brindarle asesoramiento. Pregunte quÃƒÂ© servicios cubre ese deber.", adminLabel: "Token de acceso del asesor", unlock: "Acceder", localStatus: "Vista previa local Ã‚Â· nada sale de este navegador", connectedStatus: "BÃƒÂºsqueda segura de asesores", advisorCount: (n) => `${n} asesores`, reasons: "Por quÃƒÂ© podrÃƒÂ­a convenirle", feeDisclosure: "Los servicios y las formas de compensaciÃƒÂ³n varÃƒÂ­an. Confirme el costo total directamente con el asesor.", scoreLabel: "Coincidencia de preferencias", bookingNote: "Esta es una solicitud de demostraciÃƒÂ³n. No se reservÃƒÂ³ una cita ni se contactÃƒÂ³ a ningÃƒÂºn asesor.", noAdminData: "Para proteger su privacidad, esta demostraciÃƒÂ³n no guarda ni muestra datos de prospectos a asesores.", chatIntro: "Puedo ayudarle a prepararse para reunirse con un asesor financiero. Ã‚Â¿QuÃƒÂ© es lo mÃƒÂ¡s importante para usted ahora? Por ejemplo, planificar la jubilaciÃƒÂ³n, ahorrar para una casa o gestionar el cambio de su negocio.", chatShowMatches: "Gracias. AquÃƒÂ­ tiene asesores ficticios que coinciden con sus preferencias. Los motivos indican cuÃƒÂ¡les de sus preferencias coinciden.", meetingQuestion: "Esta demostraciÃƒÂ³n no puede programar citas. En un servicio activo, Ã‚Â¿cÃƒÂ³mo preferirÃƒÂ­a que un asesor se comunicara con usted?", demoRequested: "Vista previa de solicitud de reuniÃƒÂ³n", unavailable: "No se recopilaron datos de contacto.", fitPrimary: "ÃƒÂreas de experiencia relevantes", fitLanguage: "Coincidencia de idioma", fitMeeting: "Preferencia de reuniÃƒÂ³n", compareClose: "Cerrar comparaciÃƒÂ³n", brokerCheckDemo: "Perfil de demostraciÃƒÂ³n. No es una oferta activa de asesorÃƒÂ­a.", details: "Ver detalles", useBackend: "El servicio de bÃƒÂºsqueda de asesores no estÃƒÂ¡ disponible. IntÃƒÂ©ntelo mÃƒÂ¡s tarde.", localPreview: "Vista previa local. Su texto permanece en este navegador. Los perfiles y las coincidencias son ficticios.", adminReady: "Acceso aprobado.", advisorAccess: "Las herramientas del asesor requieren acceso de su administrador.", sampleData: "Datos de muestra Ã‚Â· perfiles ficticios",
  },
  zh: {
    languageLabel: "Ã¨Â¯Â­Ã¨Â¨â‚¬", textSize: "Ã¦â€“â€¡Ã¥Â­â€”Ã¥Â¤Â§Ã¥Â°Â", settings: "Ã¨Â®Â¾Ã§Â½Â®", prefContrast: "Ã©Â«ËœÃ¥Â¯Â¹Ã¦Â¯â€Ã¥ÂºÂ¦", prefRead: "Ã¦Å“â€”Ã¨Â¯Â»Ã¥â€ºÅ¾Ã¥Â¤Â",
    howEyebrow: "Advisor Match", howTitle: "Ã¤Â½Â¿Ã§â€Â¨Ã¦â€“Â¹Ã¦Â³â€¢",
    howStep1Title: "1. Ã¥â€˜Å Ã¨Â¯â€°Ã¦Ë†â€˜Ã¤Â»Â¬Ã¦â€šÂ¨Ã§Å¡â€žÃ§â€ºÂ®Ã¦Â â€¡", howStep1Body: "Ã§â€Â¨Ã¨â€¡ÂªÃ¥Â·Â±Ã§Å¡â€žÃ¨Â¯ÂÃ¨Â¾â€œÃ¥â€¦Â¥Ã¦Ë†â€“Ã¨Â¯Â´Ã¥â€¡ÂºÃ¦â€šÂ¨Ã¦Â­Â£Ã¥Å“Â¨Ã¤Â¸ÂºÃ¤Â»â‚¬Ã¢â‚¬â€¹Ã¢â‚¬â€¹Ã¤Â¹Ë†Ã¥â€šÂ¨Ã¨â€œâ€žÃ£â‚¬ÂÃ¦â€¹â€¦Ã¥Â¿Æ’Ã¤Â»â‚¬Ã¤Â¹Ë†Ã¯Â¼Å’Ã¤Â»Â¥Ã¥ÂÅ Ã¥â€“Å“Ã¦Â¬Â¢Ã¦â‚¬Å½Ã¦Â Â·Ã¨Â§ÂÃ©ÂÂ¢Ã£â‚¬â€šÃ¦Â²Â¡Ã¦Å“â€°Ã©â€â„¢Ã¨Â¯Â¯Ã§Â­â€Ã¦Â¡Ë†Ã£â‚¬â€š",
    howStep2Title: "2. Ã¨Â®Â¤Ã¨Â¯â€  3 Ã¤Â½ÂÃ¥Å’Â¹Ã©â€¦ÂÃ©Â¡Â¾Ã©â€”Â®", howStep2Body: "Ã¦Å¸Â¥Ã§Å“â€¹Ã§Â¬Â¦Ã¥ÂË†Ã¦â€šÂ¨Ã§â€ºÂ®Ã¦Â â€¡Ã£â‚¬ÂÃ¨Â¯Â­Ã¨Â¨â‚¬Ã¥â€™Å’Ã¦â€”Â¶Ã©â€”Â´Ã¥Â®â€°Ã¦Å½â€™Ã§Å¡â€žÃ¤Â¸â€°Ã¤Â½ÂÃ©Â¡Â¾Ã©â€”Â®Ã¯Â¼Å’Ã¥Â¹Â¶Ã¤Âºâ€ Ã¨Â§Â£Ã¦Â¯ÂÃ¤Â½ÂÃ©Â¡Â¾Ã©â€”Â®Ã©â‚¬â€šÃ¥ÂË†Ã¦â€šÂ¨Ã§Å¡â€žÃ§Â®â‚¬Ã¥Ââ€¢Ã¥Å½Å¸Ã¥â€ºÂ Ã£â‚¬â€šÃ¦â€šÂ¨Ã¥ÂÂ¯Ã¤Â»Â¥Ã¥Å“Â¨ FINRA BrokerCheck Ã¤Â¸Å Ã¦Â Â¸Ã¥Â®Å¾Ã¤Â»â€“Ã¤Â»Â¬Ã£â‚¬â€š",
    howStep3Title: "3. Ã¥ÂÅ¡Ã¥Â¥Â½Ã¤Â¼Å¡Ã©ÂÂ¢Ã¥â€¡â€ Ã¥Â¤â€¡", howStep3Body: "Ã©Â¢â€žÃ§ÂºÂ¦Ã¦â€”Â¶Ã©â€”Â´Ã¥Â¹Â¶Ã¨Å½Â·Ã¥Â¾â€”Ã¤Â¸ÂªÃ¤ÂºÂºÃ¥â€¡â€ Ã¥Â¤â€¡Ã¦Â¸â€¦Ã¥Ââ€¢Ã¯Â¼Å¡Ã§Â®â‚¬Ã¥Ââ€¢Ã¨Â§Â£Ã©â€¡Å Ã§Å¡â€žÃ¥â€¦Â³Ã©â€Â®Ã¦Å“Â¯Ã¨Â¯Â­Ã£â‚¬ÂÃ¥ÂÂ¯Ã¤Â»Â¥Ã¦ÂÂÃ¥â€¡ÂºÃ§Å¡â€žÃ©â€”Â®Ã©Â¢ËœÃ¤Â»Â¥Ã¥ÂÅ Ã©Å“â‚¬Ã¨Â¦ÂÃ¦ÂÂºÃ¥Â¸Â¦Ã§Å¡â€žÃ¦ÂÂÃ¦â€“â„¢Ã£â‚¬â€šÃ¦â€šÂ¨Ã§Å¡â€žÃ©Â¡Â¾Ã©â€”Â®Ã¤Â¹Å¸Ã¤Â¼Å¡Ã¦â€Â¶Ã¥Ë†Â°Ã¤Â¸â‚¬Ã¤Â»Â½Ã§â€ºÂ®Ã¦Â â€¡Ã¦â€˜ËœÃ¨Â¦ÂÃ£â‚¬â€š",
    howFootnote: "Ã¥â€¦ÂÃ¨Â´Â¹Ã¤Â½Â¿Ã§â€Â¨Ã£â‚¬â€šÃ¦Ë†â€˜Ã¤Â»Â¬Ã¥Â¸Â®Ã¥Å Â©Ã¦â€šÂ¨Ã¥ÂÅ¡Ã¥Â¥Â½Ã¥â€¡â€ Ã¥Â¤â€¡Ã¯Â¼Å’Ã¨â‚¬Å’Ã¤Â¸ÂÃ¦ËœÂ¯Ã¦â€ºÂ¿Ã¦â€šÂ¨Ã¦Å â€¢Ã¨Âµâ€žÃ¯Â¼Å¡Ã¦â€šÂ¨Ã§Å¡â€žÃ©Â¡Â¾Ã©â€”Â®Ã¤Â¼Å¡Ã¦ÂÂÃ¤Â¾â€ºÃ¥Â»ÂºÃ¨Â®Â®Ã£â‚¬â€š",
  },
};
Object.assign(T.en, {
  noMatches: "No advisors fit every preference yet. Try broadening your language, location, or meeting choices.",
  restartHint: "Start a new conversation to continue.",
  retryHint: "Your last reply was not saved. Please try again.",
  tryLater: "Please try again in a moment.",
  compareTo: "Select at least two advisors to compare.",
});
Object.assign(T.es, {
  noMatches: "AÃƒÂºn no hay asesores que coincidan con todas sus preferencias. Pruebe ampliar el idioma, la ubicaciÃƒÂ³n o el tipo de reuniÃƒÂ³n.",
  restartHint: "Inicie una nueva conversaciÃƒÂ³n para continuar.",
  retryHint: "Su ÃƒÂºltima respuesta no se guardÃƒÂ³. IntÃƒÂ©ntelo de nuevo.",
  tryLater: "IntÃƒÂ©ntelo de nuevo en un momento.",
  compareTo: "Seleccione al menos dos asesores para comparar.",
});
const SPEECH_LOCALES = { en: "en-US", es: "es-US", zh: "zh-CN" };
const state = { lang: "en", autoread: false, sessionId: null, sessionVersion: 0, collectedPreferences: null, glossaryTerms: [], busy: false, dictation: null, messages: 0, localIntake: createLocalIntake(), matches: [], matchIndex: 0, selected: new Set() };
const t = (k) => (T[state.lang] ?? T.en)[k] ?? T.en[k];

const GLOSSARY = {
  fiduciary: {
    en: ["fiduciary", "Someone required to put your interests first when providing advice. Ask which services that duty covers."],
    es: ["fiduciario", "Alguien que debe anteponer sus intereses al brindarle asesoramiento. Pregunte quÃƒÂ© servicios cubre ese deber."],
    zh: ["Ã¥Ââ€”Ã¦â€°ËœÃ¤ÂºÂº", "Ã¦ÂÂÃ¤Â¾â€ºÃ¥Â»ÂºÃ¨Â®Â®Ã¦â€”Â¶Ã¥Â¿â€¦Ã©Â¡Â»Ã¤Â¼ËœÃ¥â€¦Ë†Ã¨â‚¬Æ’Ã¨â„¢â€˜Ã¦â€šÂ¨Ã¥Ë†Â©Ã§â€ºÅ Ã§Å¡â€žÃ¤ÂºÂºÃ£â‚¬â€šÃ¨Â¯Â·Ã¨Â¯Â¢Ã©â€”Â®Ã¨Â¿â„¢Ã©Â¡Â¹Ã¨Â´Â£Ã¤Â»Â»Ã¦Â¶ÂµÃ§â€ºâ€“Ã¥â€œÂªÃ¤Âºâ€ºÃ¦Å“ÂÃ¥Å Â¡Ã£â‚¬â€š"],
  },
  "fee-only": {
    en: ["fee-only", "An advisor paid only by client fees. Ask for all costs in writing."],
    es: ["solo honorarios", "Un asesor al que solo le pagan sus clientes. Pida todos los costos por escrito."],
    zh: ["Ã¤Â»â€¦Ã¦â€Â¶Ã¥Ââ€“Ã¨Â´Â¹Ã§â€Â¨", "Ã¥ÂÂªÃ©â‚¬Å¡Ã¨Â¿â€¡Ã¥Â®Â¢Ã¦Ë†Â·Ã¨Â´Â¹Ã§â€Â¨Ã¨Å½Â·Ã¥Â¾â€”Ã¦Å Â¥Ã©â€¦Â¬Ã§Å¡â€žÃ©Â¡Â¾Ã©â€”Â®Ã£â‚¬â€šÃ¨Â¯Â·Ã¤Â¹Â¦Ã©ÂÂ¢Ã¨Â¯Â¢Ã©â€”Â®Ã¦â€°â‚¬Ã¦Å“â€°Ã¨Â´Â¹Ã§â€Â¨Ã£â‚¬â€š"],
  },
  "fee-based": {
    en: ["fee-based", "An advisor who may receive client fees and commissions. Ask for all costs in writing."],
    es: ["honorarios y comisiones", "Un asesor que puede recibir honorarios y comisiones. Pida todos los costos por escrito."],
    zh: ["Ã¨Â´Â¹Ã§â€Â¨Ã¥Å Â Ã¤Â½Â£Ã©â€¡â€˜", "Ã¥ÂÂ¯Ã¨Æ’Â½Ã¦â€Â¶Ã¥Ââ€“Ã¥Â®Â¢Ã¦Ë†Â·Ã¨Â´Â¹Ã§â€Â¨Ã¥â€™Å’Ã¤Â½Â£Ã©â€¡â€˜Ã§Å¡â€žÃ©Â¡Â¾Ã©â€”Â®Ã£â‚¬â€šÃ¨Â¯Â·Ã¤Â¹Â¦Ã©ÂÂ¢Ã¨Â¯Â¢Ã©â€”Â®Ã¦â€°â‚¬Ã¦Å“â€°Ã¨Â´Â¹Ã§â€Â¨Ã£â‚¬â€š"],
  },
};

function glossaryEntry(termId, term) {
  const key = String(termId || term || "").replace(/^TERM#/, "").toLowerCase();
  const serverTerm = state.glossaryTerms.find((item) => String(item.termId || "").replace(/^TERM#/, "").toLowerCase() === key);
  if (serverTerm) return { serverTerm };
  return GLOSSARY[key] || GLOSSARY[key.replaceAll("_", "-")] || null;
}

async function startSession() {
  if (!CFG.apiUrl) return null;
  const stored = sessionStorage.getItem("advisor.sessionId");
  if (stored) {
    state.sessionId = stored;
    state.sessionVersion = Number(sessionStorage.getItem("advisor.sessionVersion") || 0);
    try {
      const cached = JSON.parse(sessionStorage.getItem("advisor.glossaryTerms") || "null");
      if (cached && cached.language === state.lang) state.glossaryTerms = cached.terms || [];
    } catch (_) {}
    return stored;
  }
  const session = await post("/session", { preferredLanguage: SPEECH_LOCALES[state.lang] || "en-US" });
  if (!session.sessionId) throw new Error("The service did not return a session ID.");
  state.sessionId = session.sessionId;
  state.sessionVersion = Number.isInteger(session.version) ? session.version : 0;
  state.glossaryTerms = session.glossaryTerms || [];
  sessionStorage.setItem("advisor.sessionId", state.sessionId);
  sessionStorage.setItem("advisor.sessionVersion", String(state.sessionVersion));
  sessionStorage.setItem("advisor.glossaryTerms", JSON.stringify({ language: state.lang, terms: state.glossaryTerms }));
  return state.sessionId;
}

function markGlossary(text, tags = []) {
  const entries = [];
  let marked = text;
  const valid = tags.filter((tag) => Number.isInteger(tag.start) && Number.isInteger(tag.end) && tag.start >= 0 && tag.end > tag.start && tag.end <= text.length && glossaryEntry(tag.termId, tag.term));
  valid.sort((a, b) => b.start - a.start || b.end - a.end);
  let nextStart = text.length + 1;
  for (const tag of valid) {
    if (tag.end > nextStart) continue;
    const entry = glossaryEntry(tag.termId, tag.term);
    const index = entries.push({ term: text.slice(tag.start, tag.end), entry }) - 1;
    marked = `${marked.slice(0, tag.start)}\uE000${index}\uE001${marked.slice(tag.end)}`;
    nextStart = tag.start;
  }
  return { text: marked, entries };
}

let nextTooltipId = 0;
function tooltipMarkup(text, entries) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, rawIndex) => {
    const index = Number(rawIndex);
    const item = entries[index];
    if (!item) return "";
    const [label, definition] = item.entry.serverTerm
      ? [item.entry.serverTerm.displayTerm || item.term, item.entry.serverTerm.definition || ""]
      : (item.entry[state.lang] || item.entry.en);
    const id = `glossary-tip-${++nextTooltipId}`;
    return `<span class="glossary-anchor"><button class="glossary-trigger" type="button" aria-describedby="${id}" aria-expanded="false">${esc(item.term)}</button><span class="glossary-tip" id="${id}" role="tooltip" hidden><strong>${esc(label)}</strong><br>${esc(definition)}</span></span>`;
  });
}

function applyI18n() {
  document.documentElement.lang = SPEECH_LOCALES[state.lang] || "en-US";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#mic").setAttribute("aria-label", state.dictation ? t("micStop") : t("micStart"));
  updateMatchWindow();
}

// ---------- tiny safe markdown ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(text) {
  const lines = esc(text).split(/\n/);
  let html = "", list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1<em>$2</em>");
  for (const raw of lines) {
    const line = raw.trim();
    const ul = line.match(/^[-*Ã¢â‚¬Â¢]\s+(.*)/), ol = line.match(/^\d+[.)]\s+(.*)/);
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
const plain = (s) => s.replace(/\*\*|__|#+\s|[*_`]/g, "").replace(/^\s*[-Ã¢â‚¬Â¢]\s+/gm, "");

// ---------- DOM helpers ----------
const $ = (s) => document.querySelector(s);
const chat = () => $("#chat");
function addMsg(role, text, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}${opts.cls ? " " + opts.cls : ""}`;
  const body = document.createElement("div");
  body.className = "msg-body";
  if (role === "bot" && !opts.cls) {
    const tagged = markGlossary(text, opts.glossaryTags);
    body.innerHTML = tooltipMarkup(md(tagged.text), tagged.entries);
  } else body.innerHTML = `<p>${esc(text)}</p>`;
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
    const icon = document.createElement("i"); icon.dataset.lucide = "audio-lines"; b.append(icon, document.createTextNode(" " + t("readAloud")));
    b.setAttribute("aria-label", t("readAloud"));
    b.onclick = () => speak(text);
    body.appendChild(b);
  }
  body.querySelectorAll(".glossary-anchor").forEach((anchor) => {
    const button = anchor.querySelector(".glossary-trigger");
    const tooltip = anchor.querySelector(".glossary-tip");
    const close = () => { tooltip.hidden = true; button.setAttribute("aria-expanded", "false"); };
    const open = () => { tooltip.hidden = false; button.setAttribute("aria-expanded", "true"); };
    button.onclick = () => tooltip.hidden ? open() : close();
    anchor.onmouseenter = open;
    anchor.onmouseleave = () => { if (!anchor.contains(document.activeElement)) close(); };
    button.onfocus = open;
    button.onblur = () => { if (!anchor.matches(":hover")) close(); };
    button.onkeydown = (event) => {
      if (event.key === "Escape") { close(); button.focus(); event.stopPropagation(); }
    };
  });
  chat().appendChild(div);
  drawIcons();
  chat().scrollTop = chat().scrollHeight;
  return div;
}

async function speak(text) {
  try {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plain(text));
    utterance.lang = SPEECH_LOCALES[state.lang] || SPEECH_LOCALES.en;
    window.speechSynthesis.speak(utterance);
  } catch (e) { console.warn("[speak]", e); }
}

// ---------- chat ----------
async function send(text) {
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
    let res;
    if (CFG.apiUrl) {
      const sessionId = await startSession();
      res = await post(`/session/${encodeURIComponent(sessionId)}/message`, {
        message: text,
        preferredLanguage: SPEECH_LOCALES[state.lang] || "en-US",
        version: state.sessionVersion,
      });
      if (Number.isInteger(res.version)) {
        state.sessionVersion = res.version;
        sessionStorage.setItem("advisor.sessionVersion", String(state.sessionVersion));
      }
      if (res.collectedPreferences) state.collectedPreferences = res.collectedPreferences;
      if (Array.isArray(res.glossaryTerms)) {
        state.glossaryTerms = res.glossaryTerms;
        sessionStorage.setItem("advisor.glossaryTerms", JSON.stringify({ language: state.lang, terms: state.glossaryTerms }));
      }
    } else res = localReply(text);
    typing.remove();
    const responseText = res.text || res.reply || "Ã¢â‚¬Â¦";
    addMsg("bot", responseText, { glossaryTags: res.glossaryTags || [] });
    if (res.matches) {
      state.matches = res.matches;
      renderMatches(res.matches);
      $("#step-matches").classList.add("active");
      $("#match-count").textContent = t("advisorCount")(res.matches.length);
    }
    if (res.booking) renderBooking(res.booking, res.briefing);
    if (state.autoread) speak(responseText);
  } catch (e) {
    typing.remove();
    const suffix = e.code === "SESSION_EXPIRED" || e.code === "SESSION_UNAUTHORIZED" ? t("restartHint") : e.code === "SESSION_BUSY" || e.code === "VERSION_CONFLICT" ? t("retryHint") : t("tryLater");
    addMsg("bot", `${t("error")} ${suffix}`, { cls: "error" });
  } finally {
    state.busy = false;
    $("#send").disabled = false;
    $("#msg").focus();
  }
}

function localReply(text) {
  const result = replyToLocalTurn(text, state.lang, state.localIntake);
  return {
    reply: !result.ready ? result.followup : result.matches.length ? t("chatShowMatches") : t("noMatches"),
    ...(result.ready ? { matches: result.matches } : {}),
    demo: true,
  };
}

function renderMatches(list) {
  const box = $("#matches");
  box.innerHTML = "";
  box.scrollLeft = 0;
  state.matchIndex = 0;
  if (!list.length) { box.innerHTML = `<p class="muted" role="status">${t("noMatches")}</p>`; $("#match-count").textContent = t("advisorCount")(0); $("#compare-open").hidden = true; updateMatchWindow(); return; }
  const profiles = list.map((item) => ({
    ...item,
    advisor_id: item.advisor_id || item.advisorId || item.id,
    name: item.name || item.displayName || "Advisor",
    city: item.city || [item.geography?.city, item.geography?.state].filter(Boolean).join(", ") || "Location not provided",
    languages: item.languages || [],
    focus: item.focus || item.specialties || [],
    bio: item.bio || item.description || "",
    score: item.score ?? item.fitScore,
    fit: item.fit || (Number.isFinite(item.fitScore) ? `${item.fitScore}%` : undefined),
  }));
  state.matches = profiles;
  profiles.forEach((a) => {
    const card = document.createElement("article");
    card.className = "match";
    card.setAttribute("role", "group");
    card.setAttribute("aria-roledescription", "slide");
    const reasons = Array.isArray(a.reasons) ? a.reasons.slice(0, 3) : [t("fitPrimary"), t("fitLanguage"), t("fitMeeting")];
    card.innerHTML = `<div class="profile-row"><div class="profile-mark" aria-hidden="true">${esc(a.name.split(" ").map((s) => s[0]).slice(0, 2).join(""))}</div><div><h3>${esc(a.name)}</h3><div class="meta">${esc(a.city)} Ã‚Â· ${(a.languages || []).map(esc).join(" / ")}</div></div><label class="compare-select"><input type="checkbox" aria-label="Compare ${esc(a.name)}"/><span></span></label></div><p>${esc(a.bio || (a.focus || []).join(", "))}</p><div class="match-score"><span>${t("scoreLabel")}</span><strong>${esc(a.fit || `${a.score || 0}%`)}</strong></div><ul class="reason-list">${reasons.map((reason) => `<li><i data-lucide="check"></i>${esc(reason)}</li>`).join("")}</ul><details><summary>${t("details")}</summary><div class="tags">${(a.languages || []).map((l) => `<span class="tag">${esc(l)}</span>`).join("")}${(a.focus || []).slice(0, 2).map((f) => `<span class="tag">${esc(f)}</span>`).join("")}</div><p>${esc(a.fee_disclosure || t("feeDisclosure"))}</p></details><p class="demo-note">${t("brokerCheckDemo")}</p><button class="secondary choose" type="button">${t("choose")}</button>`;
    card.querySelector(".compare-select input").onchange = (e) => e.target.checked ? state.selected.add(a.advisor_id) : state.selected.delete(a.advisor_id);
    card.querySelector(".choose").onclick = () => { $("#step-meeting").classList.add("active"); send(`${t("meetingQuestion")} ${a.name}`); };
    box.appendChild(card);
  });
  box.querySelectorAll(".match").forEach((card, index) => { card.setAttribute("aria-label", `${index + 1} of ${profiles.length}`); });
  $("#compare-open").hidden = false;
  updateMatchWindow();
  drawIcons();
}

function matchCards() { return [...$("#matches").querySelectorAll(".match")]; }

function updateMatchWindow() {
  const cards = matchCards();
  const controls = $("#match-window-controls");
  const labels = state.lang === "es"
    ? ["Asesor anterior", "Siguiente asesor", "Coincidencias de asesores"]
    : state.lang === "zh"
      ? ["上一位顾问", "下一位顾问", "顾问匹配"]
      : ["Previous advisor", "Next advisor", "Advisor matches"];
  $("#match-previous").setAttribute("aria-label", labels[0]);
  $("#match-previous").title = labels[0];
  $("#match-next").setAttribute("aria-label", labels[1]);
  $("#match-next").title = labels[1];
  controls.setAttribute("aria-label", labels[2]);
  controls.hidden = cards.length < 2;
  $("#match-position").textContent = cards.length ? `${state.matchIndex + 1} / ${cards.length}` : "0 / 0";
  $("#match-previous").disabled = state.matchIndex <= 0;
  $("#match-next").disabled = state.matchIndex >= cards.length - 1;
}

function goToMatch(index) {
  const cards = matchCards();
  if (!cards.length) return;
  state.matchIndex = Math.max(0, Math.min(index, cards.length - 1));
  cards[state.matchIndex].scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "start" });
  updateMatchWindow();
}

function syncMatchWindow() {
  const cards = matchCards();
  if (!cards.length) return updateMatchWindow();
  const trackLeft = $("#matches").getBoundingClientRect().left;
  state.matchIndex = cards.reduce((best, card, index) => Math.abs(card.getBoundingClientRect().left - trackLeft) < Math.abs(cards[best].getBoundingClientRect().left - trackLeft) ? index : best, 0);
  updateMatchWindow();
}

function renderBooking(b, briefing) {
  $("#booking").innerHTML = `<div class="booking-card" role="status"><h3>${t("demoRequested")}</h3><div>${esc(b.advisor_name || "")}</div><p>${esc(b.notice || t("bookingNote"))}</p>${briefing ? `<p>${t("unavailable")}</p>` : ""}</div>`;
}

function showComparison() {
  const selected = state.matches.filter((a) => state.selected.has(a.advisor_id));
  if (selected.length < 2) { $("#compare-open").setAttribute("aria-label", t("compareTo")); return; }
  $("#comparison-content").innerHTML = `<div class="compare-grid">${selected.map((a) => `<section><h3>${esc(a.name)}</h3><p>${esc(a.city)}</p><strong>${esc(a.fit || `${a.score}%`)}</strong><p>${esc(a.bio || "")}</p><ul>${(a.reasons || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>${esc(a.fee_disclosure || t("feeDisclosure"))}</p></section>`).join("")}</div>`;
  $("#comparison").showModal();
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
    const base = $("#msg").value.trim();
    state.dictation = await startDictation(CFG, state.lang, (text) => {
      $("#msg").value = (base ? base + " " : "") + text;
    });
    $("#mic").setAttribute("aria-pressed", "true");
    $("#mic").setAttribute("aria-label", t("micStop"));
    $("#live-hint").textContent = `${t("listening")} (${state.dictation.engine})`;
  } catch (e) {
    $("#live-hint").textContent = e.message;
  }
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
        <h3>${esc(b.prospect_name || "New prospect")} Ã¢â€ â€™ ${esc(b.advisor_name || b.advisor_id)}</h3>
        <div class="meta">First meeting: ${esc(b.time_slot || "")}</div>
        <dl>
          <dt>Goals</dt><dd>${esc(br.goals || "Ã¢â‚¬â€")}</dd>
          <dt>Worries</dt><dd>${esc(br.worries || "Ã¢â‚¬â€")}</dd>
          <dt>Explain simply</dt><dd>${esc(br.topics_to_explain || "Ã¢â‚¬â€")}</dd>
          <dt>How they prefer to communicate</dt><dd>${esc(br.communication_preferences || "Ã¢â‚¬â€")}</dd>
        </dl>`;
      box.appendChild(el);
    });
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
}

// ---------- dashboard ----------
const STAGES = [["intake_started", "Intake started"], ["matched", "Matched to advisors"], ["booked", "First meeting booked"], ["briefing_sent", "Advisor briefed"]];
async function loadMetrics() {
  const box = $("#funnel");
  box.innerHTML = `<p class="muted">${t("thinking")}</p>`;
  try {
    const { funnel, day } = await post("/metrics");
    const max = Math.max(1, ...STAGES.map(([k]) => funnel[k] || 0));
    box.innerHTML = `<div class="meta">Today (${esc(day)}, UTC)</div>`;
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
  } catch (e) { box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`; }
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
  if (name === "dashboard") loadMetrics();
}

// ---------- init ----------
async function init() {
  try { CFG = { ...CFG, ...(await (await fetch("/config.json", { cache: "no-store" })).json()) }; } catch (_) {}
  const tabs = [...document.querySelectorAll("[role=tab]")];
  tabs.forEach((b, i) => {
    b.onclick = () => showView(b.dataset.view);
    b.onkeydown = (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); showView(n.dataset.view);
    };
  });
  document.querySelectorAll(".language-option").forEach((button) => (button.onclick = () => {
    stopDictation();
    state.lang = button.dataset.lang;
    document.querySelectorAll(".language-option").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", active);
    });
    applyI18n();
  }));
  document.querySelectorAll(".size-option").forEach((button) => (button.onclick = () => {
    const size = Number(button.dataset.size);
    document.documentElement.style.setProperty("--base", `${size / 100 * 17}px`);
    document.querySelectorAll(".size-option").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", active);
    });
  }));
  $("#pref-contrast").onchange = (e) => document.documentElement.classList.toggle("contrast", e.target.checked);
  $("#pref-autoread").onchange = (e) => (state.autoread = e.target.checked);
  $("#settings-toggle").onclick = () => {
      const open = $("#settings-panel").classList.toggle("open");
      $("#settings-panel").hidden = !open;
      $("#settings-toggle").setAttribute("aria-expanded", open);
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#settings-panel").classList.remove("open");
      $("#settings-panel").hidden = true;
      $("#settings-toggle").setAttribute("aria-expanded", "false");
    }
  });
  $("#composer").onsubmit = (e) => { e.preventDefault(); send($("#msg").value); };
  $("#msg").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("#msg").value); } };
  $("#mic").onclick = toggleMic;
  document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => send(c.textContent)));
  $("#refresh-bookings").onclick = loadBookings;
  $("#refresh-metrics").onclick = loadMetrics;
  ["#r-adv", "#r-cli", "#r-aum", "#r-fee"].forEach((s) => ($(s).oninput = calcRoi));
  calcRoi();
  applyI18n();
  addMsg("bot", t("greeting"));
  $("#connection-status").textContent = CFG.apiUrl ? t("connectedStatus") : t("localStatus");
  $("#admin-form").onsubmit = async (e) => {
    e.preventDefault();
    adminToken = $("#admin-token").value.trim();
    if (!adminToken) { $("#admin-status").textContent = t("advisorAccess"); return; }
    await loadBookings();
    await loadMetrics();
    if ($("#admin-status").textContent !== t("advisorAccess")) $("#admin-status").textContent = t("adminReady");
  };
  $("#compare-open").onclick = showComparison;
  $("#match-previous").onclick = () => goToMatch(state.matchIndex - 1);
  $("#match-next").onclick = () => goToMatch(state.matchIndex + 1);
  $("#matches").addEventListener("scroll", syncMatchWindow, { passive: true });
  $("#matches").addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); goToMatch(state.matchIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); goToMatch(state.matchIndex + 1); }
  });
  $("#compare-close").onclick = () => $("#comparison").close();
  $("#reset-chat").onclick = () => {
    sessionStorage.removeItem("advisor.sessionId"); sessionStorage.removeItem("advisor.sessionVersion"); sessionStorage.removeItem("advisor.glossaryTerms");
    sessionStorage.removeItem("advisor.session"); sessionStorage.removeItem("advisor.token");
    state.sessionId = null; state.sessionVersion = 0; state.collectedPreferences = null; state.glossaryTerms = []; state.localIntake = createLocalIntake(); state.matches = []; state.matchIndex = 0; state.selected.clear(); state.messages = 0;
    chat().innerHTML = ""; $("#matches").innerHTML = `<div class="match-empty"><div class="empty-copy"><h3>${t("emptyTitle")}</h3><p>${t("matchesEmpty")}</p></div></div>`;
    $("#match-count").textContent = t("advisorCount")(0); $("#compare-open").hidden = true; $("#booking").innerHTML = ""; updateMatchWindow();
    $("#step-matches").classList.remove("active"); $("#step-meeting").classList.remove("active"); $("#starters").hidden = false; addMsg("bot", t("greeting"));
  };
  }
init();
