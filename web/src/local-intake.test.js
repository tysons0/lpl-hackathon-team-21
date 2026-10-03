import assert from "node:assert/strict";
import test from "node:test";
import { createLocalIntake, replyToLocalTurn } from "./local-intake.js";

test("a vague user gets follow-up questions instead of premature advisor matches", () => {
  const intake = createLocalIntake();
  const result = replyToLocalTurn("I could use a little help with things", "en", intake);

  assert.equal(result.ready, false);
  assert.equal(result.missing, "goal");
  assert.match(result.followup, /what would you like help/i);
  assert.equal("matches" in result, false);
});

test("multi-turn vague intake accumulates a goal, meeting mode, location, and broad asset choice", () => {
  const intake = createLocalIntake();
  const turns = [
    ["I am thinking about buying a home someday.", "mode"],
    ["Somewhere near Miami, and I would rather meet face to face.", "assets"],
    ["I would rather not share the savings details.", null],
  ];

  for (const [message, missing] of turns) {
    const result = replyToLocalTurn(message, "en", intake);
    if (missing) {
      assert.equal(result.ready, false);
      assert.equal(result.missing, missing);
      assert.equal("matches" in result, false);
    } else {
      assert.equal(result.ready, true);
      assert.deepEqual(intake.servicesNeeded, ["first-time home buyers"]);
      assert.equal(intake.communicationMode, "in-person");
      assert.deepEqual(intake.geography, { city: "Miami", state: "FL" });
      assert.equal(intake.investableAssetsBand, "prefer_not_to_say");
      assert.deepEqual(result.matches.map((advisor) => advisor.advisor_id), ["adv-901"]);
    }
  }
});

test("local matching respects the selected language and meeting preference", () => {
  const intake = createLocalIntake();
  const inputs = [
    "I am hoping to buy a home.",
    "Miami would be good.",
    "Virtual is easier for me.",
    "I prefer not to share.",
  ];
  let result;
  for (const message of inputs) result = replyToLocalTurn(message, "es", intake);

  assert.equal(result.ready, true);
  assert.deepEqual(result.matches.map((advisor) => advisor.advisor_id), ["adv-901"]);
  assert.ok(result.matches.every((advisor) => advisor.languages.includes("Spanish")));
  assert.ok(result.matches.every((advisor) => advisor.meeting_types.includes("virtual")));
});

test("a specific business request only returns an advisor whose location and meeting type fit", () => {
  const intake = createLocalIntake();
  const result = replyToLocalTurn(
    "I need help with my small business, in person near Boston, under 25k.",
    "en",
    intake,
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.matches.map((advisor) => advisor.advisor_id), ["adv-demo-04"]);
});
