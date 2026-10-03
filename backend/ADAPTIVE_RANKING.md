# Ranking that adapts during chat

The chat agent records each session's expressed priorities for expertise, language,
meeting format, and availability. It interprets the user's words through the existing
Bedrock conversation and calls `record_preferences` with the updated criteria and
short supporting quotes. No extra model request is needed just to extract priorities.

This is preference adaptation within a session. It does not train a shared model or
use one person's conversation to change another person's ranking.

## Example conversation

| User message | Saved change | Result |
| --- | --- | --- |
| "Meeting someone soon matters most." | availability = top | Availability becomes the largest weight. |
| "Spanish is important too." | language = important; language slot = Spanish | Both priorities persist. |
| "Actually, I can wait." | availability = flexible | Availability's influence falls; language retains its priority. |
| "Virtual or in-person is fine." | meeting = flexible | Both meeting formats can enter the preferred candidate pool. |
| "I must speak Spanish." | language = required | Advisors without Spanish are excluded, even when fewer than three remain. |
| "Use the normal importance for language again." | remove language override | Language returns to its default relative importance. |

The model distinguishes preference strength from ordinary intake answers. Saying
"English" in response to a language question fills that slot; it does not by itself
make language the most important criterion. Negation and corrections are interpreted
in the user's language. Ambiguous statements should lead to a short clarification.

## Weight calculation and candidate selection

With no saved priorities, the existing default AHP matrix and ranking are retained.
When priorities exist:

1. Calculate the original AHP weights and rescale them so the largest default
   importance is 5. Unmentioned criteria keep their relative proportions.
2. Replace each stated criterion's importance with `flexible = 0.5`,
   `important = 6`, or `top = 9`. `required = 9` also enforces a language or
   meeting-format filter. `normal` removes the override.
3. Construct a reciprocal ratio matrix from those values and run the existing
   AHP calculation and consistency check. The resulting weights are positive and
   sum to one. These adaptive ratios express configured strengths, rather than
   requiring the user or model to supply a Saaty pairwise matrix.
4. Apply the weighted expertise, language, meeting, and availability scores.

Repeated statements replace the same stored entry, so repetition never compounds
a weight. Multiple priorities are allowed. A changed priority does not erase
unrelated preferences. When a user explicitly replaces their top priority, the
agent also resets the old one using evidence from that correction.

The existing preferred pool still favors matching language/meeting format and open
capacity. A `flexible` preference relaxes that criterion's preferred-pool filter.
The existing small-pool fallback remains available for ordinary preferences, but
always runs inside any `required` constraints. This can produce an empty list,
which clears old cards and lets the agent explain the constraint.

## Persistence and chat integration

- The existing DynamoDB intake item gains `ranking_preferences`, a map of
  `{criterion: {importance, evidence}}`, and `search_needs`, the last search context.
  Both use the same session key and existing TTL policy. No new table or IAM action
  is required. Weights are recomputed rather than saved as floating-point values.
- Ranking updates must name a supported criterion and level, and quote text present
  in the current, PII-screened user message. Quotes are limited to 300 characters.
  Invalid updates return a tool error without changing the saved profile. Quote
  validation checks provenance; semantic interpretation still depends on the model.
- `/chat` now uses the full `chat()` handler, which exposes `record_preferences`.
  Previously the route built a separate agent without that tool.
- Tools execute sequentially, and intake reads use `ConsistentRead=True`, so a
  search sees the preferences saved by the preceding tool call.
- After an initial search, a changed profile or intake fact automatically refreshes
  matches inside `record_preferences`, returning them to the agent before its reply.
  This also works after a search produced zero matches. Repeated identical priorities
  do not trigger another embedding request.
- Saved language and meeting slots take precedence over stale search arguments.
  Current goal, situation, worries, decision style, and communication cadence form
  the semantic search text, so a corrected goal replaces the old one.
- `/chat` returns `ranking.weights` and `ranking.priorities` when preferences are
  recorded or a search runs. Existing cards refresh from `matches` and their existing
  `drivers` explanation reflects the current weights. Raw evidence quotes and the
  private current-message field are not returned in this metadata.

## Current limits

`availability` measures the inventory's `open_slots` capacity indicator, not a
guarantee of a particular appointment date. Fees, credentials, distance, and exact
time preferences do not have scoring dimensions in this change. Goal and behavioral
facts inform semantic expertise matching; the four supported criteria remain the
only numeric ranking dimensions.

Local integration tests exercise the real route, persistence shape, and Strands tool
decorators with simulated model decisions and AWS resources. They do not measure
the live model's accuracy at interpreting natural-language priorities. Deployment
and a live Bedrock conversation are separate from these local checks.

## Local checks

```powershell
.\.venv\Scripts\python.exe -m pip install pytest strands-agents
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Relevant references: [Strands custom tools](https://strandsagents.com/docs/user-guide/sdk/tools/custom-tools/)
and [DynamoDB GetItem read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html).
