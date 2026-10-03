# SKILL-13: Progressive Behavioral Intake UI (`behavioral_intake_ui`)

## Role & Goal
Act as a senior front-end engineer building a React/TypeScript/Tailwind CSS onboarding flow. This skill implements the First-Time User Experience (FTUE) and progressive disclosure intake engine for wealth management applications based on behavioral finance principles.

## Target Architecture & Tech Stack
- **Framework:** Next.js 14+ (App Router) / React 18+
- **Styling:** Tailwind CSS, Shadcn UI / Radix Primitives, Framer Motion (micro-animations)
- **State Management:** Zustand / React Hook Form with Zod schema validation
- **Backend Integration:** REST/GraphQL calls to `SKILL-01` (Behavioral Intake API Gateway)

## Core Specification & Guidelines

### 1. Progressive Disclosure Architecture
- **Step-by-Step Card Flow:** Present a 10–12 question flow using dynamic slot-filling without overwhelming the user.
- **Anonymous Session Preservation:** Store progress in `localStorage` / DynamoDB session tokens prior to any PII collection.
- **Positive Friction Gate:** Include explicit confirmation steps for risk tolerance and liquidity choices.

### 2. TypeScript Component Interfaces

```typescript
export interface IntakeQuestionOption {
  id: string;
  label: string;
  description?: string;
  value: string | number;
  iconName?: string;
}

export interface IntakeQuestion {
  id: string;
  stepIndex: number;
  title: string;
  subtitle?: string;
  type: 'card_select' | 'slider' | 'multi_select' | 'numeric_input';
  options?: IntakeQuestionOption[];
  min?: number;
  max?: number;
  step?: number;
  slotKey: string;
}

export interface IntakeState {
  sessionId: string;
  currentStep: number;
  totalSteps: number;
  responses: Record<string, any>;
  isComplete: boolean;
}
```

### 3. Component Hierarchy & UX Requirements
- **`WelcomeCanvas` Component:** Abstract milestone illustration, zero jargon, focuses on long-term wealth goals.
- **`RiskProfilingSlider` Component:** Dual-label slider (e.g., "Capital Preservation" to "Aggressive Growth") with real-time volatility expectation visualization.
- **`CardSelectGroup` Component:** High-contrast, keyboard-accessible selection cards with aria-selected states.
- **`IntakeProgressBar` Component:** Framer Motion animated progress bar displaying completion percentage.

### 4. Accessibility & Compliance Guardrails (WCAG AAA)
- **Keyboard Navigation:** Full `Tab` and `ArrowKey` support across option cards.
- **Screen Reader Support:** `aria-live="polite"` regions announcing step changes and slot values.
- **Color Contrast:** Contrast ratios $\ge 7:1$ for all body text and card titles.
