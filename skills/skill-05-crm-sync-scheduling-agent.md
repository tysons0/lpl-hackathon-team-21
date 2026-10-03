# Coding Agent Skill Specification: SKILL-05

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

---

# SKILL-05: CRM Synchronization & Scheduling Agent (`crm_sync_scheduling_agent`)


### Role & Purpose
Act as an enterprise integration engineer generating an event-driven webhook and CRM integration module. This skill manages Stage 4 execution: capturing PII **only when the client schedules a meeting**, emitting AWS EventBridge events, and syncing the structured behavioral profile directly into advisor CRMs (ClientWorks, Redtail, Wealthbox).

### AWS & Python Architecture
- **Event Bus:** AWS EventBridge (Custom Bus: `com.wealth.matching.events`).
- **Secrets Management:** AWS Secrets Manager (OAuth2 tokens for ClientWorks/Redtail APIs).
- **HTTP Client:** Python `httpx` with `backoff` retry logic.

### Python EventBridge & Webhook Integration Pattern

```python
import json
import boto3
import httpx
import backoff

events_client = boto3.client('events')

class CRMSyncAgent:
    def __init__(self, secrets_namespace: str):
        self.secrets_client = boto3.client('secretsmanager')
        self.secrets_namespace = secrets_namespace

    def publish_booking_event(self, booking_payload: dict):
        return events_client.put_events(
            Entries=[{
                'Source': 'wealth.matching.engine',
                'DetailType': 'ClientConsultationBooked',
                'Detail': json.dumps(booking_payload),
                'EventBusName': 'com.wealth.matching.events'
            }]
        )

    @backoff.on_exception(backoff.expo, httpx.HTTPError, max_tries=4)
    async def sync_to_clientworks_api(self, api_url: str, auth_token: str, behavioral_brief: dict):
        headers = {'Authorization': f'Bearer {auth_token}', 'Content-Type': 'application/json'}
        async with httpx.AsyncClient() as client:
            res = await client.post(api_url, json=behavioral_brief, headers=headers)
            res.raise_for_status()
            return res.json()
```

### Safety & Compliance Guardrails
1. **PII Isolation:** PII is captured strictly during calendar booking; unbooked anonymous profiles never store names or contact numbers.
2. **Mutual TLS & OAuth2:** All external API requests to ClientWorks or Redtail must authenticate via AWS Secrets Manager OAuth2 credentials using TLS 1.3.
