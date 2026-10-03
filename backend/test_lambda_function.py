"""Offline contract tests for the synchronous intake API."""
import copy
import importlib.util
import json
from pathlib import Path
import time
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("tested_lambda", Path(__file__).with_name("lambda_function.py"))
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
seed_spec = importlib.util.spec_from_file_location("tested_seed", Path(__file__).parents[1] / "seed" / "seed.py")
seed_data = importlib.util.module_from_spec(seed_spec)
seed_spec.loader.exec_module(seed_data)


class MemoryTable:
    def __init__(self, items=()):
        self.items = [copy.deepcopy(item) for item in items]

    def put_item(self, Item, **kwargs):
        self.items.append(copy.deepcopy(Item))

    def get_item(self, Key, **kwargs):
        return {"Item": next((copy.deepcopy(item) for item in self.items if all(item.get(k) == v for k, v in Key.items())), None)}

    def update_item(self, Key, ExpressionAttributeValues, ExpressionAttributeNames, **kwargs):
        item = next((item for item in self.items if all(item.get(k) == v for k, v in Key.items())), None)
        if not item or item.get("version") != ExpressionAttributeValues[":expectedVersion"] or item.get("ttl", 0) <= ExpressionAttributeValues[":now"]:
            error = Exception("conditional update failed")
            error.response = {"Error": {"Code": "ConditionalCheckFailedException"}}
            raise error
        names = ExpressionAttributeNames
        for name, value in ExpressionAttributeValues.items():
            if name in {":history", ":preferences", ":language", ":matches", ":status", ":nextVersion"}:
                attribute = {
                    ":history": "conversationHistory", ":preferences": "collectedPreferences",
                    ":language": "preferredLanguage", ":matches": "matchedAdvisorIds",
                    ":status": "status", ":nextVersion": "version",
                }[name]
                item[attribute] = copy.deepcopy(value)

    def query(self, IndexName=None, KeyConditionExpression=None, **kwargs):
        if IndexName == "AvailabilityIndex":
            results = [item for item in self.items if item.get("availabilityStatus") == "ACCEPTING"]
        else:
            results = self.items
        return {"Items": copy.deepcopy(results)}

    def scan(self, **kwargs):
        return {"Items": copy.deepcopy(self.items)}


def advisor(**updates):
    return {
        "PK": "ADVISOR#a1", "SK": "PROFILE", "advisorId": "a1", "name": "Demo Advisor",
        "city": "Austin, TX", "specialties": ["retirement planning", "first-time home buyers"],
        "languages": ["English"], "communicationModes": ["virtual", "in-person"],
        "credentials": [], "minInvestableAssets": 0,
        "geography": {"state": "TX", "servesRemote": True}, "availabilityStatus": "ACCEPTING",
        "active": True, **updates,
    }


def model_turn(text, updates):
    """Create the structured tool response the Bedrock model would return."""
    return {"output": {"message": {"content": [{"toolUse": {"input": {
        "text": text,
        "preferenceUpdates": updates,
    }}}]}}}


