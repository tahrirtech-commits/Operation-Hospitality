/**
 * ============================================================================
 * 56_InventoryTransactionService.gs
 * ============================================================================
 *
 * PHASE 4 - INVENTORY TRANSACTION / STOCK MOVEMENT DOMAIN
 *
 * Owns:
 *   - Immutable inventory movement ledger
 *   - RECEIPT
 *   - TRANSFER
 *   - CONSUMPTION
 *   - ADJUSTMENT_IN
 *   - ADJUSTMENT_OUT
 *   - DAMAGE
 *   - LOSS
 *   - RETURN
 *   - Controlled InventoryStock balance updates
 *
 * Depends on:
 *   55_InventoryService.gs
 *
 * Sheet:
 *   34_InventoryTransactions
 *
 * Core rules:
 *   1. Transaction quantity is always positive.
 *   2. Direction is determined by transaction_type.
 *   3. Transactions are append-only.
 *   4. Existing transaction rows are never updated/deleted by this service.
 *   5. Stock changes occur only while holding a ScriptLock.
 *   6. Negative stock is rejected.
 *   7. InventoryService.applyStockBalance() is the controlled stock projection
 *      bridge used by this service.
 *
 * Google Sheets is not transactional. If ledger insertion succeeds but a stock
 * projection update fails, the service throws an explicit reconciliation error.
 * ============================================================================
 */

