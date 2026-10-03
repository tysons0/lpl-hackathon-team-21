# Advisor Match: AWS agentic stack

Strands agent on Amazon Bedrock (Claude + Guardrails), Lambda Function URL, S3 + CloudFront web app,
DynamoDB, Cognito guest credentials + Transcribe streaming (voice), Polly (read-aloud).

## Deploy (AWS CloudShell, us-east-1)
1. Open CloudShell in the AWS console (us-east-1). Actions > Upload file > advisor-match.zip
2. Run:
   unzip -o -q advisor-match.zip && cd advisor-match && bash deploy.sh
3. Open the Web app URL printed at the end.

Re-run `bash deploy.sh` after any change. `RESEED=1 bash deploy.sh` regenerates demo advisors
(run it once after pulling this change so match cards show fee disclosures).
Optional: `ALERT_EMAIL=you@example.com bash deploy.sh` turns on alarm emails and a monthly cost budget.
`bash teardown.sh` deletes everything.

## Edit
- Agent prompt and tools: backend/lambda_function.py
- Ranking, PII screen, match reasons: backend/matching.py (tests: `cd backend && python -m pytest -q tests`)
- Booking -> CRM sync consumer: backend/crm_sync.py
- Demo advisors: seed/seed.py (all fictional)
- Advisor pictures: illustrated portraits drawn in web/src/avatar.js (look picked from advisor_id). To use licensed headshots, add
  web/public/advisors/<advisor_id>.jpg, rebuild the web app, then `RESEED=1 bash deploy.sh`
- Backend tests: `pip install pydantic pytest boto3 strands-agents && cd backend && python -m pytest -q tests`
  (tests/test_booking_listed_advisors.py books every advisor in seed/seed.py through the form and the chat)
- Web app browser tests: `cd web && npm install && npx playwright install chromium && npm test`
  (the backend is faked in each test, so no AWS account is needed)
- Web app: web/src (Vite). After edits: cd web && npm install && npm run build, then bash deploy.sh
- Infrastructure: template.yaml

## API (Function URL)
POST /chat {message, session_id?, simple?, selected_advisor_id?}; POST /speak {text, lang}; POST /metrics {range?, start_date?, end_date?}; POST /insights {funnel}; POST /bookings;
POST /advisors {language?, meeting_type?, text?} (full advisor list for the "All advisors" tab); GET /health

The Business dashboard uses the Lambda-backed `/insights` route for prioritized actions and exports selected reports as CSV. CSV reports can be imported into Amazon QuickSight for richer visualization. Embedded QuickSight dashboards require an account-specific dashboard, permissions, and embed identity, so this prototype keeps visualization in the app and provides a QuickSight-ready export.
POST /chat {message, session_id?, simple?, selected_advisor_id?}; POST /speak {text, lang}; POST /metrics; POST /bookings;
POST /advisors {language?, meeting_type?, text?} (full advisor list for the "All advisors" tab);
POST /availability {advisor_id, date} (open times); POST /bookings/update {booking_id, session_id, date?, time?, purpose?}
(save changes to a booking); POST /bookings/cancel {booking_id, session_id} (cancel and free the time);
in chat, the agent can also move or cancel a meeting ("move it to Thursday at 3pm", "cancel my meeting"); /chat also takes booking {advisor_id, first_name, date, time, purpose} from the booking form; GET /health

## Architecture skills
The coding-agent skills are in `skills/` (from `test1`); how each one maps onto this app: docs/skills-applied.md.
AWS SDK credentials check: `pip install -r requirements.txt && python scripts/check_aws_sdk.py`

