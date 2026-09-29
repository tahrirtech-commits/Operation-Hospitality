Product Vision and Scope
The product provides a single operational control plane for managing rental properties and units from availability and reservation through guest stay, checkout, housekeeping, inspection, maintenance, inventory and
finance. The solution is intentionally operations-first: it prevents a unit from being sold merely because its booking calendar is open when the unit is not operationally READY.

The accepted MVP uses Google Sheets as the operational data store, Google Apps Script for repositories, domain services, workflows, administrative facades and a controlled Web API, and a responsive Admin UI for daily
operation.

Personas

Persona: Administrator
Responsibility:Configures master/reference data, users/staff,properties and units; oversees system integrity.


Persona: Property Manager 
Responsibility: Monitors unit readiness, arrivals/departures, turnover, inspections, maintenance and exceptions

Persona: Supervisor
Responsibility: Checks availability, creates direct reservations and manages reservation lifecycle.

Persona: Reservation Agent
Responsibility: Checks availability, creates direct reservations and manages reservation lifecycle.

Persona: Housekeeper
Responsibility: Receives, starts and completes cleaning/turnover work.

Persona: Technician
Responsibility: Receives, schedules, starts and completes maintenance work


Persona: Finance / Operation Manager
Responsibility: Records and reviews expenses, utilities, bills and internet subscriptions without double counting.


Persona: Guest / Customer 
Responsibility: Business subject represented by customer, guest and reservation records; no guest self-service portal is in the current MVP.

Product Rules
1. A unit is sellable only when its master status is ACTIVE, operational status is READY, and no blocking reservation, external-calendar event or OTA block overlaps the requested stay.
2. Date ranges use checkout-exclusive semantics: [check-in, check-out).
3. Reservation statuses are PENDING, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED and NO_SHOW.
4. Operational statuses are READY, RESERVED, OCCUPIED, DIRTY, CLEANING, INSPECTION, MAINTENANCE, OUT_OF_SERVICE and BLOCKED.
5. Cross-domain lifecycle changes are coordinated through workflow/orchestration services rather than direct UI or repository mutation.
6. Inventory movements are transaction-based and auditable rather than arbitrary stock overwrites.
7. Operating expenses, utility bills and internet subscriptions remain separate accounting concepts until explicit reconciliation/linkage exists.
8. Browser code accesses business functionality only through the allowlisted Web API; it does not access repositories, Sheets or domain services directly.
9. All important changes must be auditable, and integrity checks must detect broken references, invalid IDs and inconsistent operational data.


End-to-End Business Scenarios
1. Direct booking to completed turnover: 
Availability search -> direct reservation -> confirm -> check-in/OCCUPIED -> checkout/COMPLETED + DIRTY -> cleaning -> inspection -> READY.

2. Inspection failure - cleaning:
Checkout -> cleaning -> inspection FAIL (cleaning) -> CLEANING -> remediation -> reinspection -> READY.

3. Inspection failure - maintenance:
Checkout -> cleaning -> inspection FAIL (maintenance) -> MAINTENANCE + work order -> repair -> reinspection -> READY.

4. External-channel conflict protection:
External iCal/OTA block overlaps requested dates -> unit excluded from sellable availability.

5. Inventory consumption during turnover:
Stock receipt/available stock -> housekeeping task -> consumption transaction -> updated stock with traceable task reference.

6. Finance separation:
Operating expense ledger, utility bills and internet subscriptions displayed independently; no unsupported combined grand total.


Definition of Done
1. Acceptance criteria for the story pass.
2. Server-side validation and domain ownership rules are preserved.
3. No browser code directly accesses Sheets, repositories or domain services.
4. Relevant create/update/status changes are audited.
5. New IDs follow configured stable prefix/sequence rules.
6. Integrity checks show no new errors.
7. Existing frozen acceptance suites continue to pass.
8. UI changes are responsive and preserve the established Admin design system.
9. Financial changes do not introduce unsupported aggregation or double counting.
10. Operational lifecycle changes do not bypass orchestration.

Product Owner Notes / Known Boundaries
1. The current MVP is an internal Admin solution; guest self-service, public booking engine, payment gateway and owner portal are not defined as implemented capabilities in this catalogue.
2. External channel integration is iCalendar-based and read-oriented; it is not a full two-way OTA API/channel-manager integration.
3. Google Sheets remains the system data store for the accepted MVP; transactional database guarantees are therefore outside the current baseline.
4. Utility bills and internet subscription fees are intentionally not synchronized automatically into the operating-expense ledger.
5. Phase 7 should prioritize daily operational completeness, authorization, performance and UAT before adding unrelated modules.
