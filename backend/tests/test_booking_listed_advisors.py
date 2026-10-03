"""Any advisor shown in the app (top matches or the All advisors list) can be booked, whether the person
uses the booking form or asks in the chat. Invented advisors are still rejected.

Runs the real Lambda handler with in-memory fakes for DynamoDB, EventBridge and the AI agent.
Needs the Strands SDK installed (`pip install strands-agents`); skipped otherwise.
"""
import datetime
import json
import os
import sys

import pytest

pytest.importorskip("strands")
os.environ.update(AWS_DEFAULT_REGION="us-east-1", BOOKINGS_TABLE="bookings", FUNNEL_TABLE="funnel",
                  INTAKE_TABLE="intake", DATA_BUCKET="data", EVENT_BUS="bus", MODEL_ID="model",
                  GUARDRAIL_ID="g", GUARDRAIL_VERSION="1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "seed"))
from botocore.exceptions import ClientError  # noqa: E402

import lambda_function as lf  # noqa: E402
import seed  # noqa: E402


class FakeTable:
    def __init__(self, name):
        self.name, self.items = name, {}

    def get_item(self, Key):
        k = next(iter(Key.values()))
        return {"Item": dict(self.items[k])} if k in self.items else {}

    def put_item(self, Item, ConditionExpression=None):
        k = next(iter(Item.values()))
        if ConditionExpression and k in self.items:
            raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")
        self.items[k] = dict(Item)

    def delete_item(self, Key):
        self.items.pop(next(iter(Key.values())), None)

    def scan(self, Limit=None, FilterExpression=None):
        return {"Items": list(self.items.values())}

    def query(self, **kw):
        return {"Items": []}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames=None,
                    ReturnValues=None):
        it = self.items.setdefault(next(iter(Key.values())), dict(Key))
        for part in UpdateExpression[4:].split(", "):
            n, v = part.split(" = ")
            it[(ExpressionAttributeNames or {}).get(n.strip(), n.strip())] = ExpressionAttributeValues[v.strip()]
        return {"Attributes": dict(it)}


class FakeDynamo:
    def __init__(self, table):
        self.table = table

    def batch_get_item(self, RequestItems):
        keys = RequestItems[self.table.name]["Keys"]
        return {"Responses": {self.table.name: [k for k in keys if k["booking_id"] in self.table.items]}}


class FakeEvents:
    def put_events(self, Entries):
        return {"FailedEntryCount": 0}


class FakeAgent:
    """Stands in for the AI: records the message it was given and replies with a fixed text."""
    last_message = ""

    def __init__(self, **kw):
        pass

    def __call__(self, message):
        FakeAgent.last_message = message
        return "OK"


@pytest.fixture()
def app(monkeypatch):
    bookings = FakeTable("bookings")
    monkeypatch.setattr(lf, "BOOKINGS", bookings)
    monkeypatch.setattr(lf, "INTAKE", FakeTable("intake"))
    monkeypatch.setattr(lf, "FUNNEL", FakeTable("funnel"))
    monkeypatch.setattr(lf, "DDB", FakeDynamo(bookings))
    monkeypatch.setattr(lf, "EVENTS", FakeEvents())
    monkeypatch.setattr(lf, "Agent", FakeAgent)
    monkeypatch.setattr(lf, "S3SessionManager", lambda **kw: None)
    monkeypatch.setattr(lf, "embed", lambda text: [1.0, 0.0])
    advisors = seed.build_advisors()
    for a in advisors:
        a["open_slots"] = max(a["open_slots"], 1)  # everyone bookable for these tests
        a["embedding"] = [1.0, 0.0]
    monkeypatch.setattr(lf, "_ADVISORS", advisors)
    return bookings


def call(path, body):
    r = lf.lambda_handler({"rawPath": path, "body": json.dumps(body)}, None)
    return r["statusCode"], json.loads(r["body"])


def as_session(session_id):
    lf.UI.clear()
    lf.UI["session_id"] = session_id


def tool(fn, **kw):
    return fn._tool_func(**kw)


def next_weekday():
    d = datetime.date.today() + datetime.timedelta(days=1)
    while d.weekday() >= 5:
        d += datetime.timedelta(days=1)
    return d.isoformat()


