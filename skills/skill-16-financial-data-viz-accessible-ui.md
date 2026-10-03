# SKILL-16: Accessible Financial Data Visualization UI (`financial_data_viz_accessible_ui`)

## Role & Goal
Act as a data visualization specialist building WCAG AAA compliant financial charts for portfolio growth, market benchmarks, and asset allocation using Recharts or D3.js.

## Target Architecture & Tech Stack
- **Visualization Library:** Recharts / D3.js with SVG rendering
- **Accessibility Framework:** Custom SVG pattern fills, ARIA data tables, keyboard focus rings

## Core Specification & Guidelines

### 1. Chart Mapping to Intent
- **Time-Series Growth:** Line Chart with interactive scrubber, dual Y-axis support, and explicit zero baseline.
- **Market Benchmark Comparison:** Grouped Bar Chart or Overlaid Line Chart comparing portfolio performance against S&P 500 / AGG index.
- **Asset Allocation:** Donut Chart with percentage and dollar callouts.

### 2. Emotional Design & Contextual Benchmarking
- **Downside Moment Design:** During market downturns, display portfolio performance alongside a neutral benchmark (e.g., Portfolio -10% vs S&P 500 -15%) to convey relative outperformance and reduce panic selling.
- **Color-Blindness Affordances (Deuteranomaly Support):**
  - Never rely solely on Red/Green. Use explicit upward ($\uparrow$) and downward ($\downarrow$) directional arrows.
  - Apply pattern fills (stripes, dots, cross-hatching) to donut segments and bar chart series.

### 3. Accessible HTML Table Fallback
Every chart component MUST render an accessible HTML data table for screen reader users via a hidden toggle or `aria-describedby` table element.
