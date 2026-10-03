"""Exercise the actual chat route and decorated tools with local AWS/model substitutes."""
import copy
import importlib.util
import json
import sys
from pathlib import Path
from unittest.mock import Mock

import boto3
import pytest
import strands.models
from boto3.dynamodb.types import TypeSerializer

import matching


class IntakeTable:
    def __init__(self):
        self.items = {}

    def get_item(self, Key, ConsistentRead):
        assert ConsistentRead is True
        return {"Item": copy.deepcopy(self.items.get(Key["session_id"], {}))}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues):
        # Match DynamoDB's number constraints: reject accidental float persistence.
        TypeSerializer().serialize(ExpressionAttributeValues)
        item = self.items.setdefault(Key["session_id"], {})
        for placeholder, name in ExpressionAttributeNames.items():
            item[name] = copy.deepcopy(ExpressionAttributeValues[":" + placeholder[1:]])


class AdvisorPaginator:
    def __init__(self, table):
        self.table = table

    def paginate(self, TableName):
        assert TableName == self.table.name
        for offset in range(0, len(self.table.items), 2):
            yield {"Items": copy.deepcopy(self.table.items[offset:offset + 2])}


class AdvisorTable:
    name = "local-test-advisors"

    def __init__(self):
        self.items = []
        self.meta = Mock()
        self.meta.client.get_paginator = Mock(side_effect=lambda operation: AdvisorPaginator(self))

    def get_item(self, Key, ConsistentRead):
        assert ConsistentRead is True
        item = next((item for item in self.items if item["advisor_id"] == Key["advisor_id"]), None)
        return {"Item": copy.deepcopy(item)} if item else {}


@pytest.fixture
def app(monkeypatch):
    for key in ("BOOKINGS_TABLE", "ADVISORS_TABLE", "FUNNEL_TABLE", "INTAKE_TABLE", "DATA_BUCKET", "MODEL_ID"):
        monkeypatch.setenv(key, "local-test")
    monkeypatch.setattr(boto3, "client", Mock())
    monkeypatch.setattr(boto3, "resource", Mock())
    monkeypatch.setattr(strands.models, "BedrockModel", Mock())
    spec = importlib.util.spec_from_file_location("chat_ranking_app", Path(__file__).parents[1] / "lambda_function.py")
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    module.INTAKE = IntakeTable()
    module.UI["session_id"] = "session-123"
    module.S3SessionManager = Mock()
    module.log_event = Mock()
    module.log = Mock()
    module.emit_metric = Mock()
    module.embed = Mock(return_value=[1, 0])
    module._ADVISORS = [
        {"advisor_id": f"adv-{i}", "name": f"Advisor {i}", "city": "Austin, TX", "languages": ["English"],
         "meeting_types": ["virtual"], "focus": ["retirement"], "bio": "Planning", "open_slots": slots,
         "embedding": embedding}
        for i, embedding, slots in [(1, [1, 0], 1), (2, [0, 1], 5), (3, [.3, .7], 2)]
    ]
    module.ADVISORS = AdvisorTable()
    module.ADVISORS.items = [{key: value for key, value in profile.items() if key != "embedding"}
                             for profile in module._ADVISORS]
    return module


def chat(app, message, act, session_id="session-123", **extra):
    def build_agent(**kwargs):
        assert app.record_preferences in kwargs["tools"]
        assert app.lookup_advisors in kwargs["tools"]
        assert isinstance(kwargs["tool_executor"], app.SequentialToolExecutor)
        def invoke(prompt):
            act()
            return "Here are your updated matches."
        return invoke
    app.Agent = Mock(side_effect=build_agent)
    response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps(
        {"message": message, "session_id": session_id, **extra})}, None)
    assert response["statusCode"] == 200, response
    return json.loads(response["body"])


def learn(app, criterion, importance, evidence, **slots):
    return app.record_preferences(ranking_preferences=[
        {"criterion": criterion, "importance": importance, "evidence": evidence}], **slots)


