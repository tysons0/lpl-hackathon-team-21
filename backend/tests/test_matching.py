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


def preference(criterion, importance, evidence):
    return {"criterion": criterion, "importance": importance, "evidence": evidence}


def test_conversation_priorities_accumulate_without_repeated_boosts_and_allow_corrections():
    first = preference("availability", "top", "Meeting soon matters most")
    profile = matching.merge_ranking_preferences({}, [first], first["evidence"])
    original = dict(profile)
    for _ in range(10):
        profile = matching.merge_ranking_preferences(profile, [first], first["evidence"])
    assert profile == original
    second = preference("language", "important", "Spanish is important too")
    profile = matching.merge_ranking_preferences(profile, [second], second["evidence"])
    assert matching.ranking_priorities(profile) == {"availability": "top", "language": "important"}
    correction = preference("availability", "flexible", "Actually, I can wait")
    profile = matching.merge_ranking_preferences(profile, [correction], correction["evidence"])
    assert matching.ranking_priorities(profile) == {"availability": "flexible", "language": "important"}
    reset = preference("language", "normal", "Language has normal importance again")
    profile = matching.merge_ranking_preferences(profile, [reset], reset["evidence"])
    assert matching.ranking_priorities(profile) == {"availability": "flexible"}


@pytest.mark.parametrize("criterion,level,quote,message", [
    ("fees", "top", "Fees matter most", "Fees matter most"),
    ("availability", "infinite", "I need someone soon", "I need someone soon"),
    ("expertise", "required", "Only experts", "Only experts"),
    ("language", "top", "Spanish matters most", "Hello"),
    ("language", "top", "", "Hello"),
    ("language", "top", "me@example.com", "me@example.com"),
])
def test_ranking_rejects_unknown_criteria_and_ungrounded_evidence(criterion, level, quote, message):
    with pytest.raises(ValueError):
        matching.merge_ranking_preferences({}, [preference(criterion, level, quote)], message)


@pytest.mark.parametrize("message", ["El idioma es lo más importante", "语言对我最重要"])
def test_priority_evidence_can_be_in_the_users_language(message):
    profile = matching.merge_ranking_preferences({}, [preference("language", "top", message)], message)
    weights = matching.criteria_weights(preferences=profile)["weights"]
    assert max(weights, key=weights.get) == "language"


def test_adaptive_ranking_changes_order_and_preserves_consistent_normalized_weights():
    pool = [adv(1, [1, 0], slots=1), adv(2, [0, 1], slots=5), adv(3, [.3, .7], slots=2)]
    original, _, _ = matching.rank_advisors([1, 0], pool, "English", "virtual", rng=random.Random(0))
    assert original[0]["advisor"]["advisor_id"] == "adv-1"
    profile = {"availability": {"importance": "top"}}
    updated, ahp, _ = matching.rank_advisors(
        [1, 0], pool, "English", "virtual", rng=random.Random(0), preferences=profile)
    assert updated[0]["advisor"]["advisor_id"] == "adv-2"
    assert matching.top_drivers(ahp["weights"])[0] == "availability"
    assert sum(ahp["weights"].values()) == pytest.approx(1)
    assert all(0 < weight < 1 for weight in ahp["weights"].values())
    assert abs(ahp["cr"]) < 1e-6


def test_flexible_meeting_format_expands_candidate_pool():
    pool = [adv(i, [0, 1]) for i in (1, 2, 3)] + [adv(4, [1, 0], mts=("in-person",))]
    strict, _, _ = matching.rank_advisors([1, 0], pool, "English", "virtual")
    assert all(p["advisor"]["advisor_id"] != "adv-4" for p in strict)
    flexible, _, _ = matching.rank_advisors(
        [1, 0], pool, "English", "virtual", preferences={"meeting": {"importance": "flexible"}})
    assert flexible[0]["advisor"]["advisor_id"] == "adv-4"


def test_required_constraints_are_never_relaxed():
    pool = [adv(1, [1, 0]), adv(2, [0, 1], langs=("Spanish",), mts=("in-person",))]
    profile = {"language": {"importance": "required"}, "meeting": {"importance": "required"}}
    picks, _, _ = matching.rank_advisors([1, 0], pool, "Spanish", "virtual", preferences=profile)
    assert picks == []


def test_normal_resets_original_weights_and_latest_goal_replaces_old_search_text():
    profile = {"expertise": {"importance": "top"}}
    reset = preference("expertise", "normal", "Reset expertise")
    profile = matching.merge_ranking_preferences(profile, [reset], reset["evidence"])
    assert matching.criteria_weights(preferences=profile) == matching.criteria_weights()
    assert matching.search_text({"goal": "retire"}, "buy a home") == "goal: retire"


@pytest.mark.parametrize("criterion", matching.CRITERIA)
def test_flexible_lowers_weight_and_top_is_dominant_for_every_criterion(criterion):
    baseline = matching.criteria_weights()["weights"]
    flexible = matching.criteria_weights(preferences={criterion: {"importance": "flexible"}})["weights"]
    top = matching.criteria_weights(preferences={criterion: {"importance": "top"}})["weights"]
    assert flexible[criterion] < baseline[criterion] < top[criterion]
    assert max(top, key=top.get) == criterion
    others = [c for c in matching.CRITERIA if c != criterion]
    assert flexible[others[0]] / flexible[others[1]] == pytest.approx(baseline[others[0]] / baseline[others[1]])
