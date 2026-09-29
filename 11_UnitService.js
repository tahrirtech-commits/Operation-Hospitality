/**
 * ============================================================
 * 11_UnitService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Domain service for Units.
 *
 * Responsibilities:
 *
 * - Create units
 * - Read units
 * - Update units
 * - Change unit master status
 * - Access unit operational status
 * - Delegate operational-status changes to
 *   OperationalStatusService
 *
 * Master status:
 *
 *   02_Units.status
 *      ACTIVE / INACTIVE
 *
 * Operational status:
 *
 *   23_UnitOperationalStatus.operational_status
 *      READY
 *      RESERVED
 *      OCCUPIED
 *      DIRTY
 *      CLEANING
 *      INSPECTION
 *      MAINTENANCE
 *      OUT_OF_SERVICE
 *      BLOCKED
 *
 * IMPORTANT:
 *
 * UnitService does NOT directly manipulate
 * 23_UnitOperationalStatus.
 *
 * That responsibility belongs to:
 *
 * OperationalStatusService
 *
 * ============================================================
 */

const UnitService = (() => {
  const ENTITY_TYPE = "UNIT";

  const DEFAULT_STATUS = CONFIG.DEFAULTS.UNIT_STATUS || "ACTIVE";

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
   * NORMALIZE UNIT
   * ----------------------------------------------------------
   *
   * Normalization occurs before validation and persistence.
   */

  function normalizeUnit(data) {
    const unit = Object.assign({}, data || {});

    if (unit.property_id !== undefined && unit.property_id !== null) {
      unit.property_id = String(unit.property_id).trim();
    }

    if (unit.unit_code !== undefined && unit.unit_code !== null) {
      unit.unit_code = String(unit.unit_code).trim().toUpperCase();
    }

    if (unit.unit_name !== undefined && unit.unit_name !== null) {
      unit.unit_name = String(unit.unit_name).trim();
    }

    if (unit.unit_type !== undefined && unit.unit_type !== null) {
      unit.unit_type = String(unit.unit_type).trim().toUpperCase();
    }

    if (unit.status !== undefined && unit.status !== null) {
      unit.status = String(unit.status).trim().toUpperCase();
    }

    if (unit.view_type !== undefined && unit.view_type !== null) {
      unit.view_type = String(unit.view_type).trim().toUpperCase();
    }

    return unit;
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE ACTOR
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
   * REQUIRE UNIT
   * ----------------------------------------------------------
   */

  function requireUnit(unitId) {
    if (
      unitId === undefined ||
      unitId === null ||
      String(unitId).trim() === ""
    ) {
      throw new Error("unitId is required.");
    }

    const normalizedId = String(unitId).trim();

    const unit = BaseRepository.findById(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      normalizedId,
    );

    if (!unit) {
      throw new Error("Unit not found: " + normalizedId);
    }

    return unit;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE NUMERIC FIELDS
   * ----------------------------------------------------------
   */

  function validateNumericFields(unit) {
    const fields = [
      "bedrooms",
      "bathrooms",
      "max_adults",
      "max_children",
      "max_guests",
      "area_sqm",
      "floor_number",
    ];

    fields.forEach((fieldName) => {
      ValidationService.validateNonNegativeNumber(unit[fieldName], fieldName);
    });

    return true;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE UPDATE
   * ----------------------------------------------------------
   */

  function validateUpdate(unit) {
    ValidationService.requireFields(unit, [
      "unit_id",
      "property_id",
      "unit_code",
      "unit_name",
      "unit_type",
      "status",
    ]);

    ValidationService.validatePropertyExists(unit.property_id);

    ValidationService.validateReference("UNIT_TYPE", unit.unit_type);

    ValidationService.validateReference("UNIT_STATUS", unit.status);

    ValidationService.validateUniqueExcept(
      CONFIG.SHEETS.UNITS,
      "unit_code",
      unit.unit_code,
      "unit_id",
      unit.unit_id,
      "Unit code",
    );

    validateNumericFields(unit);

    return true;
  }

  /**
   * ----------------------------------------------------------
   * ROLLBACK UNIT INSERT
   * ----------------------------------------------------------
   *
   * Used only when unit creation succeeds but creation of its
   * initial operational status fails.
   *
   * This prevents:
   *
   * Unit exists
   * +
   * No operational status
   *
   * from becoming a permanent inconsistent state.
   */

  function rollbackUnitInsert(unitId) {
    const rowNumber = BaseRepository.findRowNumberById(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      unitId,
    );

    if (rowNumber === -1) {
      return false;
    }

    BaseRepository.getSheet(CONFIG.SHEETS.UNITS).deleteRow(rowNumber);

    return true;
  }

  /**
   * ==========================================================
   * CREATE
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CREATE UNIT
   * ----------------------------------------------------------
   *
   * Flow:
   *
   * Input
   *   ↓
   * Normalize
   *   ↓
   * Default master status
   *   ↓
   * Validate
   *   ↓
   * Generate unit ID
   *   ↓
   * Insert 02_Units
   *   ↓
   * Create initial operational status
   *   ↓
   * Audit
   *
   * If initial operational-status creation fails, the newly
   * inserted unit is rolled back.
   */

  function createUnit(data, actorId) {
    if (!data || typeof data !== "object") {
      throw new Error("Unit data is required.");
    }

    const normalizedActorId = normalizeActorId(actorId);

    let unit = normalizeUnit(data);

    /*
     * Apply default master status.
     */

    if (ValidationService.isBlank(unit.status)) {
      unit.status = DEFAULT_STATUS;
    }

    /*
     * IMPORTANT:
     *
     * Validation occurs before ID generation.
     */

    ValidationService.validateUnitCreate(unit);

    /*
     * Generate stable unit ID.
     */

    unit.unit_id = IdService.nextId(ENTITY_TYPE);

    const now = timestamp();

    unit.created_at = unit.created_at || now;

    unit.updated_at = now;

    /*
     * Insert master unit record.
     */

    const insertedUnit = BaseRepository.insert(CONFIG.SHEETS.UNITS, unit);

    /*
     * Create physical operational state.
     *
     * OperationalStatusService is intentionally responsible
     * for 23_UnitOperationalStatus.
     */

    try {
      OperationalStatusService.createInitialStatus(
        insertedUnit.unit_id,
        normalizedActorId,
      );
    } catch (error) {
      /*
       * Compensating rollback.
       */

      try {
        rollbackUnitInsert(insertedUnit.unit_id);
      } catch (rollbackError) {
        throw new Error(
          "Failed to create operational status for " +
            insertedUnit.unit_id +
            ". Unit rollback also failed. " +
            "Original error: " +
            error.message +
            ". Rollback error: " +
            rollbackError.message,
        );
      }

      throw new Error(
        "Unit creation rolled back because initial " +
          "operational status could not be created. " +
          "Reason: " +
          error.message,
      );
    }

    /*
     * Audit successful creation.
     */

    AuditService.logCreate(
      ENTITY_TYPE,
      insertedUnit.unit_id,
      insertedUnit,
      normalizedActorId,
    );

    return insertedUnit;
  }

  /**
   * ==========================================================
   * READ
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GET UNIT BY ID
   * ----------------------------------------------------------
   *
   * Returns null when not found.
   */

  function getUnitById(unitId) {
    if (
      unitId === undefined ||
      unitId === null ||
      String(unitId).trim() === ""
    ) {
      throw new Error("unitId is required.");
    }

    return BaseRepository.findById(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      String(unitId).trim(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET UNIT BY CODE
   * ----------------------------------------------------------
   */

  function getUnitByCode(unitCode) {
    if (
      unitCode === undefined ||
      unitCode === null ||
      String(unitCode).trim() === ""
    ) {
      throw new Error("unitCode is required.");
    }

    return BaseRepository.findOneByField(
      CONFIG.SHEETS.UNITS,
      "unit_code",
      String(unitCode).trim().toUpperCase(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET ALL UNITS
   * ----------------------------------------------------------
   */

  function getAllUnits() {
    return BaseRepository.findAll(CONFIG.SHEETS.UNITS);
  }

  /**
   * ----------------------------------------------------------
   * GET UNITS BY PROPERTY
   * ----------------------------------------------------------
   */

  function getUnitsByProperty(propertyId) {
    ValidationService.validatePropertyExists(propertyId);

    return BaseRepository.findByField(
      CONFIG.SHEETS.UNITS,
      "property_id",
      String(propertyId).trim(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET UNIT WITH OPERATIONAL STATUS
   * ----------------------------------------------------------
   *
   * Returns:
   *
   * {
   *   unit: {...},
   *   operational_status: {...}
   * }
   */

  function getUnitWithOperationalStatus(unitId) {
    const unit = requireUnit(unitId);

    const operationalStatus = OperationalStatusService.getStatus(unit.unit_id);

    return {
      unit: unit,

      operational_status: operationalStatus,
    };
  }

  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * UPDATE UNIT
   * ----------------------------------------------------------
   *
   * Stable fields protected:
   *
   * unit_id
   * created_at
   */

  function updateUnit(unitId, changes, actorId) {
    if (!changes || typeof changes !== "object") {
      throw new Error("Unit changes are required.");
    }

    const existing = requireUnit(unitId);

    const normalizedActorId = normalizeActorId(actorId);

    /*
     * Merge existing record with changes.
     */

    let updated = Object.assign({}, existing, changes);

    /*
     * Protect stable fields.
     */

    updated.unit_id = existing.unit_id;

    updated.created_at = existing.created_at;

    updated = normalizeUnit(updated);

    /*
     * Validate complete resulting state.
     */

    validateUpdate(updated);

    updated.updated_at = timestamp();

    const persisted = BaseRepository.update(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      existing.unit_id,
      updated,
    );

    /*
     * Generic update audit.
     */

    AuditService.logUpdate(
      ENTITY_TYPE,
      existing.unit_id,
      existing,
      persisted,
      normalizedActorId,
    );

    return persisted;
  }

  /**
   * ==========================================================
   * MASTER STATUS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CHANGE UNIT MASTER STATUS
   * ----------------------------------------------------------
   *
   * This changes:
   *
   * 02_Units.status
   *
   * NOT:
   *
   * 23_UnitOperationalStatus.operational_status
   */

  function changeUnitStatus(unitId, newStatus, actorId) {
    const existing = requireUnit(unitId);

    const normalizedStatus = String(newStatus || "")
      .trim()
      .toUpperCase();

    ValidationService.validateReference("UNIT_STATUS", normalizedStatus);

    /*
     * No-op when status is already correct.
     */

    if (String(existing.status).trim().toUpperCase() === normalizedStatus) {
      return existing;
    }

    const normalizedActorId = normalizeActorId(actorId);

    const persisted = BaseRepository.update(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      existing.unit_id,
      {
        status: normalizedStatus,

        updated_at: timestamp(),
      },
    );

    /*
     * Status change receives its own specific audit event.
     */

    AuditService.logStatusChange(
      ENTITY_TYPE,
      existing.unit_id,
      existing.status,
      normalizedStatus,
      normalizedActorId,
    );

    return persisted;
  }

  /**
   * ==========================================================
   * OPERATIONAL STATUS DELEGATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GET OPERATIONAL STATUS
   * ----------------------------------------------------------
   */

  function getOperationalStatus(unitId) {
    /*
     * Confirm unit exists first.
     */

    requireUnit(unitId);

    return OperationalStatusService.getStatus(String(unitId).trim());
  }

  /**
   * ----------------------------------------------------------
   * CHANGE OPERATIONAL STATUS
   * ----------------------------------------------------------
   *
   * Delegates physical readiness to
   * OperationalStatusService.
   */

  function changeOperationalStatus(
    unitId,
    newStatus,
    reason,
    actorId,
    expectedReadyAt,
  ) {
    /*
     * Confirm master unit exists.
     */

    requireUnit(unitId);

    return OperationalStatusService.changeStatus(
      String(unitId).trim(),
      newStatus,
      reason,
      normalizeActorId(actorId),
      expectedReadyAt,
    );
  }

  /**
   * ==========================================================
   * CONVENIENCE QUERIES
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GET ACTIVE UNITS
   * ----------------------------------------------------------
   */

  function getActiveUnits() {
    return BaseRepository.findByField(CONFIG.SHEETS.UNITS, "status", "ACTIVE");
  }

  /**
   * ----------------------------------------------------------
   * GET INACTIVE UNITS
   * ----------------------------------------------------------
   */

  function getInactiveUnits() {
    return BaseRepository.findByField(
      CONFIG.SHEETS.UNITS,
      "status",
      "INACTIVE",
    );
  }

  /**
   * ----------------------------------------------------------
   * UNIT EXISTS
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

    return BaseRepository.exists(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      String(unitId).trim(),
    );
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    createUnit,

    getUnitById,

    getUnitByCode,

    getAllUnits,

    getUnitsByProperty,

    getUnitWithOperationalStatus,

    getActiveUnits,

    getInactiveUnits,

    exists,

    updateUnit,

    changeUnitStatus,

    getOperationalStatus,

    changeOperationalStatus,
  };
})();
