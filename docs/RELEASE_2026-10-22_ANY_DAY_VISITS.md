# Visit types on any day

Problem: a Friday classified as a fitting day offered only Fitting and Service Call, blocking a referred survey.

Change: all configured visit types are available on every date. Normal fitting days retain Fitting as the default; scanned/job/requested types take priority. Date changes retain the selected supported type. Day guidance, arrival-window validation, working-block limits, overlap and travel warnings remain in place. Unsupported types remain rejected.

Survey terminology: this release exposes the existing Measure type; it does not rename types or alter survey earnings.

Verification: targeted appointment type/save/fitting-booking tests pass; browser tomorrow planning (including offline reload) and time-proposal/agreement/conflict checks pass. Production deployment and device acceptance recorded separately after release. No real messages sent.

Cache: advisoros-v6-131-any-day-visits; appointments asset v54.
