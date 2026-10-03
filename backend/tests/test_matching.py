import random

import pytest

import matching


# ---------- SKILL-01 ----------
@pytest.mark.parametrize("text,kind", [
    ("my ssn is 123-45-6789", "ssn"),
    ("social security 123456789", "ssn"),
    ("email me at jo.doe+x@example.com", "email"),
    ("call 704-555-0134", "phone"),
    ("(704) 555 0134 works", "phone"),
    ("card 4111 1111 1111 1111", "card_number"),
    ("I live at 1200 Main Street", "street_address"),
])
def test_screen_pii_flags_identifiers(text, kind):
    assert kind in matching.screen_pii(text)


@pytest.mark.parametrize("text", [
    "Hi, I am 26 and want to buy a house in 5 years.",
    "I have about $50,000 in student loans",
    "Maybe Tuesday at 6pm, my name is Ana",
    "Quiero ahorrar para mi primera casa",
])
def test_screen_pii_allows_normal_intake(text):
    assert matching.screen_pii(text) == []


def test_slots_merge_and_progress():
    slots = matching.merge_slots({}, {"goal": " buy a home ", "language": "", "unknown": "x"})
    assert slots == {"goal": "buy a home"}
    p = matching.intake_progress(slots)
    assert p["percent"] == round(100 / len(matching.INTAKE_SLOTS)) and not p["ready_to_match"]
    slots = matching.merge_slots(slots, {"language": "Spanish", "meeting_type": "virtual"})
    assert matching.intake_progress(slots)["ready_to_match"]


# ---------- SKILL-03 ----------
def test_default_ahp_matrix_is_consistent_and_ordered():
    w, lam, ci, cr = matching.ahp_weights(matching.DEFAULT_PAIRWISE)
    assert abs(sum(w) - 1) < 1e-9
    assert cr < 0.10
    assert w == sorted(w, reverse=True)  # expertise > language > meeting > availability


def test_priority_matrix_makes_priority_dominant():
    ahp = matching.criteria_weights("language")
    assert max(ahp["weights"], key=ahp["weights"].get) == "language"
    assert ahp["cr"] < 1e-6


def test_inconsistent_judgments_fall_back(monkeypatch):
    bad = [[1, 9, 1 / 9, 1], [1 / 9, 1, 9, 1], [9, 1 / 9, 1, 1], [1, 1, 1, 1]]
    monkeypatch.setattr(matching, "pairwise_for_priority", lambda _: bad)
    assert matching.ahp_weights(bad)[3] > 0.10
    assert matching.criteria_weights("x")["cr"] < 0.10


# ---------- ranking, SKILL-02, SKILL-04 ----------
def adv(i, emb, langs=("English",), mts=("virtual",), slots=3, **extra):
    return {"advisor_id": f"adv-{i}", "name": f"A{i}", "city": "X", "languages": list(langs),
            "meeting_types": list(mts), "focus": [f"focus {i}"], "bio": "", "open_slots": slots,
            "embedding": emb, **extra}


def test_rank_prefers_semantic_fit_and_explains_it():
    pool = [adv(1, [1, 0]), adv(2, [0, 1]), adv(3, [0.7, 0.7]), adv(4, [0.2, 0.9])]
    picks, ahp, prefs = matching.rank_advisors([1, 0], pool, "english", "Virtual", rng=random.Random(0))
    assert [p["advisor"]["advisor_id"] for p in picks][0] == "adv-1"
    assert prefs == {"language": "English", "meeting_type": "virtual"}
    codes = [r["code"] for r in matching.match_reasons(picks[0]["advisor"], picks[0]["criteria"], prefs)]
    assert codes == ["language", "meeting", "focus", "availability"]
    assert 0 < picks[0]["score"] <= 1


def test_rank_relaxes_filters_when_pool_is_small():
    pool = [adv(1, [1, 0], mts=("in-person",)), adv(2, [0, 1], slots=0), adv(3, [1, 1], langs=("Spanish",))]
    picks, _, _ = matching.rank_advisors([1, 0], pool, "English", "virtual")
    assert {p["advisor"]["advisor_id"] for p in picks} == {"adv-1", "adv-2"}


def test_only_retrieved_advisors_can_be_booked():
    assert matching.is_known_advisor("adv-1", ["adv-1", "adv-2"])
    assert not matching.is_known_advisor("adv-999", ["adv-1"])
    assert not matching.is_known_advisor("", [])


def test_fee_disclosure_never_blank():
    assert matching.fee_disclosure({})["fee_model"] == "Ask your advisor"
    d = matching.fee_disclosure({"fee_model": "Fee-only", "platform": "SAM"})
    assert d["fee_model"] == "Fee-only" and "Form CRS" in d["form_crs_note"]


def test_directory_filters_and_hides_embeddings():
    pool = [adv(1, [1, 0], langs=("English", "Spanish"), bio="first home"), adv(2, [0, 1], mts=("in-person",)),
            adv(3, [1, 1], slots=0)]
    everyone = matching.directory(pool)
    assert [a["advisor_id"] for a in everyone] == ["adv-1", "adv-2", "adv-3"]  # full slots last
    assert all("embedding" not in a and a["disclosure"]["fee_model"] for a in everyone)
    assert [a["advisor_id"] for a in matching.directory(pool, language="spanish")] == ["adv-1"]
    assert [a["advisor_id"] for a in matching.directory(pool, meeting_type="In person")] == ["adv-2"]
    assert [a["advisor_id"] for a in matching.directory(pool, text="FIRST home")] == ["adv-1"]
    assert matching.directory(pool, text="nobody") == []


def test_directory_passes_photo_url_only_when_present():
    with_photo = adv(1, [1, 0], photo_url="/advisors/adv-1.jpg")
    items = matching.directory([with_photo, adv(2, [0, 1])])
    assert items[0]["photo_url"] == "/advisors/adv-1.jpg" and "photo_url" not in items[1]


def test_financial_intent_is_an_intake_slot():
    assert matching.merge_slots({}, {"financial_intent": "401(k) rollover"}) == {"financial_intent": "401(k) rollover"}
