# Rental Operations MVP

An operations-first property rental management system for serviced apartments and short-term rentals, built on Google Apps Script and Google Sheets.

The application provides a single operational control plane from availability and reservation through guest stay, checkout, housekeeping, inspection, maintenance, inventory, and finance.

> **Core rule:** a unit is not sellable merely because its booking calendar is open. It must also be operationally **READY**.

## Status

**Version:** 1.0.0 MVP  
**Runtime:** Google Apps Script V8  
**Data store:** Google Sheets  
**Timezone:** Africa/Cairo  
**Current work:** controlled PILOT validation

The project has completed the foundation, reservation, operations, finance, inventory, admin API/UI, and end-to-end implementation phases. Pilot validation is currently exercising the production lifecycle against a clean pilot spreadsheet.

### Pilot validation

Validated successfully:

- Database/bootstrap creation
- Reference data initialization
- Property, unit, location, staff, and operational-status master data
- Availability checking
- Direct reservation creation
- Customer and guest creation
- Primary guest assignment
- Reservation confirmation
- Manual OTA block workflow for Airbnb and Booking.com
- Check-in: `CONFIRMED -> CHECKED_IN`
- Unit transition: `READY -> OCCUPIED`
- Integrity checks with zero errors/warnings through check-in

Current finding:

- Stay completion correctly changes the reservation to `COMPLETED` and the unit to `DIRTY`.
- The current workflow does not yet release/cancel the associated `BLOCKED` OTA records.
- `IntegrityCheckService` correctly detects these terminal-reservation/active-OTA-block inconsistencies.
- This issue must be resolved before the complete-stay milestone is accepted.

## Product scope

The MVP supports internal rental operations rather than a public guest booking portal.

Primary users include administrators, property managers, supervisors, reservation agents, housekeepers, technicians, and finance/operations managers.

Major capabilities include:

- Property, unit, location, customer, guest, and staff master data
- Operational unit status management
- Availability calculation
- Direct reservations and reservation lifecycle
- External iCalendar synchronization
- Manual OTA blocking workflow
- Guest assignment
- Check-in and stay completion orchestration
- Housekeeping and turnover operations
- Inspection workflows
- Maintenance assets, schedules, and work orders
- Inventory items, locations, stock, and transactions
- Operating expenses
- Utilities and utility bills
- Internet-service tracking
- Audit logging
- Integrity validation
- Administrative dashboard and responsive web UI

Not currently part of the accepted MVP:

- Public booking engine
- Guest self-service portal
- Payment gateway
- Owner portal
- Full two-way OTA/channel-manager API integration

## Architecture

```text
Browser / Google Sites
        |
        v
Apps Script Web App (81_WebApp.js / Index.html)
        |
        v
WebApiService (80_WebApiService.js)
        |
        +-------------------------------+
        |               |               |
        v               v               v
Admin Services      Dashboard       Reference
70-74               Service         Service
        |
        v
Domain / Workflow Services
        |
        +-- Reservation & Availability
        +-- Calendar / OTA
        +-- Housekeeping
        +-- Inspection
        +-- Maintenance
        +-- Inventory
        +-- Finance
        |
        v
BaseRepository
        |
        v
Google Sheets
```

The browser is intentionally isolated from repositories and Google Sheets. Browser requests go through the allowlisted `WebApiService`, which delegates to administrative facades and domain services.

Cross-domain lifecycle changes belong in workflow/orchestration services rather than UI code or direct repository mutation.

## Core business rules

1. A unit is sellable only when:
   - its master status is `ACTIVE`;
   - its operational status is `READY`;
   - no blocking reservation overlaps the requested dates;
   - no blocking external-calendar event overlaps the requested dates; and
   - no active OTA block overlaps the requested dates.
2. Date ranges use checkout-exclusive semantics: `[check-in, check-out)`.
3. Reservation lifecycle states are `PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, and `NO_SHOW`.
4. Operational unit states are `READY`, `RESERVED`, `OCCUPIED`, `DIRTY`, `CLEANING`, `INSPECTION`, `MAINTENANCE`, `OUT_OF_SERVICE`, and `BLOCKED`.
5. Inventory movements are transaction-based and auditable; stock should not be changed through arbitrary overwrites.
6. Operating expenses, utility bills, and internet subscriptions are separate financial concepts until explicit reconciliation/linkage exists.
7. Important mutations must be auditable.
8. Integrity checks must detect invalid IDs, broken references, invalid states, and inconsistent cross-domain data.

## Main lifecycle

```text
Availability
    |
    v
Direct Reservation
    |
    v
PENDING
    |
    v
CONFIRMED
    |
    +--> Manual OTA blocking
    |
    v
CHECKED_IN
    |
    v
Unit OCCUPIED
    |
    v
COMPLETED
    |
    v
Unit DIRTY
    |
    v
Housekeeping / CLEANING
    |
    v
Inspection
    |
    +--> PASS --------> READY
    |
    +--> Cleaning issue -> CLEANING -> Reinspection
    |
    +--> Maintenance ---> MAINTENANCE -> Repair -> Reinspection
