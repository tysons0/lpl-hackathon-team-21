// Translations for advisor data that comes from the backend in English (seed/seed.py): focus areas, fee
// models, platforms, fit labels and bios. Text with no translation here is shown unchanged.
// web/tests/translation.spec.js checks that every value seed.py can produce is covered.

// The English values seed.py uses (kept in sync by the translation tests).
export const SEED_TEXT = {
  focus: [
    "young professionals and first-time investors",
    "first-time home buyers",
    "student loan payoff and early retirement saving",
    "new parents and college savings",
    "small business owners",
    "pre-retirees and retirement income",
    "inheritance and estate transitions",
    "tech employees with equity compensation",
    "military families",
    "teachers and public-sector pensions",
  ],
  fees: ["Fee-based (annual % of assets)", "Fee-only (flat planning fee)", "Commission and fee (hybrid)"],
  platforms: ["Advisor-managed (SAM)", "Model portfolios (MWP)"],
};

export const DATA = {
  es: {
    "young professionals and first-time investors": "jóvenes profesionales e inversionistas principiantes",
    "first-time home buyers": "compradores de su primera vivienda",
    "student loan payoff and early retirement saving": "pago de préstamos estudiantiles y ahorro temprano para la jubilación",
    "new parents and college savings": "padres primerizos y ahorro para la universidad",
    "small business owners": "dueños de pequeñas empresas",
    "pre-retirees and retirement income": "personas próximas a jubilarse e ingresos para la jubilación",
    "inheritance and estate transitions": "herencias y planificación patrimonial",
    "tech employees with equity compensation": "empleados de tecnología con compensación en acciones",
    "military families": "familias militares",
    "teachers and public-sector pensions": "maestros y pensiones del sector público",
    "Fee-based (annual % of assets)": "Por honorarios (% anual de los activos)",
    "Fee-only (flat planning fee)": "Solo honorarios (tarifa fija de planificación)",
    "Commission and fee (hybrid)": "Comisión y honorarios (híbrido)",
    "Advisor-managed (SAM)": "Gestionado por el asesor (SAM)",
    "Model portfolios (MWP)": "Carteras modelo (MWP)",
    "Ask your advisor": "Pregunte a su asesor",
    "Strong fit": "Muy compatible",
    "Good fit": "Compatible",
    "Bilingual (English/Spanish). Specializes in first-time investors and saving for a first home. Patient, jargon-free, offers evening virtual meetings.":
      "Bilingüe (inglés/español). Se especializa en inversionistas principiantes y en ahorrar para la primera vivienda. Paciente, sin tecnicismos, ofrece reuniones virtuales por la noche.",
    "Works with recent grads balancing student loans, a first 401(k) and building savings. Education-first and plain-language.":
      "Trabaja con recién graduados que equilibran préstamos estudiantiles, su primer 401(k) y la creación de ahorros. Pone la educación primero y habla con palabras sencillas.",
    "Bilingual (English/Mandarin). Helps first-time investors and families new to the US financial system. Patient and jargon-free.":
      "Bilingüe (inglés/mandarín). Ayuda a inversionistas principiantes y a familias nuevas en el sistema financiero de EE. UU. Paciente y sin tecnicismos.",
  },
  zh: {
    "young professionals and first-time investors": "年轻专业人士和首次投资者",
    "first-time home buyers": "首次购房者",
    "student loan payoff and early retirement saving": "偿还学生贷款和尽早为退休储蓄",
    "new parents and college savings": "新手父母和大学教育储蓄",
    "small business owners": "小企业主",
    "pre-retirees and retirement income": "即将退休人士和退休收入",
    "inheritance and estate transitions": "遗产继承和财产传承",
    "tech employees with equity compensation": "拥有股权激励的科技员工",
    "military families": "军人家庭",
    "teachers and public-sector pensions": "教师和公共部门养老金",
    "Fee-based (annual % of assets)": "按资产收费（每年资产的百分比）",
    "Fee-only (flat planning fee)": "仅收顾问费（固定规划费）",
    "Commission and fee (hybrid)": "佣金加顾问费（混合）",
    "Advisor-managed (SAM)": "顾问管理（SAM）",
    "Model portfolios (MWP)": "模型投资组合（MWP）",
    "Ask your advisor": "请咨询您的顾问",
    "Strong fit": "非常匹配",
    "Good fit": "匹配",
    "Bilingual (English/Spanish). Specializes in first-time investors and saving for a first home. Patient, jargon-free, offers evening virtual meetings.":
      "双语（英语/西班牙语）。专门帮助首次投资者和为首套住房储蓄的人。耐心、不讲行话，提供晚间线上会面。",
    "Works with recent grads balancing student loans, a first 401(k) and building savings. Education-first and plain-language.":
      "帮助刚毕业的人兼顾学生贷款、第一个 401(k) 账户和储蓄。注重讲解，用浅显的语言沟通。",
    "Bilingual (English/Mandarin). Helps first-time investors and families new to the US financial system. Patient and jargon-free.":
      "双语（英语/普通话）。帮助首次投资者和刚接触美国金融体系的家庭。耐心、不讲行话。",
  },
};

// Generated bios in seed.py all follow this pattern.
const GENERATED_BIO = /^Works mostly with (.+) and (.+)\. Plain-language, patient, education-first\.$/;
const BIO_TEMPLATE = {
  es: (a, b) => `Trabaja sobre todo con ${a} y con ${b}. Habla con palabras sencillas, es paciente y pone la educación primero.`,
  zh: (a, b) => `主要服务于${a}以及${b}。用浅显的语言沟通，耐心，注重讲解。`,
};

export function trData(text, lang) {
  if (!text || lang === "en") return text;
  return DATA[lang]?.[text] ?? text;
}

export function trBio(bio, lang) {
  if (!bio || lang === "en") return bio;
  if (DATA[lang]?.[bio]) return DATA[lang][bio];
  const m = bio.match(GENERATED_BIO);
  if (m && BIO_TEMPLATE[lang]) {
    // The two focus areas are separated by " and ", but focus areas can contain " and " themselves.
    const parts = `${m[1]} and ${m[2]}`;
    const first = SEED_TEXT.focus.find((f) => parts.startsWith(`${f} and `) && SEED_TEXT.focus.includes(parts.slice(f.length + 5)));
    if (first) return BIO_TEMPLATE[lang](trData(first, lang), trData(parts.slice(first.length + 5), lang));
  }
  return bio;
}
