"""Every dashboard recommendation carries a stable id and the numbers behind it, so the web app can show it in
the visitor's language (web/src/i18n.js `rec`) instead of the English title and body."""
import pytest

pytest.importorskip("strands")
import lambda_function as lf  # noqa: E402

IDS = {"first_proof", "conversion", "scale", "handoff", "prove"}


@pytest.mark.parametrize("funnel, expected", [
    ({}, [("first_proof", {})]),
    ({"matched": 10, "booked": 1, "briefing_sent": 1}, [("conversion", {"conversion": 10}), ("handoff", {"rate": 10}),
                                                       ("prove", {"matched": 10})]),
    ({"matched": 4, "booked": 2, "briefing_sent": 4}, [("scale", {"conversion": 50}), ("prove", {"matched": 4})]),
    ({"matched": 2, "booked": 2, "briefing_sent": 1}, [("scale", {"conversion": 100}), ("handoff", {"rate": 50})]),
])
def test_recommendations_have_ids_and_values(funnel, expected):
    recs = lf.actionable_insights(funnel)
    assert [(r["id"], r["values"]) for r in recs] == expected
    for r in recs:
        assert r["id"] in IDS and r["title"] and r["body"] and r["priority"]
