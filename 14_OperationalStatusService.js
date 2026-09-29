/**
 * ============================================================
 * 14_OperationalStatusService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Domain service for Unit Operational Status.
 *
 * Data source:
 *
 * 23_UnitOperationalStatus
 *
 * Responsibilities:
 *
 * - Create initial operational status for a unit
 * - Read current operational status
 * - Change operational status
 * - Track reason / status_since / expected_ready_at
 * - Audit operational-status creation and changes
 * - Query units by operational status
 *
 * IMPORTANT:
 *
 * Unit master status and operational status are different.
 *
 * 02_Units.status
 *     ACTIVE / INACTIVE
 *
 * 23_UnitOperationalStatus.operational_status
 *     READY
 *     RESERVED
 *     OCCUPIED
 *     DIRTY
 *     CLEANING
 *     INSPECTION
 *     MAINTENANCE
 *     OUT_OF_SERVICE
 *     BLOCKED
 *
 * Availability must eventually consider BOTH:
 *
 * Calendar availability
 * +
 * Unit operational status == READY
 *
 * ============================================================
 */

const OperationalStatusService = (() => {
  const ENTITY_TYPE = "UNIT_OPERATIONAL_STATUS";

  const DEFAULT_STATUS = CONFIG.DEFAULTS.OPERATIONAL_STATUS || "READY";

  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * TIMESTAMP
   * ----------------------------------------------------------
   */

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE ACTOR ID
   * ----------------------------------------------------------
   */

  function normalizeActorId(actorId) {
    if (
      actorId === undefined ||
      actorId === null ||
      String(actorId).trim() === ""
    ) {
      return CONFIG.DEFAULTS.ACTOR_ID;
    }

    return String(actorId).trim();
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE UNIT ID
   * ----------------------------------------------------------
   */

  function normalizeUnitId(unitId) {
    if (
      unitId === undefined ||
      unitId === null ||
      String(unitId).trim() === ""
    ) {
      throw new Error("unitId is required.");
    }

    return String(unitId).trim();
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE STATUS
   * ----------------------------------------------------------
   */

  function normalizeStatus(status) {
    if (
      status === undefined ||
      status === null ||
      String(status).trim() === ""
    ) {
      throw new Error("Operational status is required.");
    }

    return String(status).trim().toUpperCase();
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE OPTIONAL TEXT
   * ----------------------------------------------------------
   */

  function normalizeText(value) {
    if (value === undefined || value === null) {
      return "";
    }

    return String(value).trim();
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE EXPECTED READY AT
   * ----------------------------------------------------------
   *
   * Phase 1 intentionally accepts:
   *
   * - blank
   * - Date
   * - string
   *
   * We do not impose reservation/date logic here.
   */

  function normalizeExpectedReadyAt(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return "";
    }

    if (value instanceof Date) {
      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE,
        CONFIG.DATE_FORMATS.DATETIME,
      );
    }

    return String(value).trim();
  }

  /**
   * ----------------------------------------------------------
   * REQUIRE UNIT
   * ----------------------------------------------------------
   */

  function requireUnit(unitId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    const unit = BaseRepository.findById(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      normalizedUnitId,
    );

    if (!unit) {
      throw new Error("Unit not found: " + normalizedUnitId);
    }

    return unit;
  }

  /**
   * ----------------------------------------------------------
   * FIND STATUS RECORD
   * ----------------------------------------------------------
   */

  function findStatusRecord(unitId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    return BaseRepository.findOneByField(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      "unit_id",
      normalizedUnitId,
    );
  }

  /**
   * ----------------------------------------------------------
   * REQUIRE STATUS RECORD
   * ----------------------------------------------------------
   */

  function requireStatusRecord(unitId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    const record = findStatusRecord(normalizedUnitId);

    if (!record) {
      throw new Error(
        "Operational status record not found for unit: " + normalizedUnitId,
      );
    }

    return record;
  }

  /**
   * ----------------------------------------------------------
   * ASSERT SINGLE STATUS RECORD
   * ----------------------------------------------------------
   *
   * There must be exactly one operational-status record
   * per unit.
   */

  function assertSingleStatusRecord(unitId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    const records = BaseRepository.findByField(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      "unit_id",
      normalizedUnitId,
    );

    if (records.length > 1) {
      throw new Error(
        "Data integrity error: multiple operational status " +
          "records found for unit " +
          normalizedUnitId,
      );
    }

    return records.length;
  }

  /**
   * ==========================================================
   * CREATE INITIAL STATUS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CREATE INITIAL STATUS
   * ----------------------------------------------------------
   *
   * Called by UnitService.createUnit().
   *
   * Initial state:
   *
   * operational_status = READY
   * status_reason      = New unit
   * status_since       = now
   * expected_ready_at  = blank
   *
   * Only one status row may exist per unit.
   */

  function createInitialStatus(unitId, actorId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    /*
     * Unit must exist first.
     */

    requireUnit(normalizedUnitId);

    /*
     * Protect one-row-per-unit invariant.
     */

    const existingCount = assertSingleStatusRecord(normalizedUnitId);

    if (existingCount > 0) {
      throw new Error(
        "Operational status already exists for unit: " + normalizedUnitId,
      );
    }

    const normalizedActorId = normalizeActorId(actorId);

    const initialStatus = normalizeStatus(DEFAULT_STATUS);

    /*
     * Validate READY against ReferenceData.
     */

    ValidationService.validateOperationalStatus(initialStatus);

    const now = timestamp();

    const record = {
      unit_id: normalizedUnitId,

      operational_status: initialStatus,

      status_reason: "New unit",

      status_since: now,

      expected_ready_at: "",

      updated_by: normalizedActorId,

      updated_at: now,
    };

    const inserted = BaseRepository.insert(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      record,
    );

    AuditService.logCreate(
      ENTITY_TYPE,
      normalizedUnitId,
      inserted,
      normalizedActorId,
    );

    return inserted;
  }

  /**
   * ==========================================================
   * READ
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GET STATUS
   * ----------------------------------------------------------
   *
   * Returns null if no operational-status row exists.
   *
   * Throws if duplicate rows exist.
   */

  function getStatus(unitId) {
    const normalizedUnitId = normalizeUnitId(unitId);

    /*
     * Ensure referenced unit exists.
     */

    requireUnit(normalizedUnitId);

    assertSingleStatusRecord(normalizedUnitId);

    return findStatusRecord(normalizedUnitId);
  }

  /**
   * ----------------------------------------------------------
   * GET ALL STATUSES
   * ----------------------------------------------------------
   */

  function getAllStatuses() {
    return BaseRepository.findAll(CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS);
  }

  /**
   * ----------------------------------------------------------
   * GET UNITS BY OPERATIONAL STATUS
   * ----------------------------------------------------------
   */

  function getByStatus(status) {
    const normalizedStatus = normalizeStatus(status);

    ValidationService.validateOperationalStatus(normalizedStatus);

    return BaseRepository.findByField(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      "operational_status",
      normalizedStatus,
    );
  }

  /**
   * ----------------------------------------------------------
   * GET READY UNITS
   * ----------------------------------------------------------
   */

  function getReadyUnits() {
    return getByStatus("READY");
  }

  /**
   * ----------------------------------------------------------
   * GET NON-READY UNITS
   * ----------------------------------------------------------
   */

  function getNonReadyUnits() {
    return getAllStatuses().filter(
      (record) =>
        String(record.operational_status || "")
          .trim()
          .toUpperCase() !== "READY",
    );
  }

  /**
   * ----------------------------------------------------------
   * STATUS EXISTS
   * ----------------------------------------------------------
   */

  function exists(unitId) {
    if (
      unitId === undefined ||
      unitId === null ||
      String(unitId).trim() === ""
    ) {
      return false;
    }

    const normalizedUnitId = String(unitId).trim();

    return BaseRepository.exists(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      "unit_id",
      normalizedUnitId,
    );
  }

  /**
   * ==========================================================
   * CHANGE STATUS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CHANGE STATUS
   * ----------------------------------------------------------
   *
   * Parameters:
   *
   * unitId
   * newStatus
   * reason
   * actorId
   * expectedReadyAt
   *
   * Example:
   *
   * OperationalStatusService.changeStatus(
   *   'UNIT-000001',
   *   'CLEANING',
   *   'Checkout cleaning',
   *   'STF-000003',
   *   '2026-09-26 14:00:00'
   * );
   */

  function changeStatus(unitId, newStatus, reason, actorId, expectedReadyAt) {
    const normalizedUnitId = normalizeUnitId(unitId);

    /*
     * Ensure unit exists.
     */

    requireUnit(normalizedUnitId);

    /*
     * Ensure exactly one status row exists.
     */

    assertSingleStatusRecord(normalizedUnitId);

    const existing = requireStatusRecord(normalizedUnitId);

    const normalizedStatus = normalizeStatus(newStatus);

    ValidationService.validateOperationalStatus(normalizedStatus);

    const normalizedActorId = normalizeActorId(actorId);

    const normalizedReason = normalizeText(reason);

    const normalizedExpectedReadyAt = normalizeExpectedReadyAt(expectedReadyAt);

    const oldStatus = String(existing.operational_status || "")
      .trim()
      .toUpperCase();

    /*
     * --------------------------------------------------------
     * NO-OP CASE
     * --------------------------------------------------------
     *
     * If status, reason and expected_ready_at are all unchanged,
     * avoid unnecessary Sheet writes and audit entries.
     */

    const sameStatus = oldStatus === normalizedStatus;

    const sameReason =
      normalizeText(existing.status_reason) === normalizedReason;

    const sameExpectedReadyAt =
      normalizeExpectedReadyAt(existing.expected_ready_at) ===
      normalizedExpectedReadyAt;

    if (sameStatus && sameReason && sameExpectedReadyAt) {
      return existing;
    }

    const now = timestamp();

    const changes = {
      operational_status: normalizedStatus,

      status_reason: normalizedReason,

      expected_ready_at: normalizedExpectedReadyAt,

      updated_by: normalizedActorId,

      updated_at: now,
    };

    /*
     * status_since changes ONLY when operational_status changes.
     *
     * Updating only the reason or expected-ready time must not
     * falsely reset the time the unit entered its current state.
     */

    if (!sameStatus) {
      changes.status_since = now;
    }

    const persisted = BaseRepository.update(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      "unit_id",
      normalizedUnitId,
      changes,
    );

    /*
     * Differentiate actual status transition from metadata-only
     * update.
     */

    if (!sameStatus) {
      AuditService.logStatusChange(
        ENTITY_TYPE,
        normalizedUnitId,

        {
          operational_status: existing.operational_status,

          status_reason: existing.status_reason,

          status_since: existing.status_since,

          expected_ready_at: existing.expected_ready_at,
        },

        {
          operational_status: persisted.operational_status,

          status_reason: persisted.status_reason,

          status_since: persisted.status_since,

          expected_ready_at: persisted.expected_ready_at,
        },

        normalizedActorId,
      );
    } else {
      AuditService.logUpdate(
        ENTITY_TYPE,
        normalizedUnitId,
        existing,
        persisted,
        normalizedActorId,
      );
    }

    return persisted;
  }

  /**
   * ==========================================================
   * CONVENIENCE STATUS METHODS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * MARK READY
   * ----------------------------------------------------------
   */

  function markReady(unitId, reason, actorId) {
    return changeStatus(unitId, "READY", reason || "Unit ready", actorId, "");
  }

  /**
   * ----------------------------------------------------------
   * MARK RESERVED
   * ----------------------------------------------------------
   */

  function markReserved(unitId, reason, actorId) {
    return changeStatus(
      unitId,
      "RESERVED",
      reason || "Unit reserved",
      actorId,
      "",
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK OCCUPIED
   * ----------------------------------------------------------
   */

  function markOccupied(unitId, reason, actorId) {
    return changeStatus(
      unitId,
      "OCCUPIED",
      reason || "Guest checked in",
      actorId,
      "",
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK DIRTY
   * ----------------------------------------------------------
   */

  function markDirty(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "DIRTY",
      reason || "Unit requires cleaning",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK CLEANING
   * ----------------------------------------------------------
   */

  function markCleaning(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "CLEANING",
      reason || "Cleaning in progress",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK INSPECTION
   * ----------------------------------------------------------
   */

  function markInspection(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "INSPECTION",
      reason || "Inspection required",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK MAINTENANCE
   * ----------------------------------------------------------
   */

  function markMaintenance(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "MAINTENANCE",
      reason || "Maintenance required",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK OUT OF SERVICE
   * ----------------------------------------------------------
   */

  function markOutOfService(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "OUT_OF_SERVICE",
      reason || "Unit out of service",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ----------------------------------------------------------
   * MARK BLOCKED
   * ----------------------------------------------------------
   */

  function markBlocked(unitId, reason, actorId, expectedReadyAt) {
    return changeStatus(
      unitId,
      "BLOCKED",
      reason || "Unit blocked",
      actorId,
      expectedReadyAt,
    );
  }

  /**
   * ==========================================================
   * AVAILABILITY SUPPORT
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * IS OPERATIONALLY READY
   * ----------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This does NOT mean the unit is bookable.
   *
   * It means only that the unit is operationally READY.
   *
   * Phase 2 AvailabilityService will combine:
   *
   * 1. Calendar availability
   * 2. Reservation availability
   * 3. OTA blocks
   * 4. Operational readiness
   */

  function isOperationallyReady(unitId) {
    const status = getStatus(unitId);

    if (!status) {
      return false;
    }

    return (
      String(status.operational_status || "")
        .trim()
        .toUpperCase() === "READY"
    );
  }

  /**
   * ==========================================================
   * INTEGRITY SUPPORT
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * FIND UNITS WITHOUT STATUS
   * ----------------------------------------------------------
   *
   * Used by IntegrityCheckService.
   */

  function findUnitsWithoutStatus() {
    const units = BaseRepository.findAll(CONFIG.SHEETS.UNITS);

    const statuses = BaseRepository.findAll(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
    );

    const statusUnitIds = new Set(
      statuses.map((record) => String(record.unit_id || "").trim()),
    );

    return units.filter(
      (unit) => !statusUnitIds.has(String(unit.unit_id || "").trim()),
    );
  }

  /**
   * ----------------------------------------------------------
   * FIND ORPHAN STATUS RECORDS
   * ----------------------------------------------------------
   *
   * Operational-status rows whose unit no longer exists.
   */

  function findOrphanStatuses() {
    const units = BaseRepository.findAll(CONFIG.SHEETS.UNITS);

    const statuses = BaseRepository.findAll(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
    );

    const unitIds = new Set(
      units.map((unit) => String(unit.unit_id || "").trim()),
    );

    return statuses.filter(
      (record) => !unitIds.has(String(record.unit_id || "").trim()),
    );
  }

  /**
   * ----------------------------------------------------------
   * FIND DUPLICATE STATUS RECORDS
   * ----------------------------------------------------------
   *
   * There must be exactly one operational-status row per unit.
   */

  function findDuplicateStatuses() {
    const statuses = BaseRepository.findAll(
      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
    );

    const counts = {};

    statuses.forEach((record) => {
      const unitId = String(record.unit_id || "").trim();

      if (!unitId) {
        return;
      }

      counts[unitId] = (counts[unitId] || 0) + 1;
    });

    return Object.keys(counts)
      .filter((unitId) => counts[unitId] > 1)
      .map((unitId) => ({
        unit_id: unitId,

        count: counts[unitId],
      }));
  }

  /**
   * ----------------------------------------------------------
   * FIND INVALID STATUSES
   * ----------------------------------------------------------
   *
   * Returns operational-status rows whose status is not an
   * active OPERATIONAL_STATUS reference value.
   */

  function findInvalidStatuses() {
    const validStatuses =
      ValidationService.getReferenceValues("OPERATIONAL_STATUS");

    const allowed = new Set(
      validStatuses.map((value) => String(value).trim().toUpperCase()),
    );

    return getAllStatuses().filter((record) => {
      const status = String(record.operational_status || "")
        .trim()
        .toUpperCase();

      return !status || !allowed.has(status);
    });
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    createInitialStatus,

    getStatus,

    getAllStatuses,

    getByStatus,

    getReadyUnits,

    getNonReadyUnits,

    exists,

    changeStatus,

    markReady,

    markReserved,

    markOccupied,

    markDirty,

    markCleaning,

    markInspection,

    markMaintenance,

    markOutOfService,

    markBlocked,

    isOperationallyReady,

    findUnitsWithoutStatus,

    findOrphanStatuses,

    findDuplicateStatuses,

    findInvalidStatuses,
  };
})();