def test_chat_changes_rank_across_turns_without_explicit_second_search(app):
    def first_turn():
        app.record_preferences(goal="retirement", language="English", meeting_type="virtual")
        app.search_advisors("retirement")
    first = chat(app, "Retirement, English, virtual", first_turn)
    assert first["matches"][0]["advisor_id"] == "adv-1"
    second = chat(app, "Meeting soon matters most", lambda: learn(
        app, "availability", "top", "Meeting soon matters most"))
    assert second["matches"][0]["advisor_id"] == "adv-2"
    assert second["matches"][0]["drivers"][0] == "availability"
    assert second["ranking"]["weights"]["availability"] > second["ranking"]["weights"]["expertise"]
    assert "_user_message" not in second
    assert app.INTAKE.items["session-123"]["ranking_preferences"]["availability"]["importance"] == "top"

    calls = app.embed.call_count
    repeated = chat(app, "Meeting soon matters most", lambda: learn(
        app, "availability", "top", "Meeting soon matters most"))
    assert repeated["ranking"] == second["ranking"]
    assert app.embed.call_count == calls  # repeated evidence needs no reranking

    corrected = chat(app, "Actually, I can wait", lambda: learn(
        app, "availability", "flexible", "Actually, I can wait"))
    assert corrected["matches"][0]["advisor_id"] == "adv-1"

    # Simulates another Lambda invocation: UI is cleared, profile comes from storage.
    persisted = chat(app, "Show them again", lambda: app.search_advisors("retirement"))
    assert persisted["ranking"] == corrected["ranking"]
    separate = chat(app, "Retirement", lambda: app.search_advisors("retirement"), session_id="session-456")
    assert separate["ranking"]["priorities"] == {}
    assert separate["ranking"]["weights"] == matching.criteria_weights()["weights"]


def test_required_language_clears_cards_and_relaxing_it_refreshes_again(app):
    def initial():
        app.record_preferences(goal="retirement", language="English", meeting_type="virtual")
        app.search_advisors("retirement")
    chat(app, "Retirement, English, virtual", initial)
    required = chat(app, "Spanish is essential", lambda: learn(
        app, "language", "required", "Spanish is essential", language="Spanish"))
    assert required["matches"] == []
    assert app.get_state("session-123")["matched_ids"] == []
    relaxed = chat(app, "Any language is fine", lambda: learn(
        app, "language", "flexible", "Any language is fine"))
    assert len(relaxed["matches"]) == 3


def test_fake_evidence_is_rejected_without_changing_saved_preferences(app):
    observed = []
    chat(app, "Hello", lambda: observed.append(learn(app, "availability", "top", "I need someone soon")))
    assert "error" in observed[0]
    assert app.get_state("session-123")["ranking_preferences"] == {}


def test_pii_and_invalid_requests_never_reach_agent(app):
    app.Agent = Mock(side_effect=AssertionError("Agent must not run"))
    response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps(
        {"message": "Email me at me@example.com", "session_id": "session-123"})}, None)
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["pii_blocked"] is True
    for message in ("", "   ", "x" * 4001):
        response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps({"message": message})}, None)
        assert response["statusCode"] == 400
    app.Agent.assert_not_called()


def test_saved_language_and_corrected_goal_override_stale_search_arguments(app):
    def initial():
        app.record_preferences(goal="buy a home", language="Spanish", meeting_type="virtual")
        app.search_advisors("buy a home", language="English")
    chat(app, "Buy a home, Spanish, virtual", initial)
    chat(app, "Actually retirement", lambda: app.record_preferences(goal="retirement"))
    app.embed.assert_called_with("goal: retirement")
    assert app.get_state("session-123")["slots"]["language"] == "Spanish"


