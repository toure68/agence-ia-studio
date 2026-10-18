# Product invariants — Agence IA Studio

Preserve working behavior and approved design. A request to add a feature does not authorize replacing, removing, redesigning, or changing an existing feature. Change an established behavior only when the user explicitly requests that particular change. Keep unrelated work out of the change.

- Function buttons open a floating panel over the mounted cockpit. Keep the home address and document; do not turn module clicks into separate screens. Preserve cockpit scroll, assistant text and attachments. Keep an immediately available close cross and bottom close button.
- The assistant stays collapsed behind a compact full-width bar (48px, 16px corners, centered label) just below the home greeting by default; opening/closing moves the existing chat into/out of the contextual panel while preserving history, draft and unsent attachments.
- Home cards stay closed by default with only a short action/status message. Details, fields and validation appear after a click in the panel.
- Preserve the approved dark translucent glass surfaces on a black cockpit background, colorful SVG app badges and discreet urgency indicators, responsive layouts, module visibility preferences, and access restrictions.
- Preserve existing business workflows, explicit validation, signature consent, and company/user isolation. Never send real messages or use paid provider calls during tests.
- Check affected workflows and navigation regressions before shipping. Inspect the final change for unrelated behavior changes. Verify deployment SUCCESS and live asset version before reporting the change online.

- Grid cards must always have identical dimensions; never span or stretch a last card. Use complete rows and keep overflow in the reserve. Four-column grids put icon cards above their labels; three columns retain rectangular inline widgets. Dynamic home is enabled by default: ten days of inactivity moves a module into reserve unless an actionable alert requires it; only an explicit user setting disables this behavior.

- Home widgets use inline SVG and CSS with a factual metric from the shared cockpit snapshot; no bitmap assets, per-card requests, invented figures or mixed-currency totals. Preserve equal cards, dynamic priorities and contextual navigation.

- All grid modes, including manual two-column homes, must have complete rows. Two-column widgets are horizontal with name and metric inside; four-column compact squares keep their labels below. Alert colors follow the explicit red danger/orange warning rule below; do not change unrelated detailed backgrounds.

- Two-column visual reference uses equal horizontal graphite glass cards, fine bright rims, large glass-backed colored SVG glyphs, uppercase names and wrapped factual metrics. Keep greeting, assistant, urgency banners and all workflows. Home search opens the existing searchable module reserve.

- Outer grid card corners are lightly rounded (10px). Three columns use smaller icons and inline labels/data; four columns keep labels below. Card heights now follow the common stable-height rule below. Preserve colors except the explicitly specified red/orange alert liseré.

- Current ergonomics: priority cards are independent and spaced, with the original graduated heights. Never combine all functions into one top panel. Show one card per function; several actions from the same function are accessible in its floating chooser. Preserve individual open, dismiss and speech actions. Two/four-column tiles retain a stable 88px mobile /112px desktop height. Three-column tiles scale their height, icon, text and insets together from the actual two-column cell width, including grid gaps. Recalculate on resize; every tile within a grid remains equal. Two/three-column buttons fit inside the outer card border. Priority borders use a masked 1px moving conic reflection on actionable grid and independent priority cards (8s linear loop); red/pink for danger, orange/gold for warning, static under reduced motion. No pulsing, layout changes or pointer interception. Every first-level/nested dialog must stay within the visual viewport including the keyboard; table scrolling stays local.

- The small glass app badge also has a steady 1px state rim: red danger, orange warning, blue info. Keep the colored glyph, glass fill, badge size and outer moving border unchanged; neutral and completed modules retain their normal rim.

- Event/required-date command preparation offers an explicit date picker, keeps dates written in the command working, and displays validation errors inline without hiding the Prepare button behind a toast. Creating a record still requires explicit confirmation.
