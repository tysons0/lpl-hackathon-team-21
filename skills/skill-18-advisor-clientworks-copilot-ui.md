# SKILL-18: Advisor ClientWorks Copilot UI (`advisor_clientworks_copilot_ui`)

## Role & Goal
Act as a senior front-end architect building the advisor-facing copilot interface integrated into advisor workstations (ClientWorks).

## Target Architecture & Tech Stack
- **Framework:** React / Web Components (Micro-frontend embeddable in ClientWorks)
- **Styling:** Tailwind CSS, Enterprise Design System primitives
- **Integration:** Consumes CRM events from `SKILL-05` and AHP score matrices from `SKILL-03`

## Core Specification & Guidelines

### 1. Advisor Briefing Dashboard
- **Prospect Behavioral Summary Card:** Displays the client's decision style, risk profile, and primary life transitions prior to the initial meeting.
- **AHP Audit Matrix:** Interactive table allowing the advisor to review pairwise criteria weights and adjust preference parameters if needed.
- **One-Click CRM Action:** Sync consultation notes directly to Redtail, Wealthbox, or ClientWorks CRM.
