"""Every advisor in the demo list is real, unique and can be found by the name people type."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "seed"))
import matching  # noqa: E402
import seed  # noqa: E402

ADVISORS = seed.build_advisors()


def test_advisor_ids_and_names_are_unique():
    ids = [a["advisor_id"] for a in ADVISORS]
    names = [a["name"] for a in ADVISORS]
    assert len(ids) == len(set(ids)), "duplicate advisor_id in seed data"
    assert len(names) == len(set(names)), "duplicate advisor name in seed data"


def test_pinned_demo_advisors_are_present_with_full_details():
    by_id = {a["advisor_id"]: a for a in ADVISORS}
    for advisor_id, name in [("adv-901", "Sofia Ramirez"), ("adv-902", "Jordan Ellis"), ("adv-903", "Mei Lin")]:
        assert by_id[advisor_id]["name"] == name
        assert by_id[advisor_id]["fee_model"] and by_id[advisor_id]["platform"]


@pytest.mark.parametrize("advisor", ADVISORS, ids=lambda a: a["name"])
def test_every_advisor_can_be_found_by_name(advisor):
    name = advisor["name"]
    first, last = name.split()[0], name.split()[-1]
    for typed in (name, name.lower(), name.upper(), f"  {name}. ", f"{last} {first}"):
        assert [a["advisor_id"] for a in matching.find_advisors(ADVISORS, typed)] == [advisor["advisor_id"]], typed


def test_accents_and_partial_names():
    assert [a["name"] for a in matching.find_advisors(ADVISORS, "Sofía Ramírez")] == ["Sofia Ramirez"]
    assert [a["name"] for a in matching.find_advisors(ADVISORS, "ramirez")] == ["Sofia Ramirez"]
    assert "Mei Lin" in [a["name"] for a in matching.find_advisors(ADVISORS, "Mei")]


def test_unknown_names_are_not_found_but_get_suggestions():
    assert matching.find_advisors(ADVISORS, "Nobody Imaginary") == []
    assert matching.find_advisors(ADVISORS, "") == []
    assert "Sofia Ramirez" in matching.closest_names(ADVISORS, "Sofia Ramos")
