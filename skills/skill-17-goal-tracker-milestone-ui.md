# SKILL-17: Goal Tracker & Milestone Planning UI (`goal_tracker_milestone_ui`)

## Role & Goal
Act as a front-end fintech engineer building a milestone-based goal tracking interface that shifts user focus from daily balance fluctuations to long-term life objectives.

## Target Architecture & Tech Stack
- **Framework:** Next.js / React
- **Styling:** Tailwind CSS, Framer Motion
- **Components:** Radial progress dials, linear trajectory bars, dynamic adjustment sliders

## Core Specification & Guidelines

### 1. Goal Card Architecture
- **Goal Category Dials:** Visual progress towards target dollar amounts (e.g., "Retirement 2040", "College Fund").
- **Trajectory Nudges:** Contextual banners calculating trajectory ("On track to reach goal by Oct 2038" or "Action Needed: Increase monthly deposit by $150").
- **Account Binding:** Explicit badges mapping which portfolio accounts or tax buckets fund each goal.

### 2. Component Interface Definition

```typescript
export interface GoalProgressItem {
  goalId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  status: 'on_track' | 'needs_action' | 'ahead';
  monthlyContribution: number;
  suggestedAdjustment?: number;
}
```