ALL = seed.build_advisors()


def test_all_advisors_list_matches_the_inventory(app):
    code, body = call("/advisors", {})
    assert code == 200
    assert sorted(a["name"] for a in body["advisors"]) == sorted(a["name"] for a in ALL)
    assert body["total"] == len(ALL)


@pytest.mark.parametrize("advisor", ALL, ids=lambda a: a["name"])
def test_every_listed_advisor_can_be_booked_with_the_form(app, advisor):
    form = {"advisor_id": advisor["advisor_id"], "first_name": "Ana", "date": next_weekday(), "time": "10:00",
            "purpose": "First home"}
    code, body = call("/chat", {"message": f"I'd like to meet with {advisor['name']}.", "session_id": "sess-form-01",
                                "booking": form})
    assert code == 200, body
    assert body["booking"]["advisor_name"] == advisor["name"]
    # The AI is told this advisor is real, so it never replies that they don't exist.
    assert advisor["name"] in FakeAgent.last_message and "advisor list" in FakeAgent.last_message


@pytest.mark.parametrize("advisor", ALL, ids=lambda a: a["name"])
def test_every_listed_advisor_can_be_booked_in_chat_by_id(app, advisor):
    """Picked from All advisors (never in this chat's search results), then booked by chatting."""
    as_session("sess-chat-01")
    result = tool(lf.book_meeting, advisor_id=advisor["advisor_id"], prospect_name="Ana", time_slot="Tuesday 6pm")
    assert "error" not in result, result
    assert result["advisor_name"] == advisor["name"]


@pytest.mark.parametrize("advisor", ALL, ids=lambda a: a["name"])
def test_every_listed_advisor_can_be_booked_in_chat_by_name(app, advisor):
    """The AI only knows the name the person typed, e.g. "book me with sofia ramirez"."""
    as_session("sess-chat-02")
    result = tool(lf.book_meeting, advisor_id=advisor["name"].lower(), prospect_name="Ana", time_slot="Tuesday 6pm")
    assert "error" not in result, result
    assert result["advisor_id"] == advisor["advisor_id"]


@pytest.mark.parametrize("advisor", ALL, ids=lambda a: a["name"])
def test_ai_can_look_up_every_listed_advisor_by_name(app, advisor):
    as_session("sess-chat-03")
    found = tool(lf.find_advisor, name=advisor["name"])
    assert [a["advisor_id"] for a in found["advisors"]] == [advisor["advisor_id"]]


def test_searched_advisors_can_still_be_booked(app):
    as_session("sess-chat-04")
    picks = tool(lf.search_advisors, needs="first home", language="English", meeting_type="virtual")
    for p in picks:
        assert "error" not in tool(lf.book_meeting, advisor_id=p["advisor_id"], prospect_name="Ana", time_slot="Mon 9am")


def test_invented_advisors_are_still_rejected(app):
    as_session("sess-chat-05")
    for fake in ("adv-777", "Imaginary Person", ""):
        result = tool(lf.book_meeting, advisor_id=fake, prospect_name="Ana", time_slot="Mon 9am")
        assert "error" in result, fake
    assert not [b for b in app.items.values() if b.get("kind") != "slot_lock"]
    assert tool(lf.find_advisor, name="Imaginary Person")["advisors"] == []
    code, body = call("/chat", {"message": "book", "session_id": "sess-form-02",
                                "booking": {"advisor_id": "adv-777", "first_name": "Ana", "date": next_weekday(),
                                            "time": "10:00", "purpose": ""}})
    assert code == 404


def test_misspelled_name_gets_suggestions_not_a_dead_end(app):
    as_session("sess-chat-06")
    result = tool(lf.book_meeting, advisor_id="Sofia Ramos", prospect_name="Ana", time_slot="Mon 9am")
    assert "error" in result and "Sofia Ramirez" in result["did_you_mean"]


def test_system_prompt_lets_the_ai_mention_advisors_from_the_list():
    assert "Only mention advisors returned by search_advisors" not in lf.SYSTEM_PROMPT
    assert "find_advisor" in lf.SYSTEM_PROMPT
