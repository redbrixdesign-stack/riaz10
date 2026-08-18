# Beelo Product Language

## Naming

- **Beelo** is the product name shown to advisors in the interface, installed
  application, notifications, help and customer-facing material.
- **AdvisorOS** is the internal repository/platform codename. It may appear in
  technical logs, storage keys, migration notes and engineering documentation,
  but not in ordinary user-facing copy.
- Configured company branding may prefix the browser title, but does not rename
  the underlying Beelo product.

## Core terminology

| Preferred term | Use | Avoid in the same context |
|---|---|---|
| Customer | A person receiving the service | Client |
| Visit | A scheduled customer interaction | Appointment |
| Order | A confirmed sale | Deal |
| Follow-up | Work due after or around a visit | Nudge, chase (except conversational Beelo copy) |
| Effective commission | Commission as a percentage of gross sale value | Raw decimal rate |

Technical schema identifiers may retain `customer`, `appointment` and other
legacy names. UI changes do not require a risky data migration.

## Money and rates

- Display GBP with the pound sign and two decimal places for transactions.
- Display rates as percentages, never their decimal calculation form:
  `0.122` is displayed as `12.2%`.
- Explain the basis of commission wherever a user can change it.
- Mileage policy text must include its effective date and threshold.
- Do not imply that an estimate is a guaranteed tax outcome.

## Tone

Be concise, calm and operational. State the action first, explain recovery when
something fails, and avoid internal identifiers such as `two_stage` in normal
user-facing prose.
