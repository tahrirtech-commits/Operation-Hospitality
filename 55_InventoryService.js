/**
 * ============================================================================
 * 55_InventoryService.gs
 * ============================================================================
 *
 * PHASE 4 - INVENTORY MASTER / STOCK QUERY DOMAIN
 *
 * Owns:
 *   - Inventory item master
 *   - Inventory location master
 *   - Inventory stock-position records
 *   - Inventory queries / reorder detection
 *   - Inventory integrity checks
 *
 * Does NOT own:
 *   - Inventory receipts
 *   - Transfers
 *   - Consumption
 *   - Damage / loss
 *   - Returns
 *   - Stock adjustments
 *   - Direct quantity mutations after stock initialization
 *
 * Those stock movements belong in:
 *   56_InventoryTransactionService.gs
 *
 * Sheets:
 *   31_InventoryItems
 *   32_InventoryLocations
 *   33_InventoryStock
 *
 * 34_InventoryTransactions is intentionally NOT written here.
 *
 * IMPORTANT:
 *   InventoryStock is a current-state projection.
 *   InventoryTransactions will be the immutable movement ledger.
 * ============================================================================
 */

const InventoryService = (() => {
  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const ENTITY = {
    ITEM: "INVENTORY_ITEM",
    LOCATION: "INVENTORY_LOCATION",
    STOCK: "INVENTORY_STOCK",
  };

  const SHEET = {
    ITEMS: CONFIG.SHEETS.INVENTORY_ITEMS,
    LOCATIONS: CONFIG.SHEETS.INVENTORY_LOCATIONS,
    STOCK: CONFIG.SHEETS.INVENTORY_STOCK,
  };

  const ITEM_TYPE = {
    CONSUMABLE: "CONSUMABLE",
    REUSABLE: "REUSABLE",
  };

  const LOCATION_TYPE = {
    UNIT: "UNIT",
    STORE: "STORE",
    HOUSEKEEPING: "HOUSEKEEPING",
    LAUNDRY: "LAUNDRY",
    MAINTENANCE: "MAINTENANCE",
    QUARANTINE: "QUARANTINE",
    OTHER: "OTHER",
  };

  const VALID_ITEM_TYPES = new Set(Object.values(ITEM_TYPE));

  const VALID_LOCATION_TYPES = new Set(Object.values(LOCATION_TYPE));

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

  function normalizeText(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  function normalizeActor(actorId) {
    return normalizeText(actorId || CONFIG.DEFAULTS.ACTOR_ID);
  }

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  function parseNonNegativeNumber(value, fieldName, options) {
    options = options || {};

    if (isBlank(value)) {
      if (options.allowBlank === true) {
        return "";
      }

      if (Object.prototype.hasOwnProperty.call(options, "defaultValue")) {
        return options.defaultValue;
      }

      throw new Error(fieldName + " is required.");
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw new Error(fieldName + " must be a non-negative number.");
    }

    return number;
  }

  function parseBoolean(value, defaultValue) {
    if (isBlank(value)) {
      return Boolean(defaultValue);
    }

    if (value === true || value === false) {
      return value;
    }

    const normalized = normalize(value);

    if (normalized === "TRUE" || normalized === "YES" || normalized === "1") {
      return true;
    }

    if (normalized === "FALSE" || normalized === "NO" || normalized === "0") {
      return false;
    }

    throw new Error("Boolean value expected.");
  }

  function requireExistingRecord(sheetName, idField, idValue, label) {
    const record = BaseRepository.findById(
      sheetName,
      idField,
      normalizeText(idValue),
    );

    if (!record) {
      throw new Error(label + " not found: " + idValue);
    }

    return record;
  }

  // ==========================================================================
  // REFERENCE VALIDATION
  // ==========================================================================

  function validateReferenceIfAvailable(category, value) {
    /*
     * Use the central reference-data validator when present.
     * This keeps InventoryService aligned with the rest of the project.
     */
    if (
      typeof ValidationService !== "undefined" &&
      typeof ValidationService.validateReference === "function"
    ) {
      ValidationService.validateReference(category, value);
    }

    return normalize(value);
  }

  function validateItemType(value) {
    const normalized = normalize(value);

    if (!VALID_ITEM_TYPES.has(normalized)) {
      throw new Error("Invalid inventory item type: " + value);
    }

    validateReferenceIfAvailable("INVENTORY_ITEM_TYPE", normalized);

    return normalized;
  }

  function validateLocationType(value) {
    const normalized = normalize(value);

    if (!VALID_LOCATION_TYPES.has(normalized)) {
      throw new Error("Invalid inventory location type: " + value);
    }

    validateReferenceIfAvailable("INVENTORY_LOCATION_TYPE", normalized);

    return normalized;
  }

  function validateCategory(value) {
    const normalized = normalize(value);

    if (!normalized) {
      throw new Error("Inventory category is required.");
    }

    validateReferenceIfAvailable("INVENTORY_CATEGORY", normalized);

    return normalized;
  }

  function validateUnitOfMeasure(value) {
    const normalized = normalize(value);

    if (!normalized) {
      throw new Error("Inventory unit_of_measure is required.");
    }

    validateReferenceIfAvailable("INVENTORY_UOM", normalized);

    return normalized;
  }

  // ==========================================================================
  // ITEM - READ
  // ==========================================================================

  function getAllItems() {
    return BaseRepository.findAll(SHEET.ITEMS);
  }

  function getItemById(itemId) {
    if (isBlank(itemId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.ITEMS,
      "item_id",
      normalizeText(itemId),
    );
  }

  function requireItem(itemId) {
    const item = getItemById(itemId);

    if (!item) {
      throw new Error("Inventory item not found: " + itemId);
    }

    return item;
  }

  function getItemByCode(itemCode) {
    if (isBlank(itemCode)) {
      return null;
    }

    const target = normalize(itemCode);

    return (
      getAllItems().find((item) => normalize(item.item_code) === target) || null
    );
  }

  function itemExists(itemId) {
    return Boolean(getItemById(itemId));
  }

  function itemCodeExists(itemCode, excludeItemId) {
    const targetCode = normalize(itemCode);

    const excluded = normalizeText(excludeItemId);

    return getAllItems().some(
      (item) =>
        normalize(item.item_code) === targetCode &&
        normalizeText(item.item_id) !== excluded,
    );
  }

  function getActiveItems() {
    return getAllItems().filter((item) => parseBoolean(item.active, false));
  }

  function getItemsByCategory(category) {
    const target = validateCategory(category);

    return getAllItems().filter((item) => normalize(item.category) === target);
  }

  function getItemsByType(itemType) {
    const target = validateItemType(itemType);

    return getAllItems().filter((item) => normalize(item.item_type) === target);
  }

  function searchItems(query) {
    const target = normalizeText(query).toLowerCase();

    if (!target) {
      return getAllItems();
    }

    return getAllItems().filter((item) => {
      const haystack = [
        item.item_id,
        item.item_code,
        item.name,
        item.category,
        item.unit_of_measure,
        item.item_type,
        item.notes,
      ]
        .map(normalizeText)
        .join(" ")
        .toLowerCase();

      return haystack.indexOf(target) >= 0;
    });
  }

  // ==========================================================================
  // ITEM - VALIDATION
  // ==========================================================================

  function validatePreferredVendor(vendorId) {
    if (isBlank(vendorId)) {
      return "";
    }

    requireExistingRecord(
      CONFIG.SHEETS.VENDORS,
      "vendor_id",
      vendorId,
      "Vendor",
    );

    return normalizeText(vendorId);
  }

  function validateItemInput(input, options) {
    input = input || {};
    options = options || {};

    const itemCode = normalize(input.item_code);

    const name = normalizeText(input.name);

    if (!itemCode) {
      throw new Error("item_code is required.");
    }

    if (!name) {
      throw new Error("Inventory item name is required.");
    }

    if (itemCodeExists(itemCode, options.excludeItemId)) {
      throw new Error("Inventory item_code already exists: " + itemCode);
    }

    const reorderLevel = parseNonNegativeNumber(
      input.reorder_level,
      "reorder_level",
      {
        defaultValue: 0,
      },
    );

    const targetStockLevel = parseNonNegativeNumber(
      input.target_stock_level,
      "target_stock_level",
      {
        defaultValue: 0,
      },
    );

    if (targetStockLevel > 0 && targetStockLevel < reorderLevel) {
      throw new Error("target_stock_level cannot be lower than reorder_level.");
    }

    return {
      item_code: itemCode,

      name: name,

      category: validateCategory(input.category),

      unit_of_measure: validateUnitOfMeasure(input.unit_of_measure),

      item_type: validateItemType(input.item_type),

      reorder_level: reorderLevel,

      target_stock_level: targetStockLevel,

      unit_cost: parseNonNegativeNumber(input.unit_cost, "unit_cost", {
        defaultValue: 0,
      }),

      preferred_vendor_id: validatePreferredVendor(input.preferred_vendor_id),

      active: parseBoolean(input.active, true),

      notes: normalizeText(input.notes),
    };
  }

  // ==========================================================================
  // ITEM - CREATE / UPDATE
  // ==========================================================================

  function createItem(input, actorId) {
    const actor = normalizeActor(actorId);

    const validated = validateItemInput(input, {});

    const now = timestamp();

    const record = Object.assign(
      {
        item_id: IdService.nextId(ENTITY.ITEM),
      },
      validated,
      {
        created_at: now,

        updated_at: now,
      },
    );

    const inserted = BaseRepository.insert(SHEET.ITEMS, record);

    AuditService.logCreate(ENTITY.ITEM, inserted.item_id, inserted, actor);

    return inserted;
  }

  function updateItem(itemId, changes, actorId) {
    const current = requireItem(itemId);

    changes = changes || {};

    if (Object.prototype.hasOwnProperty.call(changes, "item_id")) {
      throw new Error("item_id cannot be changed.");
    }

    const merged = Object.assign({}, current, changes);

    const validated = validateItemInput(merged, {
      excludeItemId: current.item_id,
    });

    const update = Object.assign({}, validated, {
      updated_at: timestamp(),
    });

    const persisted = BaseRepository.update(
      SHEET.ITEMS,
      "item_id",
      current.item_id,
      update,
    );

    AuditService.logUpdate(
      ENTITY.ITEM,
      current.item_id,
      current,
      persisted,
      normalizeActor(actorId),
    );

    return persisted;
  }

  function changeItemActive(itemId, active, actorId) {
    return updateItem(
      itemId,
      {
        active: parseBoolean(active, false),
      },
      actorId,
    );
  }

  // ==========================================================================
  // LOCATION - READ
  // ==========================================================================

  function getAllLocations() {
    return BaseRepository.findAll(SHEET.LOCATIONS);
  }

  function getLocationById(locationId) {
    if (isBlank(locationId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.LOCATIONS,
      "location_id",
      normalizeText(locationId),
    );
  }

  function requireLocation(locationId) {
    const location = getLocationById(locationId);

    if (!location) {
      throw new Error("Inventory location not found: " + locationId);
    }

    return location;
  }

  function locationExists(locationId) {
    return Boolean(getLocationById(locationId));
  }

  function getActiveLocations() {
    return getAllLocations().filter((location) =>
      parseBoolean(location.active, false),
    );
  }

  function getLocationsByProperty(propertyId) {
    const target = normalizeText(propertyId);

    return getAllLocations().filter(
      (location) => normalizeText(location.property_id) === target,
    );
  }

  function getLocationsByUnit(unitId) {
    const target = normalizeText(unitId);

    return getAllLocations().filter(
      (location) => normalizeText(location.unit_id) === target,
    );
  }

  function getLocationsByType(locationType) {
    const target = validateLocationType(locationType);

    return getAllLocations().filter(
      (location) => normalize(location.location_type) === target,
    );
  }

  function findUnitLocation(unitId) {
    return (
      getLocationsByUnit(unitId).find(
        (location) => normalize(location.location_type) === LOCATION_TYPE.UNIT,
      ) || null
    );
  }

  // ==========================================================================
  // LOCATION - VALIDATION
  // ==========================================================================

  function validateLocationInput(input, options) {
    input = input || {};
    options = options || {};

    const propertyId = normalizeText(input.property_id);

    const unitId = normalizeText(input.unit_id);

    const name = normalizeText(input.name);

    const locationType = validateLocationType(input.location_type);

    if (!propertyId) {
      throw new Error("property_id is required.");
    }

    if (!name) {
      throw new Error("Inventory location name is required.");
    }

    const property = requireExistingRecord(
      CONFIG.SHEETS.PROPERTIES,
      "property_id",
      propertyId,
      "Property",
    );

    let unit = null;

    if (unitId) {
      unit = requireExistingRecord(
        CONFIG.SHEETS.UNITS,
        "unit_id",
        unitId,
        "Unit",
      );

      if (
        normalizeText(unit.property_id) !== normalizeText(property.property_id)
      ) {
        throw new Error(
          "Inventory location unit " +
            unitId +
            " does not belong to property " +
            propertyId +
            ".",
        );
      }
    }

    if (locationType === LOCATION_TYPE.UNIT && !unitId) {
      throw new Error("unit_id is required when location_type is UNIT.");
    }

    if (locationType !== LOCATION_TYPE.UNIT && unitId) {
      throw new Error("unit_id must be blank unless location_type is UNIT.");
    }

    /*
     * One physical UNIT inventory location per unit.
     */
    if (locationType === LOCATION_TYPE.UNIT) {
      const duplicate = getAllLocations().find(
        (location) =>
          normalizeText(location.location_id) !==
            normalizeText(options.excludeLocationId) &&
          normalize(location.location_type) === LOCATION_TYPE.UNIT &&
          normalizeText(location.unit_id) === unitId,
      );

      if (duplicate) {
        throw new Error(
          "UNIT inventory location already exists for " +
            unitId +
            ": " +
            duplicate.location_id,
        );
      }
    }

    return {
      property_id: propertyId,

      unit_id: unitId,

      name: name,

      location_type: locationType,

      active: parseBoolean(input.active, true),

      notes: normalizeText(input.notes),
    };
  }

  // ==========================================================================
  // LOCATION - CREATE / UPDATE
  // ==========================================================================

  function createLocation(input, actorId) {
    const validated = validateLocationInput(input, {});

    const now = timestamp();

    const record = Object.assign(
      {
        location_id: IdService.nextId(ENTITY.LOCATION),
      },
      validated,
      {
        created_at: now,

        updated_at: now,
      },
    );

    const inserted = BaseRepository.insert(SHEET.LOCATIONS, record);

    AuditService.logCreate(
      ENTITY.LOCATION,
      inserted.location_id,
      inserted,
      normalizeActor(actorId),
    );

    return inserted;
  }

  function updateLocation(locationId, changes, actorId) {
    const current = requireLocation(locationId);

    changes = changes || {};

    if (Object.prototype.hasOwnProperty.call(changes, "location_id")) {
      throw new Error("location_id cannot be changed.");
    }

    const merged = Object.assign({}, current, changes);

    const validated = validateLocationInput(merged, {
      excludeLocationId: current.location_id,
    });

    const update = Object.assign({}, validated, {
      updated_at: timestamp(),
    });

    const persisted = BaseRepository.update(
      SHEET.LOCATIONS,
      "location_id",
      current.location_id,
      update,
    );

    AuditService.logUpdate(
      ENTITY.LOCATION,
      current.location_id,
      current,
      persisted,
      normalizeActor(actorId),
    );

    return persisted;
  }

  function changeLocationActive(locationId, active, actorId) {
    return updateLocation(
      locationId,
      {
        active: parseBoolean(active, false),
      },
      actorId,
    );
  }

  // ==========================================================================
  // STOCK - READ
  // ==========================================================================

  function getAllStock() {
    return BaseRepository.findAll(SHEET.STOCK);
  }

  function getStockById(stockId) {
    if (isBlank(stockId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.STOCK,
      "stock_id",
      normalizeText(stockId),
    );
  }

  function requireStock(stockId) {
    const stock = getStockById(stockId);

    if (!stock) {
      throw new Error("Inventory stock record not found: " + stockId);
    }

    return stock;
  }

  function findStock(itemId, locationId) {
    const normalizedItemId = normalizeText(itemId);

    const normalizedLocationId = normalizeText(locationId);

    return (
      getAllStock().find(
        (stock) =>
          normalizeText(stock.item_id) === normalizedItemId &&
          normalizeText(stock.location_id) === normalizedLocationId,
      ) || null
    );
  }

  function getStockByItem(itemId) {
    requireItem(itemId);

    const target = normalizeText(itemId);

    return getAllStock().filter(
      (stock) => normalizeText(stock.item_id) === target,
    );
  }

  function getStockByLocation(locationId) {
    requireLocation(locationId);

    const target = normalizeText(locationId);

    return getAllStock().filter(
      (stock) => normalizeText(stock.location_id) === target,
    );
  }

  function getAvailableQuantity(stockOrId) {
    const stock =
      typeof stockOrId === "object" ? stockOrId : requireStock(stockOrId);

    const onHand = Number(stock.quantity_on_hand || 0);

    const reserved = Number(stock.reserved_quantity || 0);

    return onHand - reserved;
  }

  function getStockPosition(itemId, locationId) {
    const item = requireItem(itemId);

    const location = requireLocation(locationId);

    const stock = findStock(item.item_id, location.location_id);

    return {
      item: item,

      location: location,

      stock: stock,

      quantity_on_hand: stock ? Number(stock.quantity_on_hand || 0) : 0,

      reserved_quantity: stock ? Number(stock.reserved_quantity || 0) : 0,

      available_quantity: stock ? getAvailableQuantity(stock) : 0,
    };
  }

  function getTotalStockForItem(itemId) {
    const stocks = getStockByItem(itemId);

    return stocks.reduce(
      (summary, stock) => {
        summary.quantity_on_hand += Number(stock.quantity_on_hand || 0);

        summary.reserved_quantity += Number(stock.reserved_quantity || 0);

        summary.available_quantity += getAvailableQuantity(stock);

        return summary;
      },
      {
        item_id: normalizeText(itemId),

        quantity_on_hand: 0,

        reserved_quantity: 0,

        available_quantity: 0,
      },
    );
  }

  // ==========================================================================
  // STOCK - INITIALIZATION / POLICY
  // ==========================================================================

  function validateStockThresholds(minimumQuantity, maximumQuantity) {
    const minimum = parseNonNegativeNumber(
      minimumQuantity,
      "minimum_quantity",
      {
        defaultValue: 0,
      },
    );

    const maximum = parseNonNegativeNumber(
      maximumQuantity,
      "maximum_quantity",
      {
        allowBlank: true,
      },
    );

    if (maximum !== "" && maximum < minimum) {
      throw new Error(
        "maximum_quantity cannot be lower than minimum_quantity.",
      );
    }

    return {
      minimum_quantity: minimum,

      maximum_quantity: maximum,
    };
  }

  /**
   * Creates the item/location stock-position record at ZERO.
   *
   * Quantity is intentionally not accepted here.
   * Opening balances / receipts belong to InventoryTransactionService.
   */
  function createStockRecord(itemId, locationId, options, actorId) {
    options = options || {};

    const item = requireItem(itemId);

    const location = requireLocation(locationId);

    const existing = findStock(item.item_id, location.location_id);

    if (existing) {
      throw new Error(
        "Inventory stock record already exists for item " +
          item.item_id +
          " at location " +
          location.location_id +
          ": " +
          existing.stock_id,
      );
    }

    const thresholds = validateStockThresholds(
      options.minimum_quantity,
      options.maximum_quantity,
    );

    const record = {
      stock_id: IdService.nextId(ENTITY.STOCK),

      item_id: item.item_id,

      location_id: location.location_id,

      quantity_on_hand: 0,

      reserved_quantity: 0,

      minimum_quantity: thresholds.minimum_quantity,

      maximum_quantity: thresholds.maximum_quantity,

      last_counted_at: "",

      updated_at: timestamp(),
    };

    const inserted = BaseRepository.insert(SHEET.STOCK, record);

    AuditService.logCreate(
      ENTITY.STOCK,
      inserted.stock_id,
      inserted,
      normalizeActor(actorId),
    );

    return inserted;
  }

  /**
   * Updates stock POLICY / metadata only.
   *
   * quantity_on_hand and reserved_quantity cannot be changed here.
   * Those fields are owned by 56_InventoryTransactionService.gs.
   */
  function updateStockPolicy(stockId, changes, actorId) {
    const current = requireStock(stockId);

    changes = changes || {};

    const protectedFields = [
      "stock_id",
      "item_id",
      "location_id",
      "quantity_on_hand",
      "reserved_quantity",
    ];

    protectedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(changes, field)) {
        throw new Error(field + " cannot be changed through InventoryService.");
      }
    });

    const minimum = Object.prototype.hasOwnProperty.call(
      changes,
      "minimum_quantity",
    )
      ? changes.minimum_quantity
      : current.minimum_quantity;

    const maximum = Object.prototype.hasOwnProperty.call(
      changes,
      "maximum_quantity",
    )
      ? changes.maximum_quantity
      : current.maximum_quantity;

    const thresholds = validateStockThresholds(minimum, maximum);

    const update = {
      minimum_quantity: thresholds.minimum_quantity,

      maximum_quantity: thresholds.maximum_quantity,

      updated_at: timestamp(),
    };

    if (Object.prototype.hasOwnProperty.call(changes, "last_counted_at")) {
      update.last_counted_at = normalizeText(changes.last_counted_at);
    }

    const persisted = BaseRepository.update(
      SHEET.STOCK,
      "stock_id",
      current.stock_id,
      update,
    );

    AuditService.logUpdate(
      ENTITY.STOCK,
      current.stock_id,
      current,
      persisted,
      normalizeActor(actorId),
    );

    return persisted;
  }

  /**
   * INTERNAL BRIDGE FOR 56_InventoryTransactionService.gs.
   *
   * This is deliberately named as an internal operation.
   * UI/admin code should never call it directly.
   *
   * It permits the transaction service to persist the projection
   * only after validating / recording a stock movement.
   */
  function applyStockBalance(
    stockId,
    quantityOnHand,
    reservedQuantity,
    actorId,
    options,
  ) {
    options = options || {};

    const current = requireStock(stockId);

    const onHand = parseNonNegativeNumber(quantityOnHand, "quantity_on_hand");

    const reserved = parseNonNegativeNumber(
      reservedQuantity,
      "reserved_quantity",
    );

    if (reserved > onHand) {
      throw new Error("reserved_quantity cannot exceed quantity_on_hand.");
    }

    const update = {
      quantity_on_hand: onHand,

      reserved_quantity: reserved,

      updated_at: timestamp(),
    };

    if (options.markCounted === true) {
      update.last_counted_at = timestamp();
    }

    const persisted = BaseRepository.update(
      SHEET.STOCK,
      "stock_id",
      current.stock_id,
      update,
    );

    AuditService.logUpdate(
      ENTITY.STOCK,
      current.stock_id,
      current,
      persisted,
      normalizeActor(actorId),
    );

    return persisted;
  }

  // ==========================================================================
  // REORDER / STOCK HEALTH
  // ==========================================================================

  function isLowStock(stock) {
    const available = getAvailableQuantity(stock);

    const stockMinimum = Number(stock.minimum_quantity || 0);

    const item = getItemById(stock.item_id);

    const itemReorder = item ? Number(item.reorder_level || 0) : 0;

    const threshold = stockMinimum > 0 ? stockMinimum : itemReorder;

    return threshold > 0 && available <= threshold;
  }

  function getLowStock() {
    return getAllStock()
      .filter((stock) => isLowStock(stock))
      .map((stock) => {
        const item = getItemById(stock.item_id);

        const location = getLocationById(stock.location_id);

        const available = getAvailableQuantity(stock);

        const minimum = Number(stock.minimum_quantity || 0);

        const reorderLevel = item ? Number(item.reorder_level || 0) : 0;

        const threshold = minimum > 0 ? minimum : reorderLevel;

        const target = item ? Number(item.target_stock_level || 0) : 0;

        return {
          stock: stock,

          item: item,

          location: location,

          available_quantity: available,

          reorder_threshold: threshold,

          suggested_replenishment: target > available ? target - available : 0,
        };
      });
  }

  function getLowStockByLocation(locationId) {
    const target = normalizeText(locationId);

    requireLocation(target);

    return getLowStock().filter(
      (entry) => normalizeText(entry.stock.location_id) === target,
    );
  }

  function getOutOfStock() {
    return getAllStock().filter((stock) => getAvailableQuantity(stock) <= 0);
  }

  // ==========================================================================
  // INTEGRITY - ITEMS
  // ==========================================================================

  function findDuplicateItemCodes() {
    const seen = new Map();

    const duplicates = [];

    getAllItems().forEach((item) => {
      const key = normalize(item.item_code);

      if (!key) {
        return;
      }

      if (seen.has(key)) {
        duplicates.push(item);
      } else {
        seen.set(key, item.item_id);
      }
    });

    return duplicates;
  }

  function findItemsWithoutCode() {
    return getAllItems().filter((item) => isBlank(item.item_code));
  }

  function findItemsWithoutName() {
    return getAllItems().filter((item) => isBlank(item.name));
  }

  function findInvalidItemTypes() {
    return getAllItems().filter(
      (item) => !VALID_ITEM_TYPES.has(normalize(item.item_type)),
    );
  }

  function findInvalidItemNumbers() {
    return getAllItems().filter((item) => {
      const fields = [
        item.reorder_level,
        item.target_stock_level,
        item.unit_cost,
      ];

      return fields.some((value) => {
        if (isBlank(value)) {
          return false;
        }

        const number = Number(value);

        return !Number.isFinite(number) || number < 0;
      });
    });
  }

  function findOrphanPreferredVendors() {
    return getAllItems().filter((item) => {
      if (isBlank(item.preferred_vendor_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.VENDORS,
        "vendor_id",
        item.preferred_vendor_id,
      );
    });
  }

  // ==========================================================================
  // INTEGRITY - LOCATIONS
  // ==========================================================================

  function findOrphanLocationProperties() {
    return getAllLocations().filter(
      (location) =>
        isBlank(location.property_id) ||
        !BaseRepository.findById(
          CONFIG.SHEETS.PROPERTIES,
          "property_id",
          location.property_id,
        ),
    );
  }

  function findOrphanLocationUnits() {
    return getAllLocations().filter((location) => {
      if (isBlank(location.unit_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.UNITS,
        "unit_id",
        location.unit_id,
      );
    });
  }

  function findLocationPropertyUnitMismatches() {
    return getAllLocations().filter((location) => {
      if (isBlank(location.unit_id)) {
        return false;
      }

      const unit = BaseRepository.findById(
        CONFIG.SHEETS.UNITS,
        "unit_id",
        location.unit_id,
      );

      if (!unit) {
        return false;
      }

      return (
        normalizeText(unit.property_id) !== normalizeText(location.property_id)
      );
    });
  }

  function findInvalidLocationTypes() {
    return getAllLocations().filter(
      (location) =>
        !VALID_LOCATION_TYPES.has(normalize(location.location_type)),
    );
  }

  function findInvalidUnitLocationLinks() {
    return getAllLocations().filter((location) => {
      const type = normalize(location.location_type);

      if (type === LOCATION_TYPE.UNIT) {
        return isBlank(location.unit_id);
      }

      return !isBlank(location.unit_id);
    });
  }

  function findDuplicateUnitLocations() {
    const seen = new Map();

    const duplicates = [];

    getAllLocations()
      .filter(
        (location) =>
          normalize(location.location_type) === LOCATION_TYPE.UNIT &&
          !isBlank(location.unit_id),
      )
      .forEach((location) => {
        const key = normalizeText(location.unit_id);

        if (seen.has(key)) {
          duplicates.push(location);
        } else {
          seen.set(key, location.location_id);
        }
      });

    return duplicates;
  }

  // ==========================================================================
  // INTEGRITY - STOCK
  // ==========================================================================

  function findOrphanStockItems() {
    return getAllStock().filter(
      (stock) => isBlank(stock.item_id) || !getItemById(stock.item_id),
    );
  }

  function findOrphanStockLocations() {
    return getAllStock().filter(
      (stock) =>
        isBlank(stock.location_id) || !getLocationById(stock.location_id),
    );
  }

  function findDuplicateStockRecords() {
    const seen = new Map();

    const duplicates = [];

    getAllStock().forEach((stock) => {
      const key = [
        normalizeText(stock.item_id),
        normalizeText(stock.location_id),
      ].join("|");

      if (seen.has(key)) {
        duplicates.push(stock);
      } else {
        seen.set(key, stock.stock_id);
      }
    });

    return duplicates;
  }

  function findInvalidStockQuantities() {
    return getAllStock().filter((stock) => {
      const fields = [
        stock.quantity_on_hand,
        stock.reserved_quantity,
        stock.minimum_quantity,
      ];

      if (
        fields.some((value) => {
          const number = Number(isBlank(value) ? 0 : value);

          return !Number.isFinite(number) || number < 0;
        })
      ) {
        return true;
      }

      if (!isBlank(stock.maximum_quantity)) {
        const maximum = Number(stock.maximum_quantity);

        if (!Number.isFinite(maximum) || maximum < 0) {
          return true;
        }
      }

      return false;
    });
  }

  function findReservedGreaterThanOnHand() {
    return getAllStock().filter(
      (stock) =>
        Number(stock.reserved_quantity || 0) >
        Number(stock.quantity_on_hand || 0),
    );
  }

  function findInvalidStockThresholds() {
    return getAllStock().filter((stock) => {
      if (isBlank(stock.maximum_quantity)) {
        return false;
      }

      return (
        Number(stock.maximum_quantity) < Number(stock.minimum_quantity || 0)
      );
    });
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {
    // Constants
    ITEM_TYPE,
    LOCATION_TYPE,

    // Item CRUD / queries
    createItem,
    updateItem,
    changeItemActive,
    getAllItems,
    getItemById,
    getItemByCode,
    requireItem,
    itemExists,
    itemCodeExists,
    getActiveItems,
    getItemsByCategory,
    getItemsByType,
    searchItems,

    // Location CRUD / queries
    createLocation,
    updateLocation,
    changeLocationActive,
    getAllLocations,
    getLocationById,
    requireLocation,
    locationExists,
    getActiveLocations,
    getLocationsByProperty,
    getLocationsByUnit,
    getLocationsByType,
    findUnitLocation,

    // Stock records / queries
    createStockRecord,
    updateStockPolicy,
    getAllStock,
    getStockById,
    requireStock,
    findStock,
    getStockByItem,
    getStockByLocation,
    getStockPosition,
    getTotalStockForItem,
    getAvailableQuantity,

    /*
     * Internal bridge for 56_InventoryTransactionService.gs.
     * Do not expose this directly in the admin UI.
     */
    applyStockBalance,

    // Stock health
    isLowStock,
    getLowStock,
    getLowStockByLocation,
    getOutOfStock,

    // Validation
    validateItemType,
    validateLocationType,
    validateCategory,
    validateUnitOfMeasure,

    // Item integrity
    findDuplicateItemCodes,
    findItemsWithoutCode,
    findItemsWithoutName,
    findInvalidItemTypes,
    findInvalidItemNumbers,
    findOrphanPreferredVendors,

    // Location integrity
    findOrphanLocationProperties,
    findOrphanLocationUnits,
    findLocationPropertyUnitMismatches,
    findInvalidLocationTypes,
    findInvalidUnitLocationLinks,
    findDuplicateUnitLocations,

    // Stock integrity
    findOrphanStockItems,
    findOrphanStockLocations,
    findDuplicateStockRecords,
    findInvalidStockQuantities,
    findReservedGreaterThanOnHand,
    findInvalidStockThresholds,
  };
})();
