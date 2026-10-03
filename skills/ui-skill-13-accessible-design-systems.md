# UI Skill 13: Accessible Design Systems

> Reusable guidance for building consistent, accessible interfaces in this project.
> Stack context: Vite, plain JavaScript modules, semantic HTML, and CSS in `web/src/`.

## Purpose

Create a small visual language that makes advisor discovery, matching, booking, and business reporting feel like parts of one product. Keep accessibility built into the shared tokens and components so each new feature does not have to rediscover it.

## Design system workflow

1. **Start with tasks.** Identify the user's next decision and the information needed to make it. For advisor matching, prioritize fit, experience, fee disclosures, language, meeting options, and a clear next action.
2. **Define semantic tokens.** Keep colors, type, spacing, radii, borders, shadows, and focus treatment in CSS custom properties. Name colors by purpose (`--text-muted`, `--surface-raised`, `--focus-ring`) rather than by hue. Preserve the existing brand palette unless a redesign is requested.
3. **Build a type and spacing scale.** Use a small set of readable sizes and spacing steps. Reserve display styling for page titles; use stable body text sizing and line height for long explanations and disclosures.
4. **Compose from a few patterns.** Prefer consistent buttons, fields, tabs, cards, badges, empty states, alerts, and disclosure blocks over one-off markup. Use native HTML controls where they provide the right behavior.
5. **Validate with content.** Use long advisor names, translated labels, missing optional data, fee disclosures, and error messages to expose wrapping and hierarchy issues early.

## Accessibility defaults

- Use landmarks and a logical heading order. Give each page one clear primary heading.
- Associate each input with a visible `<label>`. Put hints and validation text next to the relevant field and connect them with `aria-describedby` when helpful.
- Keep keyboard focus visible, sufficiently contrasted, and not hidden behind sticky headers, dialogs, or overlays. WCAG 2.2 AA includes Focus Not Obscured (Minimum); target size minimum is 24 by 24 CSS pixels subject to its exceptions.
- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text. Do not communicate status through color alone; pair color with text, shape, or an icon with an accessible name.
- Use buttons for actions and links for navigation. Keep accessible names descriptive, especially for icon-only controls. Preserve native keyboard behavior instead of adding custom roles without need.
- For dynamic updates, expose concise status feedback. Use `role="status"` for non-urgent updates and reserve `role="alert"` for urgent errors. On form failure, identify the fields and explain how to fix them; move focus to an error summary or first invalid field where appropriate.
- Check text zoom, keyboard-only use, screen-reader names, high contrast, and reduced motion. Avoid relying on hover-only hints.

## Useful CSS foundation

```css
:root {
  color-scheme: light;
  --surface: #fff;
  --surface-soft: #f5f8f7;
  --text: #172522;
  --text-muted: #52635f;
  --border: #cbd7d3;
  --focus-ring: #145c50;
  --radius-card: 1rem;
  --space-2: .5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
}

:where(button, a, input, select, textarea):focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
}
```

Treat the values as a starting point, not a substitute for contrast testing against actual states and backgrounds. Reuse the project's brand colors where possible.

## Project-specific patterns

- Advisor match cards should put the match reason and actionable details ahead of decorative elements. Keep fee disclosures visible and readable at phone widths.
- Selected tabs and filter buttons need a programmatic state (`aria-selected`, `aria-pressed`, or native checked state) as well as a visual state.
- Tooltips must be usable by keyboard and touch, and essential information should remain available without a tooltip.
- In chat and voice states, announce new responses and microphone status without repeatedly reading the entire conversation. Keep a visible text path for voice-driven actions.
- Business metrics should include a text equivalent for chart-like graphics and explain the time range and units.

## Review checklist

- Can the primary task be completed with keyboard only?
- Can each control be understood without its color or icon?
- Are focus and validation states clear on all surfaces?
- Do long labels and translated text fit without clipping?
- Do dialogs, tabs, and expandable content expose their current state?
- Are disclosures, privacy explanations, and financial terms easy to find and read?

## References

- [W3C: What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C WAI: Labeling controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- [W3C WAI: Form notifications and errors](https://www.w3.org/WAI/tutorials/forms/notifications/)
