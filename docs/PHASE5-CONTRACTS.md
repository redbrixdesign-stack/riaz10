# Phase 5 contracts — profitability, suppliers, and capacity

Phase 5 is additive. Phase 4 payments remain authoritative for money received; profitability never mutates the ledger or infers a payment.

## Profitability

- `financialPolicies` are immutable, effective-dated rows. A new policy must start after the current policy, so later configuration cannot rewrite an older commercial record.
- Modes are `commission_advisor`, `sole_trader`, or `hybrid`. Commission-advisor revenue is the sale value multiplied by the effective commission rate; sole-trader and hybrid records use commercial revenue. Rates are stored as explicit numeric policy inputs.
- `jobCosts` are explicit positive direct costs in categories `materials`, `subcontractor`, `travel`, `payment_fee`, `labour`, and `other`. Retry tokens make creation idempotent.
- Quote profitability uses quoted item costs and is labelled `quoted_estimate`.
- Job profitability uses order revenue and explicit actual job costs and is labelled `actual_job_costs`.
- Revenue, cost, gross profit, margin, and profit per hour are rounded deterministically. A missing duration produces no hourly value rather than a fabricated value.

## Suppliers and capacity

- Supplier/product/purchase-order records are separate from commercial order stage. Purchase-order events retain submission, receipt, shortage, damage, return, and follow-up history.
- Availability blocks distinguish working hours, leave, and unavailable periods. Schedule warnings advise; they do not silently reschedule appointments.
- Duration-aware checks cover overlaps, closed hours, blocked periods, travel gaps, and days exceeding eight booked hours. Suggested gaps remain advisory and require the advisor to choose and save a time.
- Supplier shortages, damage, returns, and late expected delivery create visible Follow-up work without changing the linked customer's commercial order stage.

## Storage

Schema 7 contains 32 backed-up tables. Phase 5 adds `suppliers`, `products`, `purchaseOrders`, `purchaseOrderItems`, `jobCosts`, `availabilityBlocks`, and `financialPolicies`. Backup validation checks every new relationship before any write. Job-cost descriptions and availability labels are encrypted at rest and exported readably for cross-install restore.
