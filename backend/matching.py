"""Deterministic matching core used by the agent tools. Pure Python, no AWS calls, so it is unit-testable.

Skills applied (see docs/skills-applied.md):
  SKILL-01 behavioral_intake_crs        - intake slots, progress, zero-upfront-PII screen
  SKILL-02 agentic_rag_kg_retrieval     - only advisor IDs returned by retrieval can be booked
  SKILL-03 mcdm_ahp_scoring_engine      - AHP criteria weights with a consistency-ratio check
  SKILL-04 explainable_match_generator  - plain-language match reasons + fee disclosure
"""
import random
import re

# ---------- SKILL-01: intake slots ----------
INTAKE_SLOTS = (
    "goal",                   # main money goal, e.g. buy a home
    "life_stage",             # situation in a sentence
    "worries",                # what makes them nervous
    "language",               # preferred language
    "meeting_type",           # virtual / in-person
    "decision_style",         # e.g. wants guidance vs. wants to decide themselves
    "communication_cadence",  # e.g. monthly check-ins, only when needed
)
REQUIRED_FOR_MATCH = ("goal", "language", "meeting_type")


def merge_slots(current, updates):
    """Merge non-empty slot values into the session state. Unknown keys are ignored."""
    merged = dict(current or {})
    for k, v in (updates or {}).items():
        if k in INTAKE_SLOTS and isinstance(v, str) and v.strip():
            merged[k] = v.strip()[:300]
    return merged


def intake_progress(slots):
    filled = sum(1 for k in INTAKE_SLOTS if (slots or {}).get(k))
    return {
        "percent": round(100 * filled / len(INTAKE_SLOTS)),
        "ready_to_match": all((slots or {}).get(k) for k in REQUIRED_FOR_MATCH),
        "missing": [k for k in INTAKE_SLOTS if not (slots or {}).get(k)],
    }


# ---------- SKILL-01: zero upfront PII ----------
# Only a first name is needed (at booking). Anything below is rejected before it reaches the model or storage.
_PII = [
    ("card_number", re.compile(r"\b(?:\d[ -]?){13,16}\b")),
    ("ssn", re.compile(r"\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(?:ssn|social security)\D{0,12}\d{9}\b", re.I)),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("phone", re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)")),
    ("street_address", re.compile(
        r"\b\d{1,6}\s+(?:[A-Za-z0-9.]+\s){1,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way)\b\.?",
        re.I)),
]


def screen_pii(text):
    """Return the kinds of sensitive identifiers found in text (empty list if none)."""
    return [kind for kind, rx in _PII if rx.search(text or "")]


PII_REPLY = {
    "English": "For your privacy, please don't share phone numbers, emails, addresses, account or Social Security "
               "numbers here. I only need your first name when you book. What would you like to tell me instead?",
    "Spanish": "Por su privacidad, no comparta números de teléfono, correos, direcciones, números de cuenta o de "
               "Seguro Social aquí. Solo necesito su nombre cuando reserve. ¿Qué más me quiere contar?",
    "Mandarin": "为了保护您的隐私，请不要在这里分享电话号码、电子邮件、地址、账户或社会安全号码。预约时我只需要您的名字。您还想告诉我什么？",
}


# ---------- SKILL-03: AHP criteria weights ----------
CRITERIA = ("expertise", "language", "meeting", "availability")
# Saaty 1-9 pairwise judgments: how much more important row is than column.
DEFAULT_PAIRWISE = [
    [1,     2,   3,   5],
    [1 / 2, 1,   2,   3],
    [1 / 3, 1 / 2, 1, 2],
    [1 / 5, 1 / 3, 1 / 2, 1],
]
RANDOM_INDEX = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41}
# Absolute levels make a correction replace earlier evidence instead of accumulating boosts.
IMPORTANCE_LEVELS = {"flexible": 0.5, "important": 6, "top": 9, "required": 9}


def ranking_priorities(preferences):
    return {criterion: entry["importance"] for criterion, entry in (preferences or {}).items()
            if criterion in CRITERIA and isinstance(entry, dict)
            and entry.get("importance") in IMPORTANCE_LEVELS}


