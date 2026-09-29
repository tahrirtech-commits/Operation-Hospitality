/**
 * ============================================================
 * 02_IdService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Centralized stable ID generation.
 *
 * Examples:
 *
 * PROP-000001
 * UNIT-000001
 * LOC-000001
 * CUST-000001
 * GST-000001
 * STF-000001
 * RES-000001
 * EXT-000001
 * OTAB-000001
 * AUD-000001
 *
 * Sequence values are stored in ScriptProperties:
 *
 * SEQ_PROPERTY
 * SEQ_UNIT
 * SEQ_LOCATION
 * ...
 *
 * IMPORTANT:
 *
 * - IDs are never reused.
 * - Sequence initialization never decreases a sequence.
 * - nextId() uses ScriptLock to prevent duplicate IDs.
 *
 * ============================================================
 */

const IdService = (() => {
  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  function normalizeEntityType(entityType) {
    if (
      entityType === undefined ||
      entityType === null ||
      String(entityType).trim() === ""
    ) {
      throw new Error("entityType is required.");
    }

    return String(entityType).trim().toUpperCase();
  }

  function getPrefix(entityType) {
    const normalized = normalizeEntityType(entityType);

    const prefix = CONFIG.ID_PREFIXES[normalized];

    if (!prefix) {
      throw new Error("No ID prefix configured for entity type: " + normalized);
    }

    return String(prefix).trim().toUpperCase();
  }

  function getSequencePropertyKey(entityType) {
    const normalized = normalizeEntityType(entityType);

    const propertyPrefix =
      CONFIG.ID && CONFIG.ID.SEQUENCE_PROPERTY_PREFIX
        ? CONFIG.ID.SEQUENCE_PROPERTY_PREFIX
        : "SEQ_";

    return propertyPrefix + normalized;
  }

  function getPadding() {
    if (CONFIG.ID && CONFIG.ID.PADDING) {
      return Number(CONFIG.ID.PADDING);
    }

    return 6;
  }

  /**
   * ==========================================================
   * NEXT ID
   * ==========================================================
   */

  function nextId(entityType) {
    const normalized = normalizeEntityType(entityType);

    const prefix = getPrefix(normalized);

    const key = getSequencePropertyKey(normalized);

    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(10000);

      const properties = PropertiesService.getScriptProperties();

      const storedValue = properties.getProperty(key);

      let current = Number(storedValue || 0);

      if (isNaN(current) || current < 0) {
        throw new Error(
          "Invalid stored sequence for " + normalized + ": " + storedValue,
        );
      }

      current++;

      properties.setProperty(key, String(current));

      return prefix + "-" + String(current).padStart(getPadding(), "0");
    } finally {
      if (lock.hasLock()) {
        lock.releaseLock();
      }
    }
  }

  /**
   * ==========================================================
   * CURRENT SEQUENCE
   * ==========================================================
   */

  function getCurrentSequence(entityType) {
    const normalized = normalizeEntityType(entityType);

    /*
     * Validate that the entity is configured.
     */

    getPrefix(normalized);

    const key = getSequencePropertyKey(normalized);

    const value = PropertiesService.getScriptProperties().getProperty(key);

    const number = Number(value || 0);

    if (isNaN(number) || number < 0) {
      throw new Error(
        "Invalid sequence value for " + normalized + ": " + value,
      );
    }

    return number;
  }

  /**
   * ==========================================================
   * SET SEQUENCE
   * ==========================================================
   */

  function setSequence(entityType, value) {
    const normalized = normalizeEntityType(entityType);

    /*
     * Validate configured entity.
     */

    getPrefix(normalized);

    const number = Number(value);

    if (isNaN(number) || number < 0 || !Number.isInteger(number)) {
      throw new Error(
        "Sequence must be a non-negative integer for " + normalized + ".",
      );
    }

    const key = getSequencePropertyKey(normalized);

    PropertiesService.getScriptProperties().setProperty(key, String(number));

    return number;
  }

  /**
   * ==========================================================
   * EXTRACT SEQUENCE FROM ID
   * ==========================================================
   *
   * Example:
   *
   * UNIT-000123
   *
   * returns:
   *
   * 123
   *
   * Invalid IDs return null.
   */

  function extractSequence(entityType, id) {
    if (id === undefined || id === null || String(id).trim() === "") {
      return null;
    }

    const normalized = normalizeEntityType(entityType);

    const prefix = getPrefix(normalized);

    const value = String(id).trim().toUpperCase();

    const expectedPrefix = prefix + "-";

    if (!value.startsWith(expectedPrefix)) {
      return null;
    }

    const sequencePart = value.substring(expectedPrefix.length);

    if (!/^\d+$/.test(sequencePart)) {
      return null;
    }

    const number = Number(sequencePart);

    if (isNaN(number)) {
      return null;
    }

    return number;
  }

  /**
   * ==========================================================
   * MAX SEQUENCE IN SHEET
   * ==========================================================
   */

  function getMaxSequenceFromSheet(entityType, sheetName, idField) {
    const normalized = normalizeEntityType(entityType);

    const records = BaseRepository.findAll(sheetName);

    let max = 0;

    records.forEach((record) => {
      const sequence = extractSequence(normalized, record[idField]);

      if (sequence !== null && sequence > max) {
        max = sequence;
      }
    });

    return max;
  }

  /**
   * ==========================================================
   * INITIALIZE ONE SEQUENCE FROM SHEET
   * ==========================================================
   *
   * Important:
   *
   * Sequence is NEVER decreased.
   *
   * Example:
   *
   * ScriptProperties = 150
   * Sheet max        = 120
   *
   * Result = 150
   *
   * This prevents ID reuse after records have been deleted.
   */

  function initializeFromSheet(entityType, sheetName, idField) {
    const normalized = normalizeEntityType(entityType);

    const stored = getCurrentSequence(normalized);

    const sheetMax = getMaxSequenceFromSheet(normalized, sheetName, idField);

    const target = Math.max(stored, sheetMax);

    if (target !== stored) {
      setSequence(normalized, target);
    }

    return target;
  }

  /**
   * ==========================================================
   * ENTITY DEFINITIONS
   * ==========================================================
   *
   * These are the entities currently using generated IDs
   * during Phase 1 + Phase 2.
   */

  function getManagedEntities() {
    return [
      /*
       * ======================================================
       * PHASE 1
       * ======================================================
       */

      {
        type: "PROPERTY",

        sheet: CONFIG.SHEETS.PROPERTIES,

        field: "property_id",
      },

      {
        type: "UNIT",

        sheet: CONFIG.SHEETS.UNITS,

        field: "unit_id",
      },

      {
        type: "LOCATION",

        sheet: CONFIG.SHEETS.LOCATIONS,

        field: "location_id",
      },

      {
        type: "CUSTOMER",

        sheet: CONFIG.SHEETS.CUSTOMERS,

        field: "customer_id",
      },

      {
        type: "GUEST",

        sheet: CONFIG.SHEETS.GUESTS,

        field: "guest_id",
      },

      {
        type: "STAFF",

        sheet: CONFIG.SHEETS.STAFF,

        field: "staff_id",
      },

      /*
       * ======================================================
       * PHASE 2
       * ======================================================
       */

      {
        type: "RESERVATION",

        sheet: CONFIG.SHEETS.RESERVATIONS,

        field: "reservation_id",
      },
      {
        type: "RESERVATION_GUEST",

        sheet: CONFIG.SHEETS.RESERVATION_GUESTS,

        field: "reservation_guest_id",
      },

      {
        type: "HOUSEKEEPING_TASK",

        sheet: CONFIG.SHEETS.HOUSEKEEPING_TASKS,

        field: "task_id",
      },

      {
        type: "HOUSEKEEPING_SCHEDULE",
        sheet: CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES,
        field: "schedule_id",
      },
      {
        type: "MAINTENANCE_ASSET",
        sheet: CONFIG.SHEETS.MAINTENANCE_ASSETS,
        field: "asset_id",
      },
      {
        type: "MAINTENANCE_SCHEDULE",
        sheet: CONFIG.SHEETS.MAINTENANCE_SCHEDULES,
        field: "schedule_id",
      },
      {
        type: "MAINTENANCE_WORK_ORDER",
        sheet: CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
        field: "work_order_id",
      },
      {
        type: "EXTERNAL_CALENDAR_EVENT",

        sheet: CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS,

        field: "external_event_id",
      },

      {
        type: "OTA_BLOCK",

        sheet: CONFIG.SHEETS.OTA_BLOCKS,

        field: "ota_block_id",
      },

      {
        type: "INSPECTION",
        sheet: CONFIG.SHEETS.INSPECTIONS,
        field: "inspection_id",
      },
      {
        type: "INSPECTION_CHECKLIST_ITEM",
        sheet: CONFIG.SHEETS.INSPECTION_CHECKLIST,
        field: "checklist_item_id",
      },

      /*
       * ======================================================
       * PHASE 4 - INVENTORY
       * ======================================================
       */

      {
        type: "INVENTORY_ITEM",
        sheet: CONFIG.SHEETS.INVENTORY_ITEMS,
        field: "item_id",
      },

      {
        type: "INVENTORY_LOCATION",
        sheet: CONFIG.SHEETS.INVENTORY_LOCATIONS,
        field: "location_id",
      },

      {
        type: "INVENTORY_STOCK",
        sheet: CONFIG.SHEETS.INVENTORY_STOCK,
        field: "stock_id",
      },

      {
        type: "INVENTORY_TRANSACTION",
        sheet: CONFIG.SHEETS.INVENTORY_TRANSACTIONS,
        field: "transaction_id",
      },
      {
        type: "OPERATING_EXPENSE",
        sheet: CONFIG.SHEETS.OPERATING_EXPENSES,
        field: "expense_id",
      },

      {
        type: "UTILITY",
        sheet: CONFIG.SHEETS.UTILITIES,
        field: "utility_id",
      },
      {
        type: "UTILITY_BILL",
        sheet: CONFIG.SHEETS.UTILITY_BILLS,
        field: "bill_id",
      },
      {
        type: "INTERNET_SERVICE",
        sheet: CONFIG.SHEETS.INTERNET_SERVICES,
        field: "internet_service_id",
      },

      /*
       * ======================================================
       * SYSTEM
       * ======================================================
       */

      {
        type: "AUDIT",

        sheet: CONFIG.SHEETS.AUDIT_LOG,

        field: "audit_id",
      },
    ];
  }

  /**
   * ==========================================================
   * INITIALIZE ALL
   * ==========================================================
   */

  function initializeAll() {
    const result = {};

    getManagedEntities().forEach((entity) => {
      result[entity.type] = initializeFromSheet(
        entity.type,
        entity.sheet,
        entity.field,
      );
    });

    return result;
  }

  /**
   * ==========================================================
   * GET ALL STORED SEQUENCES
   * ==========================================================
   */

  function getAllSequences() {
    const properties = PropertiesService.getScriptProperties().getProperties();

    const result = {};

    const propertyPrefix =
      CONFIG.ID && CONFIG.ID.SEQUENCE_PROPERTY_PREFIX
        ? CONFIG.ID.SEQUENCE_PROPERTY_PREFIX
        : "SEQ_";

    Object.keys(properties).forEach((key) => {
      if (key.startsWith(propertyPrefix)) {
        const entityType = key.substring(propertyPrefix.length);

        result[entityType] = Number(properties[key]);
      }
    });

    return result;
  }

  /**
   * ==========================================================
   * SEQUENCE STATUS
   * ==========================================================
   *
   * Useful for:
   *
   * IntegrityCheckService
   * Admin diagnostics
   * Tests
   *
   * Returns:
   *
   * {
   *   entity_type: "UNIT",
   *   prefix: "UNIT",
   *   stored_sequence: 12,
   *   sheet_max_sequence: 12,
   *   valid: true
   * }
   */

  function getSequenceStatus(entityType, sheetName, idField) {
    const normalized = normalizeEntityType(entityType);

    /*
     * If sheetName/idField are not provided,
     * try resolving them from managed entities.
     */

    if (!sheetName || !idField) {
      const definition = getManagedEntities().find(
        (entity) => entity.type === normalized,
      );

      if (!definition) {
        throw new Error(
          "No managed entity definition found for: " + normalized,
        );
      }

      sheetName = sheetName || definition.sheet;

      idField = idField || definition.field;
    }

    const stored = getCurrentSequence(normalized);

    const sheetMax = getMaxSequenceFromSheet(normalized, sheetName, idField);

    return {
      entity_type: normalized,

      prefix: getPrefix(normalized),

      stored_sequence: stored,

      sheet_max_sequence: sheetMax,

      valid: stored >= sheetMax,
    };
  }

  /**
   * ==========================================================
   * GET ALL SEQUENCE STATUSES
   * ==========================================================
   */

  function getAllSequenceStatuses() {
    return getManagedEntities().map((entity) =>
      getSequenceStatus(entity.type, entity.sheet, entity.field),
    );
  }

  /**
   * ==========================================================
   * REPAIR / SYNC SEQUENCES
   * ==========================================================
   *
   * Safe repair:
   *
   * - Raises sequences when sheet max is higher.
   * - Never lowers sequences.
   */

  function synchronizeAllSequences() {
    const before = getAllSequenceStatuses();

    const initialized = initializeAll();

    const after = getAllSequenceStatuses();

    return {
      before: before,

      initialized: initialized,

      after: after,
    };
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    nextId,

    getCurrentSequence,

    setSequence,

    extractSequence,

    getMaxSequenceFromSheet,

    initializeFromSheet,

    initializeAll,

    getManagedEntities,

    getAllSequences,

    getSequenceStatus,

    getAllSequenceStatuses,

    synchronizeAllSequences,
  };
})();
