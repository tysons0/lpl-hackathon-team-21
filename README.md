# Advisor Match

Advisor Match is a demo wealth-advisor discovery and preparation experience. It uses a vanilla JavaScript/Vite frontend, API Gateway REST, a Python 3.12 Lambda using Amazon Bedrock Converse, DynamoDB, private S3, and CloudFront. Demo advisor profiles are fictional. Meeting requests and advisor briefings are previews, not scheduled appointments or delivered messages.

## Local Development

```powershell
npm.cmd --prefix web ci
npm.cmd --prefix web run dev
npm.cmd --prefix web test
npm.cmd --prefix web run build
```

Without `web/public/config.json`, the site runs with local fictional sample responses. To use an existing deployment, put public values only in `web/public/config.json`:

```json
{"apiUrl":"https://example.execute-api.us-east-1.amazonaws.com/prod","region":"us-east-1"}
```

Never put AWS credentials, `ADMIN_TOKEN`, or any private key in frontend configuration.

## Deploy

The supported deploy script is `deploy.sh`, intended for AWS CloudShell. It builds the frontend, packages the Python Lambda, deploys `template.yaml`, seeds fictional demo advisors and glossary rows when needed, publishes to S3/CloudFront, and smoke-tests session creation and chat.

```bash
unzip -o -q advisor-match.zip
cd advisor-match
AWS_REGION=us-east-1 bash deploy.sh
```

CloudShell uses the signed-in AWS console identity; do not paste credentials into the repo or chat. The identity needs permissions for the CloudFormation resources and access to an enabled Claude inference profile. Optional environment variables: `MODEL_ID`, `EXISTING_ROLE_ARN`, `ADMIN_TOKEN`, `RESERVED_CONCURRENCY`, and `RESEED=1`. The owner token enables the private demo dashboard; keep it private. Review `template.yaml` and existing stack resources before deployment. Re-running the script updates stack-owned resources; it does not discover or adopt an unrelated pre-existing backend automatically.

## API

- `GET /health`
- `POST /session`, `POST /session/{id}/message`
- `GET /catalog`
- `POST /metrics`, `POST /bookings`

Session messages use `preferredLanguage` and optimistic `version` fields. Voice input and read-aloud stay in the browser. The private demo dashboard uses an owner token for `/metrics` and `/bookings`; this is not production advisor authentication. The backend rejects sensitive identifiers and applies a published Bedrock Guardrail, but these demo measures are not a regulatory certification.

## Project Map

- `web/src/`: investor intake, advisor comparison, dashboard, dictation, styles.
- `backend/lambda_function.py`: request validation, session handling, matching, demo tools, admin views.
- `template.yaml`: API Gateway, Lambda, Bedrock, DynamoDB, logging, and static hosting resources.
- `seed/seed.py`: fictional advisor data generation.
- `memory/architecture.md`: current architecture decisions and deferred target work.
- `tickets/`: architecture alignment findings, implementation assignments, and validation evidence.
- `skills/`: local product, domain, accessibility, and integration guidance.