def merge_ranking_preferences(current, updates, user_message):
    """Validate model-extracted evidence against this turn; latest explicit preference wins.

    Store strings only, so this profile can be written directly to DynamoDB. A normal
    update removes the override. Quotes establish provenance, not semantic correctness;
    interpreting their meaning remains the chat model's responsibility.
    """
    if updates is None:
        return dict(current or {})
    if not isinstance(updates, list) or len(updates) > len(CRITERIA):
        raise ValueError("Send at most one update for each of the four ranking criteria.")
    merged, seen = dict(current or {}), set()
    def normalize(text):
        return " ".join(text.casefold().split())

    message = normalize(user_message or "")
    for update in updates:
        if not isinstance(update, dict):
            raise ValueError("Each ranking update needs criterion, importance and evidence.")
        criterion, level, evidence = (update.get(k) for k in ("criterion", "importance", "evidence"))
        if not isinstance(criterion, str) or criterion not in CRITERIA or criterion in seen:
            raise ValueError("Use each supported ranking criterion at most once.")
        if not isinstance(level, str) or level not in (*IMPORTANCE_LEVELS, "normal"):
            raise ValueError("Importance must be flexible, normal, important, top or required.")
        if level == "required" and criterion not in ("language", "meeting"):
            raise ValueError("Only language and meeting type support a required constraint.")
        if (not isinstance(evidence, str) or not evidence.strip() or len(evidence) > 300
                or normalize(evidence) not in message or screen_pii(evidence)):
            raise ValueError("Evidence must quote up to 300 characters from the current user message without PII.")
        seen.add(criterion)
        if level == "normal":
            merged.pop(criterion, None)
        else:
            merged[criterion] = {"importance": level, "evidence": evidence.strip()}
    return merged


def search_text(slots, fallback=""):
    """Build semantic matching input from the latest saved facts, including corrections."""
    parts = [f"{key}: {slots[key]}" for key in
             ("goal", "life_stage", "worries", "decision_style", "communication_cadence") if slots.get(key)]
    return "\n".join(parts) or fallback


def ahp_weights(matrix, iterations=100):
    """Principal eigenvector by power iteration. Returns (weights, lambda_max, CI, CR)."""
    n = len(matrix)
    w = [1.0 / n] * n
    for _ in range(iterations):
        v = [sum(matrix[i][j] * w[j] for j in range(n)) for i in range(n)]
        s = sum(v)
        w = [x / s for x in v]
    aw = [sum(matrix[i][j] * w[j] for j in range(n)) for i in range(n)]
    lambda_max = sum(aw[i] / w[i] for i in range(n)) / n
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    ri = RANDOM_INDEX.get(n, 1.41)
    cr = ci / ri if ri else 0.0
    return w, lambda_max, ci, cr


def pairwise_for_priority(most_important=""):
    """Default judgments, or a matrix that makes the user's stated top priority dominant."""
    key = {"expertise": "expertise", "goal": "expertise", "language": "language",
           "meeting": "meeting", "meeting_type": "meeting", "availability": "availability",
           "schedule": "availability"}.get((most_important or "").strip().lower())
    if not key:
        return DEFAULT_PAIRWISE
    importance = {c: (5 if c == key else 3 if c == "expertise" else 2) for c in CRITERIA}
    return [[importance[r] / importance[c] for c in CRITERIA] for r in CRITERIA]  # ratio matrix: CR == 0


def criteria_weights(most_important="", preferences=None):
    """AHP weights; if the judgments are inconsistent (CR > 0.10) fall back to the default matrix."""
    priorities = ranking_priorities(preferences)
    if priorities:
        # Preserve the relative defaults for criteria the user has not discussed.
        # Default maximum is 5; flexible is below every default, important/top above it.
        baseline = ahp_weights(DEFAULT_PAIRWISE)[0]
        importance = {c: 5 * weight / max(baseline) for c, weight in zip(CRITERIA, baseline)}
        importance.update({c: IMPORTANCE_LEVELS[level] for c, level in priorities.items()})
        matrix = [[importance[r] / importance[c] for c in CRITERIA] for r in CRITERIA]
    else:
        matrix = pairwise_for_priority(most_important)
    w, lam, ci, cr = ahp_weights(matrix)
    if cr > 0.10:
        w, lam, ci, cr = ahp_weights(DEFAULT_PAIRWISE)
    return {"weights": dict(zip(CRITERIA, w)), "lambda_max": lam, "ci": ci, "cr": cr}


# ---------- scoring + SKILL-02 inventory guard ----------
def normalize_meeting_type(meeting_type):
    return "in-person" if "person" in (meeting_type or "").lower() else "virtual"


def candidate_pool(advisors, language, meeting_type, preferences=None):
    lang = (language or "English").strip().capitalize()
    lang = {"Chinese": "Mandarin", "中文": "Mandarin", "Español": "Spanish"}.get(lang, lang)
    mt = normalize_meeting_type(meeting_type)
    priorities = ranking_priorities(preferences)
    allowed = [a for a in advisors
               if (priorities.get("language") != "required" or lang in a["languages"])
               and (priorities.get("meeting") != "required" or mt in a["meeting_types"])]
    language_flexible = priorities.get("language") == "flexible"
    meeting_flexible = priorities.get("meeting") == "flexible"
    pool = [a for a in allowed if (language_flexible or lang in a["languages"])
            and (meeting_flexible or mt in a["meeting_types"]) and a["open_slots"] > 0]
    if len(pool) < 3:  # relax filters rather than return nothing
        # Explicit requirements are never relaxed, even when that means no matches.
        pool = [a for a in allowed if language_flexible or lang in a["languages"]] or allowed
    return pool, lang, mt


