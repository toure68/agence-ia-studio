# Product invariants — Agence IA Studio

Preserve working behavior and approved design. A request to add a feature does not authorize replacing, removing, redesigning, or changing an existing feature. Change an established behavior only when the user explicitly requests that particular change. Keep unrelated work out of the change.

- Function buttons open a floating panel over the mounted cockpit. Keep the home address and document; do not turn module clicks into separate screens. Preserve cockpit scroll, assistant text and attachments. Keep an immediately available close cross and bottom close button.
- The assistant stays collapsed behind a compact pill just below the home greeting by default; opening/closing moves the existing chat into/out of the contextual panel while preserving history, draft and unsent attachments.
- Home cards stay closed by default with only a short action/status message. Details, fields and validation appear after a click in the panel.
- Preserve approved pastel colors and urgency top bands, responsive layouts, module visibility preferences, and access restrictions.
- Preserve existing business workflows, explicit validation, signature consent, and company/user isolation. Never send real messages or use paid provider calls during tests.
- Check affected workflows and navigation regressions before shipping. Inspect the final change for unrelated behavior changes. Verify deployment SUCCESS and live asset version before reporting the change online.

- Grid cards must always have identical dimensions; never span or stretch a last card. Use complete rows and keep overflow in the reserve. Dense grids put icon cards above their labels. Dynamic home is enabled by default: ten days of inactivity moves a module into reserve unless an actionable alert requires it; only an explicit user setting disables this behavior.

- Home widgets use inline SVG and CSS with a factual metric from the shared cockpit snapshot; no bitmap assets, per-card requests, invented figures or mixed-currency totals. Preserve equal cards, dynamic priorities and contextual navigation.
