# Beelo Accessibility Standard

Target: WCAG 2.2 AA for supported user journeys.

## Interaction rules

- Every icon-only control has a concise accessible name; decorative icon glyphs
  use `aria-hidden="true"`.
- Primary touch targets should be at least 44 by 44 CSS pixels. Where a visual
  checkbox is smaller, its associated label must provide the full target.
- All functionality must be operable with keyboard alone. Visible focus must not
  be removed or obscured by fixed headers, sheets or the bottom navigation.
- Dialogs move focus inside when opened, trap focus while active, close with
  Escape where safe, and restore focus to the invoking control.
- Tabs support Arrow Left/Right, Home and End as well as normal Tab navigation.

## Content and state

- Inputs have persistent programmatic labels; placeholder text is supplementary.
- Validation identifies the field, explains the correction and is announced.
- Toasts and asynchronous totals use an appropriate live region without
  repeatedly interrupting the user.
- Colour is never the only carrier of urgency, selection, success or error.
- Map, chart, camera and OCR screens provide meaningful textual alternatives.

## Release evidence

For each release, test keyboard-only navigation, 200% text scaling, VoiceOver on
iOS/Safari and TalkBack on Android/Chrome. Automated axe results are supporting
evidence and do not replace manual assistive-technology testing.
