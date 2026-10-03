# UI Skill 14: Responsive Layouts and Interaction Patterns

> Guidance for making the app's core flows work across phone, tablet, desktop, touch, and keyboard.
> Stack context: CSS and browser JavaScript; no React dependency is present in this project.

## Design for the task, then the available space

- Map each journey as a sequence of states: discover, compare, understand, book, confirm; for the dashboard, choose a date range, inspect a signal, and act on it.
- Keep the same essential actions available across screen sizes. Reflow content before hiding it, and use progressive disclosure only when the user can still discover the hidden details.
- Use CSS Grid and Flexbox for layout. Prefer intrinsic sizing (`minmax(0, 1fr)`, `min-width: 0`, `min()`, `max()`, `clamp()`) to fixed-width assumptions.
- Use viewport media queries for page-level structure and CSS container queries when a reusable card or panel must adapt to the width it is actually given.
- Pick breakpoints when content stops fitting, not to match named devices. Test narrow and wide widths, browser zoom, and long translated labels.

```css
.advisor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: clamp(1rem, 2vw, 1.5rem);
}

.advisor-card-shell { container-type: inline-size; }

@container (max-width: 22rem) {
  .advisor-card__actions { display: grid; }
}
```

## Interaction state

- Keep one source of truth for each changing value. Derive filtered lists, counts, and labels from source data and selected controls instead of maintaining duplicate state.
- Model async interactions explicitly: idle, loading, success, empty, and error. Disable duplicate submission only while a request is pending, and show a clear outcome when it resolves.
- Preserve user-entered form values after recoverable errors. Validate near the relevant field, explain the correction, and keep a clear overall error summary for long forms.
- Make selection and expansion visible and programmatic. For custom tab patterns, support arrow keys and keep focus aligned with the selected tab; use native radio groups or buttons when they fit better.
- Keep destructive or consequential actions deliberate: say what will happen, label the final action clearly, and show a completion state.
- Avoid interaction that depends on drag, hover, precise pointer movement, or animation timing. Provide click/tap and keyboard alternatives.

## Motion that supports orientation

- Use motion only when it helps users understand continuity, cause and effect, or completion. Keep routine transitions short and avoid animating large page regions by default.
- Honor `prefers-reduced-motion: reduce`; remove nonessential movement, parallax, scaling, and auto-playing effects while preserving state changes and feedback.
- Use the View Transition API only as an enhancement. Feature-detect it, preserve a direct non-animated path, and check focus and reading order after a view changes.
- Avoid using animation as the only signal for loading, success, or an error.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

Use this as a baseline and selectively retain motion only when it is essential to understanding the interface.

## Project-specific interaction guidance

- On small screens, keep advisor cards scannable: name, fit explanation, key constraints, fee information, then the booking action. Avoid turning comparison into a horizontal scroll surface.
- In chat, retain the conversation context when a booking form or advisor detail opens. Return focus to the initiating control when a temporary panel closes.
- Keep microphone permission, recording, transcription, and read-aloud states explicit. Provide an equally usable text workflow if voice is unavailable or declined.
- For dashboard tables and filters, make the active range and applied filters visible, with a simple way to reset them.

## References

- [MDN: Container size and style queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [React: Thinking in React (state modeling principles)](https://react.dev/learn/thinking-in-react) — conceptual reference only; this app uses plain JavaScript.
