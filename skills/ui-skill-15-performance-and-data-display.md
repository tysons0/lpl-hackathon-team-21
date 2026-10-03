# UI Skill 15: Fast, Stable Data Displays

> Guidance for advisor lists, chat updates, and business dashboards that stay responsive and understandable.
> Stack context: Vite frontend, browser JavaScript, and CSS.

## Make the interface feel fast

- Prioritize useful content in the first viewport. Load only the code, images, and data required for the current task; defer optional dashboard panels and below-the-fold imagery.
- Give images explicit dimensions or `aspect-ratio` so space is reserved before they load. Use responsive image sizes when multiple resolutions exist and lazy-load offscreen images.
- Keep the main thread available for input. Avoid expensive synchronous rendering in event handlers; update the interface promptly, then do non-urgent work in smaller chunks or defer it.
- Render user feedback at once for pending work. Skeletons are useful when they match the eventual content geometry; otherwise use a small, stable loading status. Avoid inserting banners above content after it has loaded if this shifts what people are reading.
- Avoid layout shifts by reserving space for images, charts, validation messages, and asynchronous content. Keep sticky regions from covering focused controls.
- Treat LCP, INP, and CLS as a field experience set: at the 75th percentile, good thresholds are LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Lab checks can catch regressions, but field data shows the variation from real devices and interactions.

## Data display principles

- Start with the decision a metric supports. Show the time range, units, comparison baseline, and source context close to the number.
- Use hierarchy before decoration: label, key value, change, and one useful explanation. Do not overfill dashboards with cards that all compete for attention.
- Choose a visualization that matches the question. Use a table for exact comparisons, a line for change over time, bars for category comparison, and a small set of KPI values for headline summaries.
- Keep charts readable at narrow widths. Simplify labels, provide a compact table or summary equivalent, and avoid hover as the only way to inspect values.
- Use consistent scales when comparing panels. Do not imply causation from correlation or hide a meaningful zero baseline in comparisons where it matters.
- Provide an accessible text summary or data table for custom charts, including series names, values, and the period shown. Mark decorative graphics as hidden from assistive technology.
- For empty, partial, stale, or failed data, say which case applies and what the user can do next. Never present missing data as zero.

## Keep comparisons trustworthy

- Define whether changes are absolute or percentage-point changes; label the baseline and period.
- Preserve precision appropriate to the decision. Avoid unnecessary decimal places and disclose estimates or sample-size limitations.
- Encode status with words and symbols as well as color. Keep positive/negative conventions stable throughout the app.
- For advisor match results, explain the dimensions contributing to fit and make key tradeoffs visible. A score alone is not an explanation.
- Ensure CSV exports carry column names, units, and a date range so values retain meaning outside the interface.

## Lightweight performance review

1. Identify the main content element and its loading dependencies; optimize the actual LCP path.
2. Interact with filters, tabs, booking, chat, and dashboard controls on a lower-powered mobile device; inspect slow responses and long tasks.
3. Observe layout while images and async data resolve; remove unexpected jumps and preserve space for late content.
4. Check representative real-user data where available. Segment mobile and desktop and review the 75th percentile rather than one idealized run.
5. Retest visual and functional behavior after a performance change; defer complexity until measurement shows a need.

## References

- [web.dev: Web Vitals](https://web.dev/articles/vitals)
- [web.dev: Optimize LCP](https://web.dev/articles/optimize-lcp)
- [web.dev: Optimize CLS](https://web.dev/articles/optimize-cls)
- [web.dev: Interaction to Next Paint](https://web.dev/articles/inp)
- [React: Reacting to input with state](https://react.dev/learn/reacting-to-input-with-state) — conceptual reference only; this app uses plain JavaScript.
