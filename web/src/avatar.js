// Advisor pictures. Demo advisors are fictional, so each one gets an illustrated portrait drawn
// here as SVG (no photos of real people, nothing downloaded). Its look is picked from the
// advisor_id, never from the name. If an advisor record has a photo_url (e.g. a licensed headshot
// in web/public/advisors/), that photo is shown and the portrait is the fallback.

const BACKGROUNDS = ["#dbe7f5", "#dcefe6", "#f3e3ec", "#f6e6d8", "#e3e6f6", "#efe9d6", "#d9edf2", "#f1dfdf"];
const SKIN = ["#f6d7c3", "#eac0a2", "#d9a37e", "#b97a57", "#8d5a3b", "#5f3b26"];
const HAIR = ["#1f1a17", "#4a2f1f", "#7a4b2a", "#b8864b", "#d9c2a0", "#8a8a8a"];
const SHIRT = ["#1d4e89", "#2a7f62", "#8a3b70", "#b5522b", "#4b5aa6", "#33475b", "#1f6f8b", "#7a3e3e"];
const HAIR_STYLES = ["short", "long", "bun", "curly", "sidepart", "buzz"];

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}
const pick = (list, h, salt) => list[(h >>> salt) % list.length];

export function initials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function hairBack(style, color) {
  if (style === "long") return `<path d="M17 30c0-12 6-19 15-19s15 7 15 19v14H17z" fill="${color}"/>`;
  if (style === "bun") return `<circle cx="32" cy="9" r="6" fill="${color}"/>`;
  return "";
}

function hairFront(style, color) {
  switch (style) {
    case "short": return `<path d="M19.5 25c0-8 5.5-12.5 12.5-12.5S44.5 17 44.5 25c-2-4-6-6-12.5-6s-10.5 2-12.5 6z" fill="${color}"/>`;
    case "long": return `<path d="M19.5 26c0-8.5 5.5-13.5 12.5-13.5S44.5 17.5 44.5 26c-3-5-7-7.5-12.5-7.5S22.5 21 19.5 26z" fill="${color}"/>`;
    case "bun": return `<path d="M20 25c0-8 5-12.5 12-12.5S44 17 44 25c-2.5-4.5-6.5-6.5-12-6.5S22.5 20.5 20 25z" fill="${color}"/>`;
    case "curly": return [[22, 19], [27, 15], [33, 14], [39, 16], [43, 21], [20, 24], [44, 25]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="${color}"/>`).join("");
    case "sidepart": return `<path d="M19.5 25.5C19.5 17 25 12.5 32 12.5S44.5 17 44.5 25.5C40 19 33 17 26 19.5c-3 1-5 3-6.5 6z" fill="${color}"/>`;
    default: return `<path d="M20.5 23c1-6.5 5.5-10 11.5-10s10.5 3.5 11.5 10c-3-2.5-7-3.5-11.5-3.5S23.5 20.5 20.5 23z" fill="${color}" opacity=".85"/>`;
  }
}

function portraitSvg(name, id, label) {
  const h = hash(id || name || "advisor");
  const bg = pick(BACKGROUNDS, h, 0), skin = pick(SKIN, h, 3), hair = pick(HAIR, h, 7);
  const shirt = pick(SHIRT, h, 11), style = pick(HAIR_STYLES, h, 15), glasses = (h >>> 19) % 4 === 0;
  const clip = `av-${String(id || name).replace(/[^A-Za-z0-9_-]/g, "")}`;
  return `<svg class="avatar" viewBox="0 0 64 64" role="img" aria-label="${label || `Illustrated portrait of ${name}`}">
    <defs><clipPath id="${clip}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
    <g clip-path="url(#${clip})">
      <rect width="64" height="64" fill="${bg}"/>
      ${hairBack(style, hair)}
      <path d="M8 66c1-13 11-20 24-20s23 7 24 20z" fill="${shirt}"/>
      <path d="M26 46l6 7 6-7z" fill="#fff" opacity=".9"/>
      <rect x="27.5" y="36" width="9" height="11" rx="4" fill="${skin}"/>
      <ellipse cx="32" cy="27" rx="12" ry="13.5" fill="${skin}"/>
      ${hairFront(style, hair)}
      <circle cx="27.5" cy="28" r="1.4" fill="#2b2b2b"/><circle cx="36.5" cy="28" r="1.4" fill="#2b2b2b"/>
      <path d="M28 33.5c2.3 2 5.7 2 8 0" stroke="#7a3b2e" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${glasses ? `<g fill="none" stroke="#2b2b2b" stroke-width="1.1"><circle cx="27.5" cy="28" r="3.6"/><circle cx="36.5" cy="28" r="3.6"/><path d="M31.1 28h1.8"/></g>` : ""}
    </g>
  </svg>`;
}

// Returns HTML. `esc` is the caller's HTML-escaping function. `labels` holds translated
// { portrait, photo } alt text (English is used when missing). Call wirePhotoFallbacks(root) after inserting it.
export function advisorPicture(a, esc, labels = {}) {
  const fallback = portraitSvg(esc(a.name || ""), a.advisor_id, labels.portrait && esc(labels.portrait));
  if (!a.photo_url) return `<span class="avatar-wrap">${fallback}</span>`;
  return `<span class="avatar-wrap"><img class="avatar" src="${esc(a.photo_url)}" alt="${esc(labels.photo || `Photo of ${a.name}`)}" loading="lazy" data-fallback="${esc(fallback)}"></span>`;
}

// If a photo fails to load, swap in the illustrated portrait.
export function wirePhotoFallbacks(root) {
  root.querySelectorAll("img.avatar[data-fallback]").forEach((img) => {
    const swap = () => { img.outerHTML = img.dataset.fallback; };
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener("error", swap, { once: true });
  });
}
