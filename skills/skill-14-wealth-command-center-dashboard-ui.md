# SKILL-14: Wealth Command Center Dashboard UI (`wealth_command_center_dashboard_ui`)

## Role & Goal
Act as a UI/UX fintech engineer constructing the main portfolio overview dashboard ("Command Center"). The dashboard translates complex multi-asset data into instant orientation and progressive detail.

## Target Architecture & Tech Stack
- **Framework:** Next.js 14+ / React 18+ (Server Components + Client Interactivity)
- **Styling:** Tailwind CSS, Lucide React Icons
- **Data Fetching:** TanStack Query (SWR) with 20-minute cache revalidation
- **Integration:** Connects to `SKILL-02` (RAG/KG) and `SKILL-03` (Scoring Engine)

## Core Specification & Guidelines

### 1. Dashboard Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Global Header (User Profile Avatar | Notification Bell | Session Status) │
├─────────────────────────────────────────────────────────────────────────┤
│ Sticky Hero Card: Total Portfolio Value ($/%) | Net Change | Time Toggle│
├─────────────────────────────────────────────────────────────────────────┤
│ Asset Allocation Module (Interactive Donut Chart + Asset Class Pills)   │
├─────────────────────────────────────────────────────────────────────────┤
│ Accordion Holdings List (Equities, Mutual Funds, Fixed Income, Cash)     │
├─────────────────────────────────────────────────────────────────────────┤
│ Floating Action Button (FAB) -> "Deposit", "Rebalance", "Contact Advisor"│
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Visual Hierarchy & Progressive Disclosure
- **Top Tier (Sticky Hero):** Total net worth in high-contrast typography, absolute gain/loss, day's percentage change. Collapses into sticky header on scroll.
- **Secondary Tier:** Donut chart breakdown (max 5–7 segments, grouping small holdings into "Other").
- **Tertiary Tier (Accordions):** Grouped asset cards with ticker, current balance, day's change, and sparkline trend graph.

### 3. TypeScript Dashboard Types

```typescript
export interface HoldingSummary {
  ticker: string;
  name: string;
  assetClass: 'equity' | 'fixed_income' | 'mutual_fund' | 'cash' | 'alternative';
  balance: number;
  dayChangeDollar: number;
  dayChangePercent: number;
  sparklineData: number[];
}

export interface PortfolioOverview {
  totalNetWorth: number;
  dayChangeDollar: number;
  dayChangePercent: number;
  lastUpdated: string;
  isStale: boolean; // Triggers "As of [Time]" stale indicator
  holdingsByClass: Record<string, HoldingSummary[]>;
}
```

### 4. Trust & Stale Data UI States
- **Stale Balance Indicator:** When API revalidation is delayed, grey out total net worth and show an prominent "As of [Timestamp]" label.
- **Pending vs. Settled Cash:** Distinct color indicators and italicized "Pending Settlement" labels to prevent overdraft or execution errors.
