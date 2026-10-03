# ARCH-001: Validate backend boundaries against the technical specification

**Status:** Backend implementation complete; deployment and production validation remain open  
**Area:** Backend Lambda  
**Source of truth:** `docs/technical-specification.md` (with `memory/architecture.md` documenting deliberate deferrals)

## Scope

Align `backend/lambda_function.py` and its seed data with the target backend behavior in the technical specification. Separate source-level implementation from requirements that need deployed or human-review evidence.

## Findings

The backend now implements the technical specification's synchronous contract: `POST /session` creates a DynamoDB session without an LLM call; `POST /session/{id}/message` loads bounded history/preferences, invokes Bedrock Converse with the pinned guardrail and a structured response schema, merges validated preference updates, conditionally increments the session version, ranks `AdvisorProfiles` deterministically, and returns localized glossary terms and UTF-16-compatible term offsets. Sessions use the spec's `PK=SESSION#<uuid>`, `SK=META`, `ttl`, status, preferred language, history, preferences, matched ids, version, and complianceFlags fields. `seed/seed.py` now writes fictional profile records and localized demo glossary rows to their DynamoDB tables.

The Lambda no longer exposes legacy `/chat` or `/speak`, no longer uses Strands/S3 sessions or an S3 advisor catalog, and no longer generates Titan embeddings for matching. `/catalog` reads active accepting DynamoDB profiles. The existing owner-key `/metrics` and `/bookings` views remain for the demo dashboard.

The following technical-specification requirements remain incomplete or unvalidated:

- The spec's separate `session-init`, `intake-orchestrator`, inline matcher, and `glossary-admin` function boundaries are still one Lambda with multiple routes. Admin profile/glossary CRUD is not implemented; `/metrics` and `/bookings` still use the demo owner token.
- Slot extraction is model-generated structured data. The backend validates field types/enums and merges updates, but has no independent deterministic extractor or formal evaluation of extraction accuracy. `accessibilityNeeds` is collected but does not affect advisor filtering. Asset-band categories are an application convention and need product/compliance review.
- Seed glossary definitions/translations are demo text marked `demo-seed-unreviewed`; they are not compliance-reviewed translations. The deterministic tagger is implemented, but screen reader/tooltip rendering and locale quality still require frontend and human review.
- `complianceFlags` is created in session records, but guardrail block/intervention events are not yet written there. The secondary output check is a limited English regex. Formal guardrail evaluation, applied-guardrail operational alarms, and human audit workflow remain outstanding.
- The source alone cannot establish that the API Gateway/Lambda/CloudFormation stack deployed, that the runtime model supports forced tool choice, or that the integration completes inside the configured synchronous budget. IAM, encrypted log retention, and API CORS are represented in infrastructure code but need deployed-state verification. No live AWS check was run.
- The owner token remains demo access control. It does not provide advisor identity, tenant isolation, or production authorization. WCAG and multilingual browser testing remain outside backend evidence.

## Fix made

Expanded `SENSITIVE_INPUT` to reject account-like digit sequences separated by spaces or hyphens as well as contiguous digit strings. Added DynamoDB session init/message handling, optimistic version updates, bounded history and preferences, structured Converse responses with a published guardrail version, deterministic availability/language/mode/geography/asset/specialty filtering and ranking, cached longest-match glossary tags with UTF-16 offsets, localized glossary bundles, DynamoDB profile/glossary seeding, and CORS response headers. Retired the legacy S3/Strands/Titan/Polly endpoints and paths.

## Validation evidence

- Static inspection of `backend/lambda_function.py`, `backend/test_lambda_function.py`, `seed/seed.py`, `docs/technical-specification.md`, `memory/architecture.md`, and the current template declarations.
- `git diff --check` completed without whitespace errors; Git printed line-ending conversion warnings for modified files.
- Parent-run validation: `& .\.venv\Scripts\python.exe -m unittest backend.test_lambda_function` passed all 8 backend tests, including two multi-turn scripted Bedrock conversation simulations and seeded advisor/glossary schema checks. These use a deterministic Converse stub; they validate orchestration and matching, not real model extraction quality.
- Current run (2026-10-02): `.venv\Scripts\python.exe -m unittest backend.test_lambda_function -v` passed all 8 tests. The first sandboxed invocation could not start the venv interpreter because its base Python installation is outside the workspace; the same command passed when rerun with approved elevated access.
- No live AWS checks were run. Deployment is not established by repository code; `memory/architecture.md` records that the earlier deployment preflight lacked usable AWS credentials.

## Follow-up work

The backend implementation scope is complete. Before production use, separate the remaining work into tickets: (1) split the Lambda into the specified function boundaries and add protected glossary/profile administration; (2) evaluate structured preference extraction and review asset-band semantics; (3) obtain compliance review of localized glossary content and validate accessible rendering; and (4) implement guardrail intervention audit flags and production identity/tenant controls. Then run deployed smoke tests and record the actual stack, API URL, guardrail version, and review evidence. Do not treat source implementation alone as proof of production readiness.