def test_full_inventory_lookup_reads_all_dynamodb_pages_and_returns_profiles_without_embeddings(app):
    all_profiles = app.advisor_inventory()
    assert app.ADVISORS.meta.client.get_paginator.call_args.args == ("scan",)
    assert {item["advisor_id"] for item in all_profiles} == {"adv-1", "adv-2", "adv-3"}
    result = app.lookup_advisors("Advisor 3")
    assert [item["advisor_id"] for item in result] == ["adv-3"]
    assert result[0]["name"] == "Advisor 3"
    assert "embedding" not in result[0]
    assert app.get_state(app.UI["session_id"])["authorized_advisor_ids"] == ["adv-3"]


def test_selected_directory_record_is_verified_and_given_to_chat_agent(app):
    observed = {}

    def build_agent(**kwargs):
        observed["tools"] = kwargs["tools"]
        assert app.lookup_advisors in kwargs["tools"]
        def invoke(prompt):
            observed["prompt"] = prompt
            return "I have the advisor details."
        return invoke

    app.Agent = Mock(side_effect=build_agent)
    response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps({
        "message": "I want to meet this advisor.", "session_id": "session-123", "selected_advisor_id": "adv-3",
    })}, None)

    assert response["statusCode"] == 200
    assert "Advisor 3" in observed["prompt"]
    assert '"advisor_id": "adv-3"' in observed["prompt"]
    assert app.get_state("session-123")["authorized_advisor_ids"] == ["adv-3"]


def test_directory_endpoint_reads_all_profiles_from_dynamodb(app):
    response = app.lambda_handler({"rawPath": "/advisors", "body": "{}"}, None)

    assert response["statusCode"] == 200
    payload = json.loads(response["body"])
    assert payload["total"] == 3
    assert {advisor["advisor_id"] for advisor in payload["advisors"]} == {"adv-1", "adv-2", "adv-3"}
    assert all("embedding" not in advisor for advisor in payload["advisors"])


def test_directory_booking_passes_verified_database_record_to_chat_agent(app, monkeypatch):
    observed = {}
    appointment = {
        "booking_id": "0123456789", "advisor_id": "adv-3", "advisor_name": "Advisor 3",
        "prospect_name": "Jamie", "time_slot": "2030-01-04 at 10:00", "meeting_purpose": "first home",
    }
    monkeypatch.setattr(app.scheduling, "check_slot", Mock(return_value=None))
    app.create_scheduled_booking = Mock(return_value=appointment)

    def build_agent(**kwargs):
        assert app.lookup_advisors in kwargs["tools"]
        return lambda prompt: observed.setdefault("prompt", prompt) or "Meeting ready."

    app.Agent = Mock(side_effect=build_agent)
    response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps({
        "message": "I want to meet Advisor 3.", "session_id": "session-123", "selected_advisor_id": "adv-3",
        "booking": {"advisor_id": "adv-3", "first_name": "Jamie", "date": "2030-01-04",
                    "time": "10:00", "purpose": "first home"},
    })}, None)

    assert response["statusCode"] == 200
    assert app.create_scheduled_booking.call_args.args[2]["advisor_id"] == "adv-3"
    assert '"advisor_id": "adv-3"' in observed["prompt"]
    assert "already booked" in observed["prompt"]


def test_directory_selection_remains_bookable_after_ranked_matches_refresh(app):
    chat(app, "I want to meet this advisor.", lambda: None, selected_advisor_id="adv-3")
    app.search_advisors("retirement")  # overwrites the ranked shortlist without revoking the directory pick

    booking = app.book_meeting("adv-3", "Jamie", "Friday at 10:00")

    assert booking["advisor_id"] == "adv-3"
    assert booking["advisor_name"] == "Advisor 3"


def test_unknown_directory_selection_is_rejected_before_agent_runs(app):
    app.Agent = Mock(side_effect=AssertionError("Agent must not run"))
    response = app.lambda_handler({"rawPath": "/chat", "body": json.dumps({
        "message": "I want to meet this advisor.", "session_id": "session-123", "selected_advisor_id": "adv-999",
    })}, None)
    assert response["statusCode"] == 404
    app.Agent.assert_not_called()
