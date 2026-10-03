# ARCH-003: AWS infrastructure and security alignment

**Status:** Infrastructure implemented in template; deployment and runtime validation remain open  
**Owner:** infrastructure alignment agent  
**Baseline:** [`docs/technical-specification.md`](../docs/technical-specification.md)

## Scope reviewed

- [`template.yaml`](../template.yaml): API endpoint, DynamoDB, Cognito, Bedrock guardrail and IAM, logging, and retention configuration.
- [`deploy.sh`](../deploy.sh) and [`teardown.sh`](../teardown.sh): resources the deployment workflow actually creates and removes.
- [`backend/lambda_function.py`](../backend/lambda_function.py) was consulted only to confirm which infrastructure resources the current stack uses.

No live AWS stack or CloudFormation deployment was inspected. This is a repository-level comparison, not evidence of deployed configuration or runtime enforcement.

## Findings against the specification

| Requirement | Repository evidence | Result |
|---|---|---|
| API Gateway REST or WebSocket endpoint | Template now defines API Gateway REST `POST /session`, `POST /session/{id}/message`, `GET /health`, and owner-token-protected `POST /metrics` and `/bookings`, with Lambda proxy integrations, CORS preflight, and a `/prod` stage capped at 25 requests/sec and 50 burst. The unauthenticated public Lambda Function URL and invoke permissions were removed to avoid bypassing API Gateway. Lambda timeout is 28 seconds. | **Implemented in template.** Backend agent confirmed support for REST proxy events, `/prod` stage, `pathParameters.id`, and CORS headers. Deployment smoke workflow initializes a session and posts a message through the new routes. |
| Three separate domain tables | Template defines `AdvisorIntakeSessionsTable` (`PK`,`SK`, TTL `ttl`), `AdvisorProfilesTable` (`PK`,`SK`, `AvailabilityIndex`, `GeoIndex`), and `GlossaryTermsTable` (`PK`,`SK`), with environment variables `SESSIONS_TABLE`, `ADVISOR_PROFILES_TABLE`, and `GLOSSARY_TABLE`. Existing booking/funnel tables remain for demo APIs. | **Implemented in template and seed contract.** DynamoDB requires top-level scalar index key fields, so GeoIndex uses `geographyState` derived from `geography.state` and `availabilityAdvisor` containing `availabilityStatus#advisorId`; `seed/seed.py` now writes both. |
| Cognito auth boundary | No Cognito resources are provisioned. Session IDs are anonymous capabilities stored by the browser and persisted in the session table. | **Decision remains open.** This preserves anonymous intake but does not establish the spec's optional Cognito Identity Pool tracking or any authenticated LPL user/admin identity. No User Pool or API authorizer exists. |
| Bedrock guardrail on model calls | Template creates a DENY investment-advice topic, blocks SSN/bank/card/passport identifiers, anonymizes email/phone/address, creates a published `AWS::Bedrock::GuardrailVersion`, and passes its ID/version to Lambda. Generated-role invoke permissions require the pinned guardrail identifier. | **Implemented in generated role/template.** Runtime proof that every Converse call carries the pinned guardrail is unavailable here. `ExistingLambdaRoleArn` bypasses generated-role policies and must be independently audited. |
| Guardrail streaming mode | Current Lambda uses synchronous JSON chat through API Gateway; no streaming API or ConverseStream route is provisioned. | **Not applicable to current stack; target unimplemented.** If streaming is added, configure and verify synchronous guardrail processing before exposing tokens. |
| Encrypted logs | Template now creates a rotating KMS key and encrypts the Lambda log group and CloudTrail guardrail audit log group. The audit group retains events for 90 days in this demo configuration. | **Partial.** Bedrock model invocation logging is still not configured. No compliance-approved retention duration is supplied, so 90 days is not a FINRA/legal compliance claim. |
| Guardrail change alarms | Template now routes CloudTrail `CreateGuardrail`, `UpdateGuardrail`, `CreateGuardrailVersion`, and `DeleteGuardrail` events into the encrypted audit log group and creates a metric filter and CloudWatch alarm. | **Implemented in template; unvalidated live.** An active regional CloudTrail management event stream and permissions must exist for the rule to receive events. |
| TTL and PII retention | Session, booking, and funnel DynamoDB tables enable numeric `ttl`; session TTL is set to 24 hours by the backend. | **Partial.** DynamoDB TTL cleanup is asynchronous and does not prove prompt physical erasure. Booking/funnel records also carry session-linked data. Backup retention and production/compliance retention are unspecified. |

## Changes made

- Added API Gateway REST routes, proxy integrations, CORS preflight methods, stage throttling, and invoke permission. Removed the direct public Function URL so callers use the throttled API boundary.
- Added the three architecture tables, TTL on sessions, profile indexes, environment variables, and scoped Lambda table permissions. Existing bookings/funnel tables remain for current demo functionality.
- Added ANONYMIZE guardrail filters for email, phone, and address; encrypted Lambda/audit log groups with a rotating KMS key; and a CloudTrail guardrail-change event target, metric filter, and alarm.
- Removed the unused advisor/session S3 bucket, Lambda S3/Titan/Polly permissions, and unused guest Transcribe/Cognito resources after the app moved to DynamoDB and browser speech. The deploy workflow now seeds the DynamoDB profile and glossary tables.
- Set Lambda timeout to 28 seconds to fit the synchronous API Gateway budget.

## Validation evidence

- Read the CloudFormation template and deployment/teardown scripts and traced the backend's expected routes/table usage; coordinated table names and event contract with the backend agent. Updated deployment smoke checks to exercise API Gateway health, session creation, and a session message.
- Static inspection confirms the template defines the REST routes, stage throttles, DDB key/index/TTL attributes, scoped IAM table permissions, guardrail filters/version, KMS-encrypted log groups, and CloudTrail change alarm described above.
- A `bash -n deploy.sh` syntax check was attempted but Windows denied starting Bash (`E_ACCESSDENIED`). `cfn-lint`, CloudFormation `validate-template`, IAM simulation, deployment, endpoint CORS tests, Bedrock invocation tests, Cognito authorization tests, TTL observation, and alarm delivery were not available/performed. No live deployment is claimed.

## Required follow-up

1. Add a separately authorized internal/admin surface for glossary/profile CRUD. Decide whether Cognito Identity Pool tracking is needed and define the privileged admin identity boundary.
2. Configure Bedrock model invocation logging to a KMS-encrypted destination with trace disabled, explicitly capture guardrail actions, and choose retention with compliance/legal. The current CloudTrail audit logs guardrail configuration changes but not invocation actions.
3. Review the `ExistingLambdaRoleArn` path against the generated role's least-privilege guardrail/table policies.
4. Validate with CloudFormation validation, IAM simulation, deployed API/CORS/guardrail smoke tests, and observed retention/logging/alarm behavior. Record stack/region and evidence; no live deployment is claimed by this ticket.
