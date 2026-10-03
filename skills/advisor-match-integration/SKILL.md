---
name: advisor-match-integration
description: Extend, verify, or deploy this repository's Advisor Match web app and AWS backend while preserving its API contract, demo boundaries, and architecture decisions. Use for integration work across the frontend, Strands Lambda, and CloudFormation stack.
---

# Advisor Match Integration

Read [the architecture decision log](../../memory/architecture.md) and the files relevant to the requested change. [The technical specification](../../docs/technical-specification.md) describes a target design; the executable implementation is the integration contract until a migration is explicitly part of the task.

## Implementation Map

- `web/`: Vite, vanilla JavaScript, CSS, and Lucide. Preserve the existing framework for incremental changes. React/Next.js examples in other skills describe optional patterns, not an automatic migration requirement.
- `backend/lambda_function.py`: Python 3.12 Lambda handler, Bedrock Converse session flow, DynamoDB matching, demo meeting requests, glossary, and administrative views. A separate older `/chat` branch is not used by the current UI; verify its dependencies before relying on it.
- `template.yaml`: CloudFormation stack for API Gateway REST, Lambda, S3/CloudFront, Bedrock Guardrail, DynamoDB, Cognito guest transcription, and CloudWatch. Preserve template ownership instead of creating an independent CDK stack for the same resources.
- `seed/seed.py`: writes fictional advisor profiles and localized glossary rows to DynamoDB. Changes to seed fields must remain compatible with the matcher and web renderer.
- `deploy.sh`: CloudShell build, packaging, deployment, seeding, and smoke-test workflow.

## API and State Contract

Inspect the handler and caller together before changing request or response fields. Current routes use JSON over API Gateway REST:

| Route | Contract |
| --- | --- |
| `GET /health` | Liveness response. |
| `POST /session` | `preferredLanguage`; returns `sessionId`, language, and glossary terms. |
| `POST /session/{id}/message` | `message`, `preferredLanguage`, `version`; returns `text`, glossary terms/tags, preference updates, next version, and optional matches. |
| `/chat` | Dormant legacy handler branch; not a frontend contract and not covered by the deployment smoke test. |
| `POST /speak` | `text`, `lang` to base64 MP3 `audio_b64`. |
| `GET /catalog` | Public fictional advisor directory, without embeddings or session secrets. |
| `POST /bookings` | Owner access through `X-Admin-Token`; demo requests only. |
| `POST /metrics` | Owner access through `X-Admin-Token`, optional `day`; aggregate demo funnel. |

The current browser flow retains the session ID and optimistic version in tab-scoped `sessionStorage`. Session records are stored in DynamoDB and version-checked conditionally. Handle expired/not-found sessions and `409` conflicts as recoverable states. Do not silently start a replacement session after a failed turn or retry a meeting request as a new side effect.

`web/public/config.json` and deployed `config.json` contain public configuration only: API URL and region. Never embed `ADMIN_TOKEN`, AWS credentials, or session tokens into built assets. Any Cognito guest role is not administrative authorization.

## Matching and Demo Boundaries

Apply the intake and explanation principles from [SKILL-01](../skill-01-behavioral-intake-crs.md) and [SKILL-04](../skill-04-explainable-match-generator.md) to the data the app actually has. Ask one short question at a time. Keep typed input available when voice fails.

Preserve explicit language, meeting type, city, and availability constraints. Return fewer matches or a clear empty state when necessary. The current rank is embedding similarity with deterministic tie-breaking; do not call it AHP, verified suitability, investment performance, or a guarantee. Show grounded reasons from returned advisor fields.

Profiles, capacity, and meeting requests are fictional. A saved request is not a confirmed appointment; a saved briefing is not a sent email or CRM sync. Do not invent credentials, fees, registration, fiduciary status, or SAM/MWP details from the explanatory templates. Link BrokerCheck as a general research resource without implying verification of a fictional profile. Label images as illustrative and keep source credits with the asset.

Reject sensitive identifiers before model calls or persistence. Preserve bounded inputs, session expiry, matching authorization before a demo request, and owner protection for prospect data. Avoid storing credentials in browser persistence. Log request IDs, action types, and error categories, not prompts, transcript bodies, access keys, or model traces containing personal information.

Require a published Bedrock Guardrail version for the agent and retain the additional input/output checks. These controls do not establish regulatory certification. Production changes need explicit identity, data-retention, guardrail, accessibility, and operational decisions appropriate to their scope.

## Verify and Deploy

From the repository root, use the project's Python environment and `npm.cmd`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
npm.cmd --prefix web run build
```

The repository deploy entry point is `deploy.sh` for AWS CloudShell. It selects and tests an inference profile, builds the web app, packages the Lambda, deploys `template.yaml`, seeds missing demo data, publishes the frontend, and smoke-tests session creation and chat. It does not adopt an unrelated existing stack. Reuse the CloudShell console identity; never ask for credentials in source files or chat.

Before an authorized deployment, verify caller identity and region, Claude inference-profile access, package/runtime compatibility, DynamoDB seed permissions, and the final template parameters. Publish frontend configuration from stack outputs, synchronize `web/dist`, invalidate CloudFront, and verify HTTPS plus the actual session-to-match flow. Distinguish local build success from AWS deployment success. If authentication or a service quota blocks deployment, record the precise failed check and finish local verification without claiming a live URL.

Cover changes according to their effects: contract tests for session authorization/concurrency and admin access; matching tests for hard filters, ordering, and empty results; browser checks for chat, directory, private views, locale switches, keyboard operation, contrast, text scaling, and mobile overflow. Voice needs real-browser checks because unit mocks cannot prove microphone or transcription behavior.

After cross-layer edits, synchronize UI fields, route validation, template environment variables and CORS, deploy configuration generation, tests, and architecture notes. Record any actual-versus-target change in `memory/architecture.md`; do not silently describe planned services as deployed.