```

## Repository structure

The project uses numbered files to make architectural layers easy to identify.

| Range | Responsibility |
|---|---|
| `00-04` | Configuration, repository, IDs, validation, audit |
| `10-14` | Master data and operational status |
| `20` | Integrity checking |
| `30-33` | External calendars, availability, synchronization |
| `40-43` | Reservations, guests, OTA blocks, reservation workflows |
| `50-56` | Housekeeping, maintenance, inspections, stay operations, inventory |
| `60-62` | Expenses, utilities, internet services |
| `70-74` | Dashboard and Admin service facades |
| `80-81` | Web API and Web App boundary |
| `90-91` | Google Sheets admin menu and triggers |
| `95-99` | Tests, setup/bootstrap, pilot runners |
| `Index.html` | Responsive Admin UI |
| `appsscript.json` | Apps Script manifest |

## Google Sheets data model

The accepted runtime uses the following core sheets:

### Reference and master data

- `00_ReferenceData`
- `01_Properties`
- `02_Units`
- `06_Locations`
- `07_Customers`
- `08_Guests`
- `15_Staff`
- `23_UnitOperationalStatus`

### Reservations and channels

- `09_Reservations`
- `10_ReservationGuests`
- `13_ExternalCalendarEvents`
- `14_OTABlocks`

### Operations

- `16_HousekeepingTasks`
- `17_HousekeepingSchedules`
- `18_MaintenanceAssets`
- `19_MaintenanceSchedules`
- `20_MaintenanceWorkOrders`
- `21_Inspections`
- `22_InspectionChecklist`

### Finance and inventory

- `24_Utilities`
- `25_UtilityBills`
- `26_InternetServices`
- `27_OperatingExpenses`
- `31_InventoryItems`
- `32_InventoryLocations`
- `33_InventoryStock`
- `34_InventoryTransactions`

### System

- `30_AuditLog`

Additional configured sheets exist for amenities, media, reservation charges, payments, vendors, and notifications but are not part of the current required runtime integrity baseline.

## Prerequisites

For local development you need:

- A Google account with access to the target spreadsheet and Apps Script project
- Node.js and npm
- Git
- Google clasp (`@google/clasp`)

Install clasp if needed:

```bash
npm install -g @google/clasp
clasp login
```

Verify:

```bash
clasp --version
clasp status
```

## Local setup

Clone the repository and enter the project directory:

```bash
git clone <repository-url>
cd Operation-Hospitality
```

Create or provide a local `.clasp.json` that points to the intended Apps Script project.

Example:

```json
{
  "scriptId": "<APPS_SCRIPT_ID>",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

Do not commit environment-specific clasp configuration containing project mappings unless that is an intentional repository policy.

## DEV and PILOT environments

DEV and PILOT should remain separate:

```text
GitHub
  |
  +--> Local working copy
         |
         +--> DEV Apps Script  -> DEV Sheet
         |
         +--> PILOT Apps Script -> PILOT Sheet
```

GitHub is the source of truth for application source.

Recommended workflow:

```bash
git pull --ff-only
git status
clasp status
clasp push
```

Avoid `clasp pull` over intentionally formatted/local source unless you specifically intend to replace local files with the Apps Script copy.

## Initializing a clean PILOT

The project contains controlled pilot bootstrap functions.

Run them in this order from the Apps Script editor:

```text
setupPilotDatabase()
setupPilotMasterData()
setupPilotReservation()
runPilotCheckIn()
```

### 1. Database

`setupPilotDatabase()` creates the required runtime sheets, validates existing headers, seeds reference data, initializes ID sequences, and runs integrity validation.

The bootstrap is designed to be non-destructive and idempotent.

### 2. Master data

`setupPilotMasterData()` creates/reuses the initial location, property, unit, operational status, and administrator record.

### 3. Reservation

`setupPilotReservation()` exercises the first controlled direct-booking workflow:

```text
Availability
 -> Customer
 -> Guest
 -> Direct reservation
 -> Primary guest assignment
 -> OTA block work
 -> Confirmation
 -> Integrity
```

### 4. Check-in

`runPilotCheckIn()` validates:

```text
OTA PENDING -> BLOCKED
CONFIRMED -> CHECKED_IN
READY -> OCCUPIED
Integrity PASS
```

### 5. Complete stay

`runPilotCompleteStay()` currently validates the transition:

```text
CHECKED_IN -> COMPLETED
OCCUPIED -> DIRTY
```

However, the current implementation exposes a known workflow defect: OTA blocks remain `BLOCKED` after the reservation becomes terminal. The integrity checker therefore fails until the production workflow is corrected to release/cancel those blocks.

## Integrity checks

`IntegrityCheckService` is a key safety mechanism.

It validates, among other things:

- Required sheets and headers
- Reference data
- ID sequences
- Reservation relationships
- Reservation/guest relationships
- OTA block consistency
- Operational statuses
- Housekeeping
- Maintenance
- Inspections
- Inventory
- Finance
- Audit data

From the spreadsheet UI, the administrative menu also exposes:

```text
Rental Ops
  -> Phase 1 - Foundation
     -> Run Integrity Check
```

A milestone should not be accepted when it introduces new integrity errors.

## External calendars and OTA handling

The current MVP uses iCalendar-oriented external calendar synchronization rather than a full two-way channel-manager API.

The scheduled synchronization entry point is:

```javascript
scheduledCalendarSync()
```

Install the hourly Apps Script trigger with:

```javascript
installCalendarSyncTrigger()
```

Remove it with:

```javascript
removeCalendarSyncTrigger()
```

For direct bookings, OTA block records provide an operational work queue for manually blocking the corresponding stay on external channels.

## Web application

`81_WebApp.js` serves `Index.html` through `doGet()`.

Browser calls use:

```javascript
apiCall(action, params)
```

which delegates to `WebApiService.call()`.

The API returns a standard envelope:

```javascript
{
  success: true | false,
  data: null | {},
  error: null | {
    code: "...",
    message: "..."
  },
  meta: {
    action: "...",
    timestamp: "..."
  }
}
```

The API boundary exposes allowlisted actions for reference data, dashboards, reservations, operations, and finance.

## Deployment

The Apps Script manifest uses the V8 runtime and is configured as a Web App.

Before deployment:

1. Confirm the correct environment in `.clasp.json`.
2. Run `git status`.
3. Push the intended source with `clasp push`.
4. Run the relevant acceptance/integrity tests.
5. Create an immutable Apps Script version.
6. Deploy that version as the Web App.
7. Test the Apps Script `/exec` endpoint directly.
8. Only then embed/use the deployment through Google Sites if required.

Typical version/deployment commands:

```bash
clasp create-version "Pilot release"
clasp deploy
```

Record the Git commit/tag, Apps Script version, and deployment ID for every controlled release.

The current manifest is configured to execute as the deploying user and restrict access to that user. Review deployment access before widening pilot access.

## Testing strategy

The repository contains service-level, integration, acceptance, and end-to-end test scripts in the `95-99` range.

A change is considered complete only when:

1. Story acceptance criteria pass.
2. Server-side validation and domain ownership are preserved.
3. Browser code does not directly access Sheets or repositories.
4. Relevant mutations remain audited.
5. IDs follow configured prefix/sequence rules.
6. Integrity checks introduce no new errors.
7. Existing accepted test suites continue to pass.
8. UI changes remain responsive and preserve the Admin design.
9. Financial changes avoid unsupported aggregation/double counting.
10. Operational lifecycle changes use orchestration services.

## Current known issues / backlog

### OTA blocks after completed stays

A completed reservation is terminal, but the current `completeStay()` workflow leaves its previously completed manual OTA-block records in `BLOCKED` status.

The integrity service reports this as:

```text
Terminal reservation still has blocking OTA record
```

The intended fix is to update the production completion workflow so active OTA blocks are released/cancelled as part of terminal reservation handling, with safe reconciliation for existing pilot data.

### Phase 4 test fragility

A Phase 4 end-to-end confirmation test previously overwrote its reservation variable with the command return value before dereferencing it. This is tracked as a test issue rather than a production reservation-domain failure.

### Configuration cleanup

`CONFIG.ID_PREFIXES` currently contains a duplicate `INSPECTION` key with the same `INSP` value. It is non-blocking but should be cleaned up.

### Admin setup menu

The legacy Admin menu can reference `setupPhase1()` when that function is present. The newer controlled pilot bootstrap uses the dedicated `setupPilot*` functions instead.

## Roadmap

Near-term priorities:

- Correct OTA-block release during terminal reservation workflows
- Complete PILOT stay lifecycle
- Validate housekeeping: `DIRTY -> CLEANING`
- Validate inspection and remediation paths
- Validate return to `READY`
- Complete authorization/access-control review
- Complete performance and UAT validation
- Freeze an immutable pilot release/tag
- Deploy a versioned Web App
- Validate direct `/exec` access before Google Sites embedding

Future capabilities can include richer OTA/channel-manager integration, public booking, guest self-service, payments, owner-facing functionality, and migration from Sheets when stronger transactional guarantees are required.

## Design principles

- **Operations first:** calendar availability alone does not make a unit sellable.
- **Domain ownership:** services own business rules; UI code does not.
- **Workflow orchestration:** multi-domain transitions are coordinated explicitly.
- **Auditability:** important state changes are traceable.
- **Integrity before convenience:** inconsistent data should fail loudly.
- **Idempotent setup:** environment bootstrap should be safe to rerun.
- **Controlled releases:** Git commit, Apps Script version, and deployment should remain traceable.
- **Simple infrastructure:** Google Sheets and Apps Script keep the MVP operationally lightweight while preserving clear service boundaries.

## License

No license should be assumed from this README. Add the repository's chosen license as a separate `LICENSE` file and reference it here once committed.
