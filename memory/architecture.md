# Advisor Match Architecture Decisions

Updated: 2026-10-02. This note describes the repository implementation and intended deployment, not proof that AWS resources are live.

## Sources and Interpretation

[Technical specification](../docs/technical-specification.md) is the target architecture. The current contract is implemented by [the Lambda handler](../backend/lambda_function.py), [CloudFormation](../template.yaml), [the frontend](../web/src/main.js), and [the seed](../seed/seed.py). The domain skills in `skills/` provide intake, explanation, UI, serverless, and operational guidance. Their sample frameworks and schemas do not override the existing application or authorize unrelated services.

## Current and Target

| Concern | Current implementation | Target or deferred work |
| --- | --- | --- |
| Web hosting | Vite static assets in a private S3 bucket, CloudFront with Origin Access Control and HTTPS. | Keep this hosting shape. |
| API and agent | API Gateway REST session routes plus a Lambda proxy route; Python 3.12 Lambda uses Bedrock Converse for the active session UI. | API Gateway WebSocket, split session/orchestrator/admin responsibilities, progressive streaming. A separate legacy `/chat` branch is not used by the UI and must not be treated as a working contract. |
| Conversation state | The active UI stores bounded history, preferences, and TTL in DynamoDB with optimistic version checks. | Retention-aware session partitioning and independently auditable access. |
| Advisor data and ranking | Fictional advisor and glossary rows in DynamoDB; hard language, meeting mode, city/state, availability, assets, and specialty filters; deterministic ordering and grounded reasons. | Auditable preference ranking. AHP, knowledge graphs, vector search, and OpenSearch are not implemented. |
| Demo handoff and metrics | DynamoDB meeting-request and funnel tables; expiry filtering; owner-key protection on private views. | Authenticated advisor identity, tenant boundaries, real availability and CRM/calendar integration. |
| Voice | Browser Web Speech input and speechSynthesis read-aloud. Backend also contains a Polly route not used by the current interface. | Test browser support across target devices; keep typed input available. |
| Glossary | Localized DynamoDB glossary rows are returned with deterministic term tags and rendered as accessible tooltips. | Content review and language-specific quality evaluation. |
| Guardrails | Published Bedrock Guardrail, prompt boundaries, input validation, constrained output parsing and secondary checks; metadata-only application error logs. | Formal evaluation, pinned-version operational change process, compliance review and enterprise audit. |

## Decisions and Rationale

1. The current MVP uses API Gateway REST and one Python Lambda for both session creation and orchestration. The technical specification calls for a separate `session-init` Lambda and an internal `glossary-admin` surface; those boundaries remain open implementation work. Keep the synchronous REST flow until streaming is required.
2. Keep private S3 plus CloudFront for static hosting and DynamoDB for the small fictional profiles, glossary, sessions, requests, and funnel data. A search cluster/vector database adds little value at this scale.
3. Session turns use conditional DynamoDB version updates and a 24-hour TTL. The owner token protects private demo views but is not production advisor authentication. No Cognito identity or admin authorizer is currently provisioned.
4. Preserve explicit user preferences when matching. Specialty overlap and match reasons do not establish suitability or expected return. Allow empty results and never fill gaps with invented fee or registration claims.
5. Store only demo meeting requests and briefings. No calendar event, email delivery, ClientWorks connection, or CRM synchronization exists. First name/nickname is optional; reject contact details and sensitive identifiers. Public pages identify the profiles as fictional.
6. Enforce logical expiry in application code as well as storage cleanup. DynamoDB TTL cleanup is asynchronous and does not mean immediate physical deletion at the expiry timestamp. Changes to retention must cover sessions, requests, metrics, logs, and any future backups together.
7. Use the existing CloudFormation template and the CloudShell-oriented `deploy.sh` workflow. The script must pass model resource ARNs required by the constrained Bedrock policy, build the frontend, produce public runtime config from stack outputs, and verify the deployed app before reporting success. Frontend-only publication is appropriate only when the current stack already supports the frontend contract.

## Deployment and Remaining Work

During the 2026-10-02 implementation session, AWS deployment preflight was blocked by missing usable local AWS credentials. No live deployment is established by that result. Re-run read-only identity and service-access checks after an authorized AWS profile is available; record the actual stack, region, URL, and successful smoke results when deployment completes. Do not store secret credentials or owner keys here.

Before using real prospect data, replace the demo owner key with authenticated, authorized advisor access; decide production retention and deletion behavior; validate language-specific safety and accessibility; and add operational abuse/cost controls suited to a public service. The technical specification's compliance and WCAG targets remain verification work, not certifications earned by implementing a template.