class BackendContractTests(unittest.TestCase):
    def setUp(self):
        app.SESSIONS = MemoryTable()
        app.PROFILES = MemoryTable([advisor()])
        app.GLOSSARY = MemoryTable([
            {"PK": "TERM#fee", "SK": "LANG#en", "displayTerm": "fee", "definition": "Money charged for a service.", "category": "Costs"},
            {"PK": "TERM#fee", "SK": "LANG#es", "displayTerm": "honorario", "definition": "Dinero cobrado por un servicio.", "category": "Costos"},
        ])
        app.FUNNEL = MemoryTable()
        app.BOOKINGS = MemoryTable()
        app._GLOSSARY_TERMS = None
        app.BR = Mock()
        app.BR.converse.return_value = {"output": {"message": {"content": [{"toolUse": {"input": {
            "text": "😀 Ask about the fee.",
            "preferenceUpdates": {
                "servicesNeeded": ["retirement planning"],
                "investableAssetsBand": "under_25k",
                "communicationMode": "virtual",
                "geography": {"state": "TX", "servesRemote": True},
            },
        }}}]}}}
        self.env = patch.dict("os.environ", {
            "MODEL_ID": "test-model", "GUARDRAIL_ID": "test-guardrail", "GUARDRAIL_VERSION": "1",
            "ADMIN_TOKEN": "owner-key",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def call(self, path, body=None, method="POST", resource=None, path_parameters=None, headers=None):
        event = {
            "path": path,
            "resource": resource or path,
            "httpMethod": method,
            "pathParameters": path_parameters or {},
            "body": json.dumps(body or {}),
            "headers": headers or {},
        }
        response = app.lambda_handler(event, None)
        return response["statusCode"], json.loads(response["body"]), response["headers"]

    def start(self):
        status, payload, headers = self.call("/prod/session", {"preferredLanguage": "en-US"}, resource="/session")
        self.assertEqual(status, 201, payload)
        self.assertEqual(payload["preferredLanguage"], "en")
        self.assertIn("Access-Control-Allow-Origin", headers)
        return payload

    def send(self, session, body):
        return self.call(
            "/prod/session/" + session["sessionId"] + "/message",
            body,
            resource="/session/{id}/message",
            path_parameters={"id": session["sessionId"]},
        )

    def test_session_contract_persists_preferences_matches_and_glossary_offsets(self):
        session = self.start()
        status, payload, _ = self.send(session, {"message": "I want help planning retirement", "version": 0})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["text"], "😀 Ask about the fee.")
        self.assertEqual(payload["glossaryTags"], [{"term": "fee", "start": 17, "end": 20, "termId": "TERM#fee"}])
        self.assertEqual(payload["glossaryTerms"][0]["termId"], "TERM#fee")
        self.assertEqual(payload["collectedPreferences"]["servicesNeeded"], ["retirement planning"])
        self.assertEqual([item["advisorId"] for item in payload["matches"]], ["a1"])
        stored = app.SESSIONS.get_item(Key=app.session_key(session["sessionId"]))["Item"]
        self.assertEqual(stored["version"], 1)
        self.assertEqual(stored["conversationHistory"][-1]["role"], "assistant")

    def test_language_switch_returns_localized_glossary(self):
        session = self.start()
        status, payload, _ = self.send(session, {"message": "Please answer in Spanish", "preferredLanguage": "es", "version": 0})
        self.assertEqual(status, 200)
        self.assertEqual(payload["glossaryTerms"][0]["displayTerm"], "honorario")
        self.assertEqual(payload["collectedPreferences"]["languagePref"], "es")

    def test_stale_version_and_sensitive_input_are_rejected(self):
        session = self.start()
        self.assertEqual(self.send(session, {"message": "Help me plan", "version": 4})[0], 409)
        self.assertEqual(self.send(session, {"message": "My account is 1234 5678 9012"})[0], 422)
        app.BR.converse.assert_not_called()

    def test_expired_session_is_denied(self):
        session = self.start()
        item = app.SESSIONS.items[0]
        item["ttl"] = int(time.time()) - 1
        self.assertEqual(self.send(session, {"message": "continue"})[0], 410)

    def test_matching_hard_filters_inactive_wrong_language_and_city_profiles(self):
        prefs = {
            "servicesNeeded": ["retirement planning"], "investableAssetsBand": "under_25k",
            "communicationMode": "in-person", "languagePref": "en", "geography": {"city": "Boston", "state": "MA"},
        }
        app.PROFILES = MemoryTable([advisor(), advisor(advisorId="a2", city="Boston, MA", geography={"state": "MA", "servesRemote": False}, specialties=["first-time home buyers"])])
        self.assertEqual(app.match_advisors(prefs), [])

    def test_seed_builds_queryable_advisor_and_localized_glossary_records(self):
        profiles = seed_data.advisor_profiles()
        terms = seed_data.glossary_items()
        self.assertEqual(len(profiles), 42)
        self.assertEqual(len({(row["PK"], row["SK"]) for row in profiles}), len(profiles))
        for profile in profiles:
            self.assertTrue(profile["PK"].startswith("ADVISOR#"))
            self.assertEqual(profile["SK"], "PROFILE")
            self.assertEqual(profile["geographyState"], profile["geography"]["state"])
            self.assertEqual(profile["availabilityAdvisor"], f"{profile['availabilityStatus']}#{profile['advisorId']}")
            self.assertIn(profile["availabilityStatus"], {"ACCEPTING", "WAITLIST"})
        self.assertEqual(len(terms), 24)
        self.assertEqual({row["SK"] for row in terms}, {"LANG#en", "LANG#es", "LANG#zh"})
        self.assertTrue(all(row["PK"].startswith("TERM#") and row["definition"] for row in terms))

        app.PROFILES = MemoryTable(profiles)
        seeded_match = app.match_advisors({
            "servicesNeeded": ["first-time home buyers"],
            "investableAssetsBand": "under_25k",
            "communicationMode": "in-person",
            "languagePref": "es",
            "geography": {"city": "Miami", "state": "FL"},
        })
        self.assertIn("adv-901", [item["advisorId"] for item in seeded_match])

    def test_simulated_retirement_conversation_accumulates_slots_before_matching(self):
        """Simulate a user who supplies the goal, location/mode, and assets over three turns."""
        app.PROFILES = MemoryTable([
            advisor(
                PK="ADVISOR#boston-retirement", advisorId="boston-retirement",
                name="Boston Retirement Advisor", city="Boston, MA",
                specialties=["retirement planning"], languages=["English"],
                communicationModes=["in-person"], minInvestableAssets=100000,
                geography={"state": "MA", "servesRemote": False},
            ),
            advisor(
                PK="ADVISOR#remote-retirement", advisorId="remote-retirement",
                name="Remote Retirement Advisor", city="Austin, TX",
                specialties=["retirement planning"], languages=["English"],
                communicationModes=["virtual"], minInvestableAssets=0,
                geography={"state": "TX", "servesRemote": True},
            ),
            advisor(
                PK="ADVISOR#waitlist-retirement", advisorId="waitlist-retirement",
                name="Waitlist Advisor", city="Boston, MA",
                specialties=["retirement planning"], languages=["English"],
                communicationModes=["in-person"], minInvestableAssets=0,
                geography={"state": "MA", "servesRemote": False},
                availabilityStatus="WAITLIST",
            ),
            advisor(
                PK="ADVISOR#high-minimum", advisorId="high-minimum",
                name="High Minimum Advisor", city="Boston, MA",
                specialties=["retirement planning"], languages=["English"],
                communicationModes=["in-person"], minInvestableAssets=500001,
                geography={"state": "MA", "servesRemote": False},
            ),
        ])
        app.BR.converse.side_effect = [
            model_turn("Retirement planning is a common goal. What kind of meeting do you prefer?", {
                "servicesNeeded": ["retirement planning"],
            }),
            model_turn("I can look for someone near Boston. What range feels comfortable to share?", {
                "communicationMode": "in-person",
                "geography": {"city": "Boston", "state": "MA"},
            }),
            model_turn("Thanks. Here are advisors to compare.", {
                "investableAssetsBand": "100k_500k",
            }),
        ]

        session = self.start()
        turns = [
            ("I am 60 and want help planning for retirement.", 0),
            ("I prefer an in-person meeting near Boston.", 1),
            ("I have about $150,000 set aside.", 2),
        ]
        replies = []
        for message, version in turns:
            status, reply, _ = self.send(session, {"message": message, "version": version})
            self.assertEqual(status, 200, reply)
            replies.append(reply)

        self.assertNotIn("matches", replies[0], "Do not match before meeting, geography, and asset preferences are known")
        self.assertNotIn("matches", replies[1], "Do not match before the asset preference is known")
        self.assertEqual([reply["version"] for reply in replies], [1, 2, 3])
        self.assertEqual(replies[2]["collectedPreferences"]["servicesNeeded"], ["retirement planning"])
        self.assertEqual(replies[2]["collectedPreferences"]["communicationMode"], "in-person")
        self.assertEqual(replies[2]["collectedPreferences"]["geography"], {"city": "Boston", "state": "MA"})
        self.assertEqual(replies[2]["collectedPreferences"]["investableAssetsBand"], "100k_500k")
        self.assertEqual([item["advisorId"] for item in replies[2]["matches"]], ["boston-retirement"])

        calls = app.BR.converse.call_args_list
        self.assertEqual([message["role"] for message in calls[2].kwargs["messages"]], ["user", "assistant", "user", "assistant", "user"])
        for call in calls:
            self.assertEqual(call.kwargs["guardrailConfig"]["guardrailVersion"], "1")

    def test_simulated_spanish_virtual_conversation_honors_prefer_not_to_say(self):
        """A second simulated user asks for Spanish/virtual help and declines to share assets."""
        app.PROFILES = MemoryTable([
            advisor(
                PK="ADVISOR#spanish-virtual", advisorId="spanish-virtual",
                name="Spanish Virtual Advisor", city="Miami, FL",
                specialties=["first-time home buyers"], languages=["Spanish"],
                communicationModes=["virtual"], minInvestableAssets=0,
                geography={"state": "FL", "servesRemote": True},
            ),
            advisor(
                PK="ADVISOR#english-virtual", advisorId="english-virtual",
                name="English Virtual Advisor", city="Miami, FL",
                specialties=["first-time home buyers"], languages=["English"],
                communicationModes=["virtual"], minInvestableAssets=0,
                geography={"state": "FL", "servesRemote": True},
            ),
            advisor(
                PK="ADVISOR#spanish-office", advisorId="spanish-office",
                name="Spanish Office Advisor", city="Miami, FL",
                specialties=["first-time home buyers"], languages=["Spanish"],
                communicationModes=["in-person"], minInvestableAssets=0,
                geography={"state": "FL", "servesRemote": False},
            ),
        ])
        app.BR.converse.side_effect = [
            model_turn("Puedo ayudarle a comparar asesores. ¿Prefiere una reunión virtual o en persona?", {
                "servicesNeeded": ["first-time home buyers"],
                "languagePref": "es",
                "geography": {"state": "FL"},
            }),
            model_turn("Entiendo. ¿Qué rango de ahorros quiere compartir?", {
                "communicationMode": "virtual",
            }),
            model_turn("Está bien; no tiene que compartirlo.", {
                "investableAssetsBand": "prefer_not_to_say",
            }),
        ]

        session = self.start()
        session["preferredLanguage"] = "es"
        turns = [
            ("Busco ayuda para comprar mi primera casa.", 0),
            ("Prefiero reuniones virtuales.", 1),
            ("Prefiero no compartir mis ahorros.", 2),
        ]
        replies = []
        for message, version in turns:
            status, reply, _ = self.send(session, {
                "message": message, "preferredLanguage": "es", "version": version,
            })
            self.assertEqual(status, 200, reply)
            replies.append(reply)

        self.assertNotIn("matches", replies[0])
        self.assertNotIn("matches", replies[1])
        self.assertEqual(replies[2]["collectedPreferences"]["languagePref"], "es")
        self.assertEqual(replies[2]["collectedPreferences"]["investableAssetsBand"], "prefer_not_to_say")
        self.assertEqual([item["advisorId"] for item in replies[2]["matches"]], ["spanish-virtual"])


if __name__ == "__main__":
    unittest.main()