const InventoryTransactionService = (() => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const ENTITY_TYPE = "INVENTORY_TRANSACTION";

  const SHEET = CONFIG.SHEETS.INVENTORY_TRANSACTIONS;

  const TRANSACTION_TYPE = {
    RECEIPT: "RECEIPT",
    TRANSFER: "TRANSFER",
    CONSUMPTION: "CONSUMPTION",
    ADJUSTMENT_IN: "ADJUSTMENT_IN",
    ADJUSTMENT_OUT: "ADJUSTMENT_OUT",
    DAMAGE: "DAMAGE",
    LOSS: "LOSS",
    RETURN: "RETURN",
  };

  const VALID_TRANSACTION_TYPES = new Set(Object.values(TRANSACTION_TYPE));

  // ==========================================================================
  // GENERIC HELPERS
  // ==========================================================================

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }

  function normalize(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim().toUpperCase();
  }

  function text(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  function normalizeActor(actorId) {
    return text(actorId || CONFIG.DEFAULTS.ACTOR_ID);
  }

  function positiveNumber(value, fieldName) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(fieldName + " must be a positive number.");
    }

    return number;
  }

  function nonNegativeNumber(value, fieldName, defaultValue) {
    if (isBlank(value)) {
      return defaultValue;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw new Error(fieldName + " must be a non-negative number.");
    }

    return number;
  }

  function executeWithLock(callback) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000);
    } catch (error) {
      throw new Error(
        "Unable to acquire inventory transaction lock: " + error.message,
      );
    }

    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  function validateTransactionType(value) {
    const normalized = normalize(value);

    if (!VALID_TRANSACTION_TYPES.has(normalized)) {
      throw new Error("Invalid inventory transaction type: " + value);
    }

    if (
      typeof ValidationService !== "undefined" &&
      typeof ValidationService.validateReference === "function"
    ) {
      ValidationService.validateReference(
        "INVENTORY_TRANSACTION_TYPE",
        normalized,
      );
    }

    return normalized;
  }

  function requireLocation(locationId, label) {
    if (isBlank(locationId)) {
      throw new Error((label || "location_id") + " is required.");
    }

    return InventoryService.requireLocation(text(locationId));
  }

  function validateReferenceRecord(sheetName, idField, idValue, label) {
    if (isBlank(idValue)) {
      return "";
    }

    const normalizedId = text(idValue);

    const record = BaseRepository.findById(sheetName, idField, normalizedId);

    if (!record) {
      throw new Error(label + " not found: " + normalizedId);
    }

    return normalizedId;
  }

  function validateOptionalReferences(input) {
    const unitId = validateReferenceRecord(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      input.unit_id,
      "Unit",
    );

    const reservationId = validateReferenceRecord(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      input.reservation_id,
      "Reservation",
    );

    const housekeepingTaskId = validateReferenceRecord(
      CONFIG.SHEETS.HOUSEKEEPING_TASKS,
      "task_id",
      input.housekeeping_task_id,
      "Housekeeping task",
    );

    const maintenanceWorkOrderId = validateReferenceRecord(
      CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
      "work_order_id",
      input.maintenance_work_order_id,
      "Maintenance work order",
    );

    if (reservationId && unitId) {
      const reservation = BaseRepository.findById(
        CONFIG.SHEETS.RESERVATIONS,
        "reservation_id",
        reservationId,
      );

      if (text(reservation.unit_id) !== unitId) {
        throw new Error(
          "Reservation " +
            reservationId +
            " does not belong to unit " +
            unitId +
            ".",
        );
      }
    }

    if (housekeepingTaskId && unitId) {
      const task = BaseRepository.findById(
        CONFIG.SHEETS.HOUSEKEEPING_TASKS,
        "task_id",
        housekeepingTaskId,
      );

      if (text(task.unit_id) !== unitId) {
        throw new Error(
          "Housekeeping task " +
            housekeepingTaskId +
            " does not belong to unit " +
            unitId +
            ".",
        );
      }
    }

    if (maintenanceWorkOrderId && unitId) {
      const workOrder = BaseRepository.findById(
        CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
        "work_order_id",
        maintenanceWorkOrderId,
      );

      if (text(workOrder.unit_id) !== unitId) {
        throw new Error(
          "Maintenance work order " +
            maintenanceWorkOrderId +
            " does not belong to unit " +
            unitId +
            ".",
        );
      }
    }

    return {
      unit_id: unitId,

      reservation_id: reservationId,

      housekeeping_task_id: housekeepingTaskId,

      maintenance_work_order_id: maintenanceWorkOrderId,
    };
  }

  function validateLocationRules(
    transactionType,
    fromLocationId,
    toLocationId,
  ) {
    const fromId = text(fromLocationId);

    const toId = text(toLocationId);

    switch (transactionType) {
      case TRANSACTION_TYPE.RECEIPT:
      case TRANSACTION_TYPE.ADJUSTMENT_IN:
        if (fromId) {
          throw new Error(
            transactionType + " requires from_location_id to be blank.",
          );
        }

        if (!toId) {
          throw new Error(transactionType + " requires to_location_id.");
        }

        break;

      case TRANSACTION_TYPE.TRANSFER:
      case TRANSACTION_TYPE.RETURN:
        if (!fromId || !toId) {
          throw new Error(
            transactionType +
              " requires both from_location_id and to_location_id.",
          );
        }

        if (fromId === toId) {
          throw new Error(
            transactionType +
              " requires different source and destination locations.",
          );
        }

        break;

      case TRANSACTION_TYPE.CONSUMPTION:
      case TRANSACTION_TYPE.ADJUSTMENT_OUT:
      case TRANSACTION_TYPE.LOSS:
        if (!fromId) {
          throw new Error(transactionType + " requires from_location_id.");
        }

        if (toId) {
          throw new Error(
            transactionType + " requires to_location_id to be blank.",
          );
        }

        break;

      case TRANSACTION_TYPE.DAMAGE:
        if (!fromId) {
          throw new Error("DAMAGE requires from_location_id.");
        }

        if (toId && fromId === toId) {
          throw new Error(
            "DAMAGE source and destination locations must be different.",
          );
        }

        break;

      default:
        throw new Error(
          "Unsupported inventory transaction type: " + transactionType,
        );
    }

    return {
      from_location_id: fromId,

      to_location_id: toId,
    };
  }

  function validateTransactionInput(input) {
    input = input || {};

    const item = InventoryService.requireItem(text(input.item_id));

    const transactionType = validateTransactionType(input.transaction_type);

    const quantity = positiveNumber(input.quantity, "quantity");

    const locations = validateLocationRules(
      transactionType,
      input.from_location_id,
      input.to_location_id,
    );

    let fromLocation = null;
    let toLocation = null;

    if (locations.from_location_id) {
      fromLocation = requireLocation(
        locations.from_location_id,
        "from_location_id",
      );
    }

    if (locations.to_location_id) {
      toLocation = requireLocation(locations.to_location_id, "to_location_id");
    }

    const references = validateOptionalReferences(input);

    /*
     * If unit_id is supplied and a UNIT inventory location participates,
     * the location must represent the same unit.
     */
    [fromLocation, toLocation].filter(Boolean).forEach((location) => {
      if (
        references.unit_id &&
        normalize(location.location_type) ===
          InventoryService.LOCATION_TYPE.UNIT &&
        text(location.unit_id) !== references.unit_id
      ) {
        throw new Error(
          "Inventory UNIT location " +
            location.location_id +
            " does not belong to unit " +
            references.unit_id +
            ".",
        );
      }
    });

    return {
      item: item,

      transaction_type: transactionType,

      quantity: quantity,

      from_location: fromLocation,

      to_location: toLocation,

      references: references,

      reference_type: normalize(input.reference_type),

      reference_id: text(input.reference_id),

      unit_cost: nonNegativeNumber(
        input.unit_cost,
        "unit_cost",
        Number(item.unit_cost || 0),
      ),

      notes: text(input.notes),
    };
  }

  // ==========================================================================
  // READ API
  // ==========================================================================

  function getAll() {
    return BaseRepository.findAll(SHEET);
  }

  function getById(transactionId) {
    if (isBlank(transactionId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET,
      "transaction_id",
      text(transactionId),
    );
  }

  function requireTransaction(transactionId) {
    const transaction = getById(transactionId);

    if (!transaction) {
      throw new Error("Inventory transaction not found: " + transactionId);
    }

    return transaction;
  }

  function exists(transactionId) {
    return Boolean(getById(transactionId));
  }

  function getByItem(itemId) {
    InventoryService.requireItem(itemId);

    const target = text(itemId);

    return getAll().filter(
      (transaction) => text(transaction.item_id) === target,
    );
  }

  function getByType(transactionType) {
    const target = validateTransactionType(transactionType);

    return getAll().filter(
      (transaction) => normalize(transaction.transaction_type) === target,
    );
  }

  function getByLocation(locationId) {
    InventoryService.requireLocation(locationId);

    const target = text(locationId);

    return getAll().filter(
      (transaction) =>
        text(transaction.from_location_id) === target ||
        text(transaction.to_location_id) === target,
    );
  }

  function getByUnit(unitId) {
    validateReferenceRecord(CONFIG.SHEETS.UNITS, "unit_id", unitId, "Unit");

    const target = text(unitId);

    return getAll().filter(
      (transaction) => text(transaction.unit_id) === target,
    );
  }

  function getByReservation(reservationId) {
    validateReferenceRecord(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      reservationId,
      "Reservation",
    );

    const target = text(reservationId);

    return getAll().filter(
      (transaction) => text(transaction.reservation_id) === target,
    );
  }

  function getByHousekeepingTask(taskId) {
    validateReferenceRecord(
      CONFIG.SHEETS.HOUSEKEEPING_TASKS,
      "task_id",
      taskId,
      "Housekeeping task",
    );

    const target = text(taskId);

    return getAll().filter(
      (transaction) => text(transaction.housekeeping_task_id) === target,
    );
  }

  function getByMaintenanceWorkOrder(workOrderId) {
    validateReferenceRecord(
      CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
      "work_order_id",
      workOrderId,
      "Maintenance work order",
    );

    const target = text(workOrderId);

    return getAll().filter(
      (transaction) => text(transaction.maintenance_work_order_id) === target,
    );
  }

  // ==========================================================================
  // STOCK PROJECTION HELPERS
  // ==========================================================================

  function ensureStockRecord(itemId, locationId, actorId) {
    let stock = InventoryService.findStock(itemId, locationId);

    if (stock) {
      return stock;
    }

    return InventoryService.createStockRecord(itemId, locationId, {}, actorId);
  }

  function getBalanceSnapshot(itemId, locationId) {
    const stock = ensureStockRecord(
      itemId,
      locationId,
      CONFIG.DEFAULTS.ACTOR_ID,
    );

    return {
      stock: stock,

      quantity_on_hand: Number(stock.quantity_on_hand || 0),

      reserved_quantity: Number(stock.reserved_quantity || 0),
    };
  }

  function assertSufficientStock(snapshot, quantity, label) {
    const available = snapshot.quantity_on_hand - snapshot.reserved_quantity;

    if (available < quantity) {
      throw new Error(
        "Insufficient inventory at " +
          label +
          ". Available=" +
          available +
          ", Required=" +
          quantity +
          ".",
      );
    }
  }

  // ==========================================================================
  // LEDGER WRITE
  // ==========================================================================

  function insertLedger(validated, actorId) {
    const references = validated.references;

    const record = {
      transaction_id: IdService.nextId(ENTITY_TYPE),

      item_id: validated.item.item_id,

      transaction_type: validated.transaction_type,

      quantity: validated.quantity,

      from_location_id: validated.from_location
        ? validated.from_location.location_id
        : "",

      to_location_id: validated.to_location
        ? validated.to_location.location_id
        : "",

      unit_id: references.unit_id,

      reservation_id: references.reservation_id,

      housekeeping_task_id: references.housekeeping_task_id,

      maintenance_work_order_id: references.maintenance_work_order_id,

      reference_type: validated.reference_type,

      reference_id: validated.reference_id,

      unit_cost: validated.unit_cost,

      notes: validated.notes,

      performed_by: normalizeActor(actorId),

      transaction_at: timestamp(),
    };

    const inserted = BaseRepository.insert(SHEET, record);

    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.transaction_id,
      inserted,
      normalizeActor(actorId),
    );

    return inserted;
  }

  // ==========================================================================
  // CORE POSTING
  // ==========================================================================

  function postTransaction(input, actorId) {
    const actor = normalizeActor(actorId);

    return executeWithLock(() => {
      /*
       * Validation happens inside the lock because stock/location state can
       * matter to the movement.
       */
      const validated = validateTransactionInput(input);

      const itemId = validated.item.item_id;

      const quantity = validated.quantity;

      let fromSnapshot = null;
      let toSnapshot = null;

      if (validated.from_location) {
        fromSnapshot = getBalanceSnapshot(
          itemId,
          validated.from_location.location_id,
        );
      }

      if (validated.to_location) {
        toSnapshot = getBalanceSnapshot(
          itemId,
          validated.to_location.location_id,
        );
      }

      if (fromSnapshot) {
        assertSufficientStock(
          fromSnapshot,
          quantity,
          validated.from_location.location_id,
        );
      }

      /*
       * Ledger first.
       *
       * If projection update fails after this point, we preserve the
       * immutable transaction and explicitly surface reconciliation.
       */
      const transaction = insertLedger(validated, actor);

      try {
        if (fromSnapshot) {
          InventoryService.applyStockBalance(
            fromSnapshot.stock.stock_id,
            fromSnapshot.quantity_on_hand - quantity,
            fromSnapshot.reserved_quantity,
            actor,
          );
        }

        if (toSnapshot) {
          InventoryService.applyStockBalance(
            toSnapshot.stock.stock_id,
            toSnapshot.quantity_on_hand + quantity,
            toSnapshot.reserved_quantity,
            actor,
          );
        }
      } catch (error) {
        throw new Error(
          "Inventory transaction " +
            transaction.transaction_id +
            " was recorded, but stock projection update failed. " +
            "Manual reconciliation is required. Cause: " +
            error.message,
        );
      }

      return {
        success: true,

        transaction: transaction,

        from_stock: validated.from_location
          ? InventoryService.findStock(
              itemId,
              validated.from_location.location_id,
            )
          : null,

        to_stock: validated.to_location
          ? InventoryService.findStock(
              itemId,
              validated.to_location.location_id,
            )
          : null,
      };
    });
  }

  // ==========================================================================
  // CONVENIENCE OPERATIONS
  // ==========================================================================

  function receive(itemId, toLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.RECEIPT,

        quantity: quantity,

        from_location_id: "",

        to_location_id: toLocationId,
      }),
      actorId,
    );
  }

  function transfer(
    itemId,
    fromLocationId,
    toLocationId,
    quantity,
    options,
    actorId,
  ) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.TRANSFER,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: toLocationId,
      }),
      actorId,
    );
  }

  function consume(itemId, fromLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.CONSUMPTION,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: "",
      }),
      actorId,
    );
  }

  function adjustIn(itemId, toLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.ADJUSTMENT_IN,

        quantity: quantity,

        from_location_id: "",

        to_location_id: toLocationId,
      }),
      actorId,
    );
  }

  function adjustOut(itemId, fromLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.ADJUSTMENT_OUT,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: "",
      }),
      actorId,
    );
  }

  function recordDamage(itemId, fromLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.DAMAGE,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: options.to_location_id || "",
      }),
      actorId,
    );
  }

  function recordLoss(itemId, fromLocationId, quantity, options, actorId) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.LOSS,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: "",
      }),
      actorId,
    );
  }

  function returnStock(
    itemId,
    fromLocationId,
    toLocationId,
    quantity,
    options,
    actorId,
  ) {
    options = options || {};

    return postTransaction(
      Object.assign({}, options, {
        item_id: itemId,

        transaction_type: TRANSACTION_TYPE.RETURN,

        quantity: quantity,

        from_location_id: fromLocationId,

        to_location_id: toLocationId,
      }),
      actorId,
    );
  }

  // ==========================================================================
  // LEDGER CALCULATION
  // ==========================================================================

  function getSignedQuantityForLocation(transaction, locationId) {
    const target = text(locationId);

    const quantity = Number(transaction.quantity || 0);

    let signed = 0;

    if (text(transaction.to_location_id) === target) {
      signed += quantity;
    }

    if (text(transaction.from_location_id) === target) {
      signed -= quantity;
    }

    return signed;
  }

  function calculateLedgerBalance(itemId, locationId) {
    InventoryService.requireItem(itemId);

    InventoryService.requireLocation(locationId);

    const targetItem = text(itemId);

    return getAll()
      .filter((transaction) => text(transaction.item_id) === targetItem)
      .reduce(
        (balance, transaction) =>
          balance + getSignedQuantityForLocation(transaction, locationId),
        0,
      );
  }

  function compareStockToLedger(itemId, locationId) {
    const stock = InventoryService.findStock(itemId, locationId);

    const ledgerBalance = calculateLedgerBalance(itemId, locationId);

    const stockBalance = stock ? Number(stock.quantity_on_hand || 0) : 0;

    return {
      item_id: text(itemId),

      location_id: text(locationId),

      stock_id: stock ? stock.stock_id : "",

      stock_balance: stockBalance,

      ledger_balance: ledgerBalance,

      difference: stockBalance - ledgerBalance,

      matches: stockBalance === ledgerBalance,
    };
  }

  // ==========================================================================
  // INTEGRITY HELPERS
  // ==========================================================================

  function findOrphanItemLinks() {
    return getAll().filter(
      (transaction) =>
        isBlank(transaction.item_id) ||
        !InventoryService.getItemById(transaction.item_id),
    );
  }

  function findOrphanFromLocations() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.from_location_id)) {
        return false;
      }

      return !InventoryService.getLocationById(transaction.from_location_id);
    });
  }

  function findOrphanToLocations() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.to_location_id)) {
        return false;
      }

      return !InventoryService.getLocationById(transaction.to_location_id);
    });
  }

  function findInvalidTransactionTypes() {
    return getAll().filter(
      (transaction) =>
        !VALID_TRANSACTION_TYPES.has(normalize(transaction.transaction_type)),
    );
  }

  function findInvalidQuantities() {
    return getAll().filter((transaction) => {
      const quantity = Number(transaction.quantity);

      return !Number.isFinite(quantity) || quantity <= 0;
    });
  }

  function findInvalidLocationRules() {
    return getAll().filter((transaction) => {
      try {
        validateLocationRules(
          normalize(transaction.transaction_type),
          transaction.from_location_id,
          transaction.to_location_id,
        );

        return false;
      } catch (error) {
        return true;
      }
    });
  }

  function findOrphanUnitLinks() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.unit_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.UNITS,
        "unit_id",
        transaction.unit_id,
      );
    });
  }

  function findOrphanReservationLinks() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.reservation_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.RESERVATIONS,
        "reservation_id",
        transaction.reservation_id,
      );
    });
  }

  function findOrphanHousekeepingTaskLinks() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.housekeeping_task_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.HOUSEKEEPING_TASKS,
        "task_id",
        transaction.housekeeping_task_id,
      );
    });
  }

  function findOrphanMaintenanceWorkOrderLinks() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.maintenance_work_order_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
        "work_order_id",
        transaction.maintenance_work_order_id,
      );
    });
  }

  function findInvalidUnitLocationLinks() {
    return getAll().filter((transaction) => {
      if (isBlank(transaction.unit_id)) {
        return false;
      }

      const unitId = text(transaction.unit_id);

      const locationIds = [
        transaction.from_location_id,
        transaction.to_location_id,
      ].filter((value) => !isBlank(value));

      return locationIds.some((locationId) => {
        const location = InventoryService.getLocationById(locationId);

        if (!location) {
          return false;
        }

        if (
          normalize(location.location_type) !==
          InventoryService.LOCATION_TYPE.UNIT
        ) {
          return false;
        }

        return text(location.unit_id) !== unitId;
      });
    });
  }

  function findStockLedgerMismatches() {
    const mismatches = [];

    InventoryService.getAllStock().forEach((stock) => {
      const comparison = compareStockToLedger(stock.item_id, stock.location_id);

      if (!comparison.matches) {
        mismatches.push(comparison);
      }
    });

    return mismatches;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {
    TRANSACTION_TYPE,

    // Core
    postTransaction,

    // Convenience operations
    receive,
    transfer,
    consume,
    adjustIn,
    adjustOut,
    recordDamage,
    recordLoss,
    returnStock,

    // Read
    getAll,
    getById,
    requireTransaction,
    exists,
    getByItem,
    getByType,
    getByLocation,
    getByUnit,
    getByReservation,
    getByHousekeepingTask,
    getByMaintenanceWorkOrder,

    // Ledger / reconciliation
    getSignedQuantityForLocation,
    calculateLedgerBalance,
    compareStockToLedger,

    // Validation
    validateTransactionType,

    // Integrity
    findOrphanItemLinks,
    findOrphanFromLocations,
    findOrphanToLocations,
    findInvalidTransactionTypes,
    findInvalidQuantities,
    findInvalidLocationRules,
    findOrphanUnitLinks,
    findOrphanReservationLinks,
    findOrphanHousekeepingTaskLinks,
    findOrphanMaintenanceWorkOrderLinks,
    findInvalidUnitLocationLinks,
    findStockLedgerMismatches,
  };
})();
