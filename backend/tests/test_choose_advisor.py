"""Choosing one of the three matches tells the AI who was chosen (so it asks the right follow-up) and never
removes the other advisors from the list: they can still be found and booked."""
import pytest

pytest.importorskip("strands")
from test_booking_listed_advisors import ALL, FakeAgent, app, as_session, call, next_weekday, tool  # noqa: E402,F401

import lambda_function as lf  # noqa: E402


def three_matches():
    as_session("sess-choose-01")
    return tool(lf.search_advisors, needs="first home", language="English", meeting_type="virtual")


def test_choice_is_passed_to_the_ai_with_the_right_follow_up(app):
    chosen = three_matches()[0]
    code, _ = call("/chat", {"message": "Thursday at 3pm works", "session_id": "sess-choose-01",
                             "selected_advisor_id": chosen["advisor_id"]})
    assert code == 200
    msg = FakeAgent.last_message
    assert f"They already chose {chosen['name']}" in msg and chosen["advisor_id"] in msg
    assert "Don't ask which advisor they want" in msg
    assert "doesn't exist" not in msg and "advisor directory" not in msg


def test_choice_is_remembered_for_the_session(app):
    chosen = three_matches()[1]
    call("/chat", {"message": "ok", "session_id": "sess-choose-02", "selected_advisor_id": chosen["advisor_id"]})
    assert chosen["advisor_id"] in lf.get_state("sess-choose-02")["matched_ids"]


def test_the_other_two_are_still_in_the_advisor_list(app):
    matches = three_matches()
    chosen, others = matches[0], matches[1:]
    call("/chat", {"message": "ok", "session_id": "sess-choose-03", "selected_advisor_id": chosen["advisor_id"]})
    code, body = call("/advisors", {})
    listed = {a["advisor_id"] for a in body["advisors"]}
    assert code == 200 and body["total"] == len(ALL) and len(listed) == len(ALL)
    for o in others:
        assert o["advisor_id"] in listed
        as_session("sess-choose-03")
        assert [a["advisor_id"] for a in tool(lf.find_advisor, name=o["name"])["advisors"]] == [o["advisor_id"]]


def test_the_other_two_can_still_be_booked_after_a_choice(app):
    matches = three_matches()
    chosen, others = matches[0], matches[1:]
    call("/chat", {"message": "ok", "session_id": "sess-choose-04", "selected_advisor_id": chosen["advisor_id"]})
    for i, o in enumerate(others):
        form = {"advisor_id": o["advisor_id"], "first_name": "Ana", "date": next_weekday(), "time": f"1{i}:00",
                "purpose": ""}
        code, body = call("/chat", {"message": "book", "session_id": "sess-choose-04", "booking": form})
        assert code == 200 and body["booking"]["advisor_id"] == o["advisor_id"]


def test_booking_the_chosen_advisor_does_not_repeat_the_choice_note(app):
    chosen = three_matches()[2]
    form = {"advisor_id": chosen["advisor_id"], "first_name": "Ana", "date": next_weekday(), "time": "09:30",
            "purpose": ""}
    code, body = call("/chat", {"message": "book", "session_id": "sess-choose-05",
                                "selected_advisor_id": chosen["advisor_id"], "booking": form})
    assert code == 200 and body["booking"]["advisor_name"] == chosen["name"]
    assert "They already chose" not in FakeAgent.last_message
    assert "already booked" in FakeAgent.last_message


def test_unknown_choice_is_ignored(app):
    code, _ = call("/chat", {"message": "hi", "session_id": "sess-choose-06", "selected_advisor_id": "adv-777"})
    assert code == 200 and "They already chose" not in FakeAgent.last_message