def rank_advisors(query_embedding, advisors, language, meeting_type, most_important="", k=3, rng=random,
                  preferences=None):
    """Score every candidate on the AHP criteria and return the top k with a per-criterion breakdown."""
    pool, lang, mt = candidate_pool(advisors, language, meeting_type, preferences)
    ahp = criteria_weights(most_important, preferences)
    w = ahp["weights"]
    sims = [sum(x * y for x, y in zip(query_embedding, a["embedding"])) for a in pool]
    lo, hi = (min(sims), max(sims)) if sims else (0.0, 1.0)
    scored = []
    for a, sim in zip(pool, sims):
        criteria = {
            "expertise": (sim - lo) / (hi - lo) if hi > lo else 1.0,
            "language": 1.0 if lang in a["languages"] else 0.0,
            "meeting": 1.0 if mt in a["meeting_types"] else 0.0,
            "availability": min(a.get("open_slots", 0), 5) / 5,
        }
        total = sum(w[c] * criteria[c] for c in CRITERIA)
        scored.append({"advisor": a, "score": total, "criteria": criteria})
    # Fairness: a tiny jitter only reorders advisors whose scores are effectively tied,
    # so near-equal fits share leads instead of the same advisor always ranking first.
    scored.sort(key=lambda s: -(s["score"] + rng.uniform(0, 0.01)))
    return scored[:k], ahp, {"language": lang, "meeting_type": mt}


def is_known_advisor(advisor_id, matched_ids):
    """Return whether ranking or a verified full-directory selection authorized this advisor ID."""
    return bool(advisor_id) and advisor_id in set(matched_ids or [])


# ---------- SKILL-04: explainable match notes ----------
def match_reasons(advisor, criteria, prefs):
    """Structured, deterministic reasons; the web app renders them in the user's language."""
    reasons = []
    if criteria["language"]:
        reasons.append({"code": "language", "value": prefs["language"]})
    if criteria["meeting"]:
        reasons.append({"code": "meeting", "value": prefs["meeting_type"]})
    if criteria["expertise"] >= 0.5 and advisor.get("focus"):
        reasons.append({"code": "focus", "value": advisor["focus"][0]})
    if advisor.get("open_slots", 0) > 0:
        reasons.append({"code": "availability", "value": int(advisor["open_slots"])})
    return reasons


def top_drivers(weights, n=2):
    return [c for c, _ in sorted(weights.items(), key=lambda kv: -kv[1])[:n]]


def fee_disclosure(advisor):
    """Fee transparency: always say how the advisor is paid, even when the demo data does not know."""
    return {
        "fee_model": advisor.get("fee_model", "Ask your advisor"),
        "platform": advisor.get("platform", "Ask your advisor"),
        "form_crs_note": "You'll receive a Form CRS: a short summary of services, fees and conflicts of interest.",
    }


# ---------- advisor directory (browse every advisor, not only the top 3) ----------
DIRECTORY_FIELDS = ("advisor_id", "name", "city", "zip", "languages", "meeting_types", "focus", "bio",
                    "open_slots", "photo_url", "fee_model", "platform")


def directory(advisors, language="", meeting_type="", text=""):
    """Filter and sort the full advisor list for the directory view. No ranking, no embeddings returned."""
    lang = (language or "").strip().capitalize()
    mt = normalize_meeting_type(meeting_type) if (meeting_type or "").strip() else ""
    words = [w for w in (text or "").lower().split() if w]
    out = []
    for a in advisors:
        if lang and lang not in a["languages"]:
            continue
        if mt and mt not in a["meeting_types"]:
            continue
        haystack = " ".join([
            a.get("name", ""), a.get("city", ""), a.get("zip", ""), a.get("bio", ""),
            a.get("fee_model", ""), a.get("platform", ""), *a.get("languages", []),
            *a.get("meeting_types", []), *a.get("focus", []),
        ]).lower()
        if any(w not in haystack for w in words):
            continue
        item = {k: a[k] for k in DIRECTORY_FIELDS if k in a}
        item["disclosure"] = fee_disclosure(a)
        out.append(item)
    # Accepting new clients first, then alphabetical, so the order is neutral (no paid placement).
    out.sort(key=lambda a: (a.get("open_slots", 0) <= 0, a["name"]))
    return out
