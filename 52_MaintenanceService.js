/**
 * ==========================================================
 * 52_MaintenanceService.gs
 * ==========================================================
 *
 * Maintenance domain service.
 *
 * Owns:
 *   - Maintenance assets
 *   - Preventive maintenance schedules
 *   - Maintenance work orders
 *
 * Does NOT own:
 *   - Unit operational status transitions
 *   - Inspection outcomes
 *   - Reservation lifecycle
 *
 * Cross-domain orchestration belongs in:
 *   54_StayOperationsService.gs
 *
 * ==========================================================
 */

const MaintenanceService = (() => {
  /**
   * ========================================================
   * CONSTANTS
   * ========================================================
   */

  const ENTITY = {
    ASSET: "MAINTENANCE_ASSET",
    SCHEDULE: "MAINTENANCE_SCHEDULE",
    WORK_ORDER: "MAINTENANCE_WORK_ORDER",
  };

  const SHEET = {
    ASSET: CONFIG.SHEETS.MAINTENANCE_ASSETS,
    SCHEDULE: CONFIG.SHEETS.MAINTENANCE_SCHEDULES,
    WORK_ORDER: CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
  };

  const ASSET_STATUS = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
  };

  const FREQUENCY = {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
    QUARTERLY: "QUARTERLY",
    SEMI_ANNUAL: "SEMI_ANNUAL",
    ANNUAL: "ANNUAL",
    INTERVAL_DAYS: "INTERVAL_DAYS",
  };

  const WORK_ORDER_SOURCE = {
    GUEST: "GUEST",
    PREVENTIVE: "PREVENTIVE",
    INSPECTION: "INSPECTION",
    MANUAL: "MANUAL",
  };

  const PRIORITY = {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    URGENT: "URGENT",
  };

  const WORK_ORDER_STATUS = {
    OPEN: "OPEN",
    SCHEDULED: "SCHEDULED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
  };

  const VALID_ASSET_STATUSES = new Set(Object.values(ASSET_STATUS));

  const VALID_FREQUENCIES = new Set(Object.values(FREQUENCY));

  const VALID_SOURCES = new Set(Object.values(WORK_ORDER_SOURCE));

  const VALID_PRIORITIES = new Set(Object.values(PRIORITY));

  const VALID_WORK_ORDER_STATUSES = new Set(Object.values(WORK_ORDER_STATUS));

  const TERMINAL_WORK_ORDER_STATUSES = new Set([
    WORK_ORDER_STATUS.COMPLETED,
    WORK_ORDER_STATUS.CANCELLED,
  ]);

  const ACTIVE_WORK_ORDER_STATUSES = new Set([
    WORK_ORDER_STATUS.OPEN,
    WORK_ORDER_STATUS.SCHEDULED,
    WORK_ORDER_STATUS.IN_PROGRESS,
  ]);

  const WORK_ORDER_TRANSITIONS = {
    OPEN: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],

    SCHEDULED: ["OPEN", "IN_PROGRESS", "CANCELLED"],

    IN_PROGRESS: ["COMPLETED", "CANCELLED"],

    COMPLETED: [],

    CANCELLED: [],
  };

  /**
   * ========================================================
   * GENERIC HELPERS
   * ========================================================
   */

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

  function normalizeBoolean(value) {
    if (value === true) {
      return true;
    }

    if (value === false) {
      return false;
    }

    const normalized = normalize(value);

    return normalized === "TRUE" || normalized === "YES" || normalized === "1";
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      "yyyy-MM-dd HH:mm:ss",
    );
  }

  /**
   * ========================================================
   * DATE HELPERS
   * ========================================================
   */

  function parseDate(value) {
    if (isBlank(value)) {
      return null;
    }

    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new Error("Invalid date value.");
      }

      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const text = String(value).trim();

    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) {
      throw new Error(
        "Invalid date format: " + value + ". Expected YYYY-MM-DD.",
      );
    }

    const year = Number(match[1]);

    const month = Number(match[2]);

    const day = Number(match[3]);

    const result = new Date(year, month - 1, day);

    if (
      result.getFullYear() !== year ||
      result.getMonth() !== month - 1 ||
      result.getDate() !== day
    ) {
      throw new Error("Invalid date: " + value);
    }

    return result;
  }

  function formatDate(value) {
    const date = parseDate(value);

    if (!date) {
      return "";
    }

    return Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  function getToday() {
    return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  function addDays(value, numberOfDays) {
    const date = parseDate(value);

    date.setDate(date.getDate() + Number(numberOfDays));

    return formatDate(date);
  }

  function addMonths(value, numberOfMonths) {
    const source = parseDate(value);

    const originalDay = source.getDate();

    const target = new Date(
      source.getFullYear(),
      source.getMonth() + Number(numberOfMonths),
      1,
    );

    const lastDay = new Date(
      target.getFullYear(),
      target.getMonth() + 1,
      0,
    ).getDate();

    target.setDate(Math.min(originalDay, lastDay));

    return formatDate(target);
  }

  function addYears(value, numberOfYears) {
    const source = parseDate(value);

    const targetYear = source.getFullYear() + Number(numberOfYears);

    const month = source.getMonth();

    const day = source.getDate();

    const lastDay = new Date(targetYear, month + 1, 0).getDate();

    return formatDate(new Date(targetYear, month, Math.min(day, lastDay)));
  }

  /**
   * ========================================================
   * RELATIONSHIP HELPERS
   * ========================================================
   */

  function requireUnit(unitId) {
    if (isBlank(unitId)) {
      throw new Error("unit_id is required.");
    }

    const unit = BaseRepository.findById(
      CONFIG.SHEETS.UNITS,
      "unit_id",
      unitId,
    );

    if (!unit) {
      throw new Error("Unit not found: " + unitId);
    }

    return unit;
  }

  function requireReservation(reservationId) {
    if (isBlank(reservationId)) {
      return null;
    }

    const reservation = BaseRepository.findById(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      reservationId,
    );

    if (!reservation) {
      throw new Error("Reservation not found: " + reservationId);
    }

    return reservation;
  }

  function requireTechnician(staffId) {
    if (isBlank(staffId)) {
      throw new Error("assigned_to is required.");
    }

    const staff = StaffService.getStaffById(staffId);

    if (!staff) {
      throw new Error("Staff not found: " + staffId);
    }

    if (normalize(staff.status) !== "ACTIVE") {
      throw new Error("Assigned technician is not active: " + staffId);
    }

    if (normalize(staff.role) !== "TECHNICIAN") {
      throw new Error("Assigned staff must have TECHNICIAN role: " + staffId);
    }

    return staff;
  }

  /**
   * ========================================================
   * ASSET READS
   * ========================================================
   */

  function getAllAssets() {
    return BaseRepository.findAll(SHEET.ASSET);
  }

  function getAssets() {
    return getAllAssets();
  }

  function getAssetById(assetId) {
    if (isBlank(assetId)) {
      return null;
    }

    return BaseRepository.findById(SHEET.ASSET, "asset_id", assetId);
  }

  function assetExists(assetId) {
    return !!getAssetById(assetId);
  }

  function requireAsset(assetId) {
    if (isBlank(assetId)) {
      throw new Error("asset_id is required.");
    }

    const asset = getAssetById(assetId);

    if (!asset) {
      throw new Error("Maintenance asset not found: " + assetId);
    }

    return asset;
  }

  function getAssetsByUnit(unitId) {
    return BaseRepository.findByField(SHEET.ASSET, "unit_id", unitId);
  }

  function getAssetsByStatus(status) {
    return getAllAssets().filter(
      (asset) => normalize(asset.status) === normalize(status),
    );
  }

  function getActiveAssets() {
    return getAssetsByStatus(ASSET_STATUS.ACTIVE);
  }

  function findAssetBySerialNumber(serialNumber, excludeAssetId) {
    if (isBlank(serialNumber)) {
      return null;
    }

    const target = normalize(serialNumber);

    return (
      getAllAssets().find((asset) => {
        if (
          excludeAssetId &&
          String(asset.asset_id) === String(excludeAssetId)
        ) {
          return false;
        }

        if (isBlank(asset.serial_number)) {
          return false;
        }

        return normalize(asset.serial_number) === target;
      }) || null
    );
  }

  function findDuplicateAssetSerialNumbers() {
    const seen = {};
    const duplicates = [];

    getAllAssets().forEach((asset) => {
      if (isBlank(asset.serial_number)) {
        return;
      }

      const key = normalize(asset.serial_number);

      if (seen[key]) {
        duplicates.push(asset);
      } else {
        seen[key] = asset.asset_id;
      }
    });

    return duplicates;
  }

  /**
   * ========================================================
   * ASSET VALIDATION
   * ========================================================
   */

  function validateAssetStatus(status) {
    const normalized = normalize(status);

    if (!VALID_ASSET_STATUSES.has(normalized)) {
      throw new Error("Invalid asset status: " + status);
    }

    return normalized;
  }

  function validateExpectedLifeYears(value) {
    if (isBlank(value)) {
      return "";
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      throw new Error("expected_life_years must be greater than 0.");
    }

    return number;
  }

  function validateAsset(data) {
    if (!data) {
      throw new Error("Asset data is required.");
    }

    requireUnit(data.unit_id);

    if (isBlank(data.asset_type)) {
      throw new Error("asset_type is required.");
    }

    if (isBlank(data.name)) {
      throw new Error("name is required.");
    }

    validateAssetStatus(data.status || ASSET_STATUS.ACTIVE);

    validateExpectedLifeYears(data.expected_life_years);

    if (!isBlank(data.purchase_date)) {
      parseDate(data.purchase_date);
    }

    if (!isBlank(data.warranty_until)) {
      parseDate(data.warranty_until);
    }

    if (!isBlank(data.purchase_date) && !isBlank(data.warranty_until)) {
      const purchase = parseDate(data.purchase_date);

      const warranty = parseDate(data.warranty_until);

      if (warranty.getTime() < purchase.getTime()) {
        throw new Error("warranty_until cannot be before purchase_date.");
      }
    }

    return true;
  }

  /**
   * ========================================================
   * ASSET COMMANDS
   * ========================================================
   */

  function createAsset(data, actorId) {
    validateAsset(data);
    const duplicateSerial = findAssetBySerialNumber(data.serial_number);

    if (duplicateSerial) {
      throw new Error(
        "Duplicate asset serial number detected: " +
          data.serial_number +
          " already belongs to " +
          duplicateSerial.asset_id,
      );
    }
    const record = {
      asset_id: IdService.nextId(ENTITY.ASSET),

      unit_id: normalizeText(data.unit_id),

      asset_type: normalizeText(data.asset_type),

      name: normalizeText(data.name),

      brand: normalizeText(data.brand),

      model: normalizeText(data.model),

      serial_number: normalizeText(data.serial_number),

      purchase_date: isBlank(data.purchase_date)
        ? ""
        : formatDate(data.purchase_date),

      warranty_until: isBlank(data.warranty_until)
        ? ""
        : formatDate(data.warranty_until),

      expected_life_years: validateExpectedLifeYears(data.expected_life_years),

      status: validateAssetStatus(data.status || ASSET_STATUS.ACTIVE),
    };

    const created = BaseRepository.insert(SHEET.ASSET, record);

    AuditService.logCreate(ENTITY.ASSET, created.asset_id, created, actorId);

    return created;
  }

  function updateAsset(assetId, changes, actorId) {
    const existing = requireAsset(assetId);

    const merged = Object.assign({}, existing, changes || {}, {
      asset_id: assetId,
    });

    validateAsset(merged);

    const duplicateSerial = findAssetBySerialNumber(
      merged.serial_number,
      assetId,
    );

    if (duplicateSerial) {
      throw new Error(
        "Duplicate asset serial number detected: " +
          merged.serial_number +
          " already belongs to " +
          duplicateSerial.asset_id,
      );
    }

    const updates = Object.assign({}, changes || {});

    delete updates.asset_id;

    if (Object.prototype.hasOwnProperty.call(updates, "status")) {
      updates.status = validateAssetStatus(updates.status);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "purchase_date") &&
      !isBlank(updates.purchase_date)
    ) {
      updates.purchase_date = formatDate(updates.purchase_date);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "warranty_until") &&
      !isBlank(updates.warranty_until)
    ) {
      updates.warranty_until = formatDate(updates.warranty_until);
    }

    const updated = BaseRepository.update(
      SHEET.ASSET,
      "asset_id",
      assetId,
      updates,
    );

    AuditService.logUpdate(ENTITY.ASSET, assetId, existing, updated, actorId);

    return updated;
  }

  function activateAsset(assetId, actorId) {
    return updateAsset(
      assetId,
      {
        status: ASSET_STATUS.ACTIVE,
      },
      actorId,
    );
  }

  function deactivateAsset(assetId, actorId) {
    return updateAsset(
      assetId,
      {
        status: ASSET_STATUS.INACTIVE,
      },
      actorId,
    );
  }

  /**
   * ========================================================
   * SCHEDULE READS
   * ========================================================
   */

  function getAllSchedules() {
    return BaseRepository.findAll(SHEET.SCHEDULE);
  }

  function getSchedules() {
    return getAllSchedules();
  }

  function getScheduleById(scheduleId) {
    if (isBlank(scheduleId)) {
      return null;
    }

    return BaseRepository.findById(SHEET.SCHEDULE, "schedule_id", scheduleId);
  }

  function scheduleExists(scheduleId) {
    return !!getScheduleById(scheduleId);
  }

  function requireSchedule(scheduleId) {
    if (isBlank(scheduleId)) {
      throw new Error("schedule_id is required.");
    }

    const schedule = getScheduleById(scheduleId);

    if (!schedule) {
      throw new Error("Maintenance schedule not found: " + scheduleId);
    }

    return schedule;
  }

  function getSchedulesByAsset(assetId) {
    return BaseRepository.findByField(SHEET.SCHEDULE, "asset_id", assetId);
  }

  function getActiveSchedules() {
    return getAllSchedules().filter((schedule) =>
      normalizeBoolean(schedule.active),
    );
  }

  function getInactiveSchedules() {
    return getAllSchedules().filter(
      (schedule) => !normalizeBoolean(schedule.active),
    );
  }

  /**
   * ========================================================
   * SCHEDULE VALIDATION
   * ========================================================
   */

  function validateFrequency(frequency) {
    const normalized = normalize(frequency);

    if (!VALID_FREQUENCIES.has(normalized)) {
      throw new Error("Invalid maintenance frequency: " + frequency);
    }

    return normalized;
  }

  function validateIntervalValue(value) {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
      throw new Error("interval_value must be a positive integer.");
    }

    return number;
  }

  function validateNonNegativeNumber(value, fieldName) {
    if (isBlank(value)) {
      return "";
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw new Error(fieldName + " must be zero or greater.");
    }

    return number;
  }

  function validateSchedule(data) {
    if (!data) {
      throw new Error("Schedule data is required.");
    }

    requireAsset(data.asset_id);

    if (isBlank(data.maintenance_type)) {
      throw new Error("maintenance_type is required.");
    }

    validateFrequency(data.frequency);

    validateIntervalValue(data.interval_value);

    if (!isBlank(data.assigned_to)) {
      requireTechnician(data.assigned_to);
    }

    validateNonNegativeNumber(data.estimated_duration, "estimated_duration");

    validateNonNegativeNumber(data.estimated_cost, "estimated_cost");

    if (!isBlank(data.last_completed)) {
      parseDate(data.last_completed);
    }

    if (!isBlank(data.next_due)) {
      parseDate(data.next_due);
    }

    return true;
  }

  /**
   * ========================================================
   * SCHEDULE RECURRENCE
   * ========================================================
   */

  function calculateNextDue(schedule, baseDate) {
    if (!schedule) {
      throw new Error("Schedule is required.");
    }

    const frequency = validateFrequency(schedule.frequency);

    const interval = validateIntervalValue(schedule.interval_value);

    const base = baseDate || schedule.last_completed || getToday();

    parseDate(base);

    switch (frequency) {
      case FREQUENCY.DAILY:
        return addDays(base, interval);

      case FREQUENCY.WEEKLY:
        return addDays(base, interval * 7);

      case FREQUENCY.MONTHLY:
        return addMonths(base, interval);

      case FREQUENCY.QUARTERLY:
        return addMonths(base, interval * 3);

      case FREQUENCY.SEMI_ANNUAL:
        return addMonths(base, interval * 6);

      case FREQUENCY.ANNUAL:
        return addYears(base, interval);

      case FREQUENCY.INTERVAL_DAYS:
        return addDays(base, interval);

      default:
        throw new Error("Unsupported maintenance frequency: " + frequency);
    }
  }

  function findDuplicateActiveSchedule(data, excludeScheduleId) {
    if (!normalizeBoolean(data.active)) {
      return null;
    }

    return (
      getActiveSchedules().find((schedule) => {
        if (
          excludeScheduleId &&
          String(schedule.schedule_id) === String(excludeScheduleId)
        ) {
          return false;
        }

        return (
          String(schedule.asset_id) === String(data.asset_id) &&
          normalize(schedule.maintenance_type) ===
            normalize(data.maintenance_type) &&
          normalize(schedule.frequency) === normalize(data.frequency)
        );
      }) || null
    );
  }

  /**
   * ========================================================
   * SCHEDULE COMMANDS
   * ========================================================
   */

  function createSchedule(data, actorId) {
    const input = Object.assign(
      {
        active: true,
      },
      data || {},
    );

    validateSchedule(input);

    const duplicate = findDuplicateActiveSchedule(input);

    if (duplicate) {
      throw new Error(
        "Duplicate active maintenance schedule detected: " +
          duplicate.schedule_id,
      );
    }

    const nextDue = isBlank(input.next_due)
      ? calculateNextDue(input, input.last_completed || getToday())
      : formatDate(input.next_due);

    const record = {
      schedule_id: IdService.nextId(ENTITY.SCHEDULE),

      asset_id: normalizeText(input.asset_id),

      maintenance_type: normalizeText(input.maintenance_type),

      frequency: validateFrequency(input.frequency),

      interval_value: validateIntervalValue(input.interval_value),

      last_completed: isBlank(input.last_completed)
        ? ""
        : formatDate(input.last_completed),

      next_due: nextDue,

      assigned_to: normalizeText(input.assigned_to),

      estimated_duration: validateNonNegativeNumber(
        input.estimated_duration,
        "estimated_duration",
      ),

      estimated_cost: validateNonNegativeNumber(
        input.estimated_cost,
        "estimated_cost",
      ),

      active: normalizeBoolean(input.active),
    };

    const created = BaseRepository.insert(SHEET.SCHEDULE, record);

    AuditService.logCreate(
      ENTITY.SCHEDULE,
      created.schedule_id,
      created,
      actorId,
    );

    return created;
  }

  function updateSchedule(scheduleId, changes, actorId) {
    const existing = requireSchedule(scheduleId);

    const merged = Object.assign({}, existing, changes || {}, {
      schedule_id: scheduleId,
    });

    validateSchedule(merged);

    const duplicate = findDuplicateActiveSchedule(merged, scheduleId);

    if (duplicate) {
      throw new Error(
        "Duplicate active maintenance schedule detected: " +
          duplicate.schedule_id,
      );
    }

    const updates = Object.assign({}, changes || {});

    delete updates.schedule_id;

    if (Object.prototype.hasOwnProperty.call(updates, "frequency")) {
      updates.frequency = validateFrequency(updates.frequency);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "interval_value")) {
      updates.interval_value = validateIntervalValue(updates.interval_value);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "last_completed") &&
      !isBlank(updates.last_completed)
    ) {
      updates.last_completed = formatDate(updates.last_completed);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "next_due") &&
      !isBlank(updates.next_due)
    ) {
      updates.next_due = formatDate(updates.next_due);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "active")) {
      updates.active = normalizeBoolean(updates.active);
    }

    const updated = BaseRepository.update(
      SHEET.SCHEDULE,
      "schedule_id",
      scheduleId,
      updates,
    );

    AuditService.logUpdate(
      ENTITY.SCHEDULE,
      scheduleId,
      existing,
      updated,
      actorId,
    );

    return updated;
  }

  function activateSchedule(scheduleId, actorId) {
    return updateSchedule(
      scheduleId,
      {
        active: true,
      },
      actorId,
    );
  }

  function deactivateSchedule(scheduleId, actorId) {
    return updateSchedule(
      scheduleId,
      {
        active: false,
      },
      actorId,
    );
  }

  function recalculateScheduleNextDue(scheduleId, actorId) {
    const schedule = requireSchedule(scheduleId);

    const nextDue = calculateNextDue(
      schedule,
      schedule.last_completed || getToday(),
    );

    return updateSchedule(
      scheduleId,
      {
        next_due: nextDue,
      },
      actorId,
    );
  }

  function isScheduleDue(schedule, asOfDate) {
    if (
      !schedule ||
      !normalizeBoolean(schedule.active) ||
      isBlank(schedule.next_due)
    ) {
      return false;
    }

    const due = parseDate(schedule.next_due);

    const asOf = parseDate(asOfDate || getToday());

    return due.getTime() <= asOf.getTime();
  }

  function isScheduleOverdue(schedule, asOfDate) {
    if (
      !schedule ||
      !normalizeBoolean(schedule.active) ||
      isBlank(schedule.next_due)
    ) {
      return false;
    }

    const due = parseDate(schedule.next_due);

    const asOf = parseDate(asOfDate || getToday());

    return due.getTime() < asOf.getTime();
  }

  function getDueSchedules(asOfDate) {
    return getActiveSchedules().filter((schedule) =>
      isScheduleDue(schedule, asOfDate),
    );
  }

  function getOverdueSchedules(asOfDate) {
    return getActiveSchedules().filter((schedule) =>
      isScheduleOverdue(schedule, asOfDate),
    );
  }

  /**
   * ========================================================
   * WORK ORDER READS
   * ========================================================
   */

  function getAllWorkOrders() {
    return BaseRepository.findAll(SHEET.WORK_ORDER);
  }

  function getWorkOrders() {
    return getAllWorkOrders();
  }
  function getWorkOrderById(workOrderId) {
    if (isBlank(workOrderId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.WORK_ORDER,
      "work_order_id",
      workOrderId,
    );
  }

  function workOrderExists(workOrderId) {
    return !!getWorkOrderById(workOrderId);
  }

  function requireWorkOrder(workOrderId) {
    if (isBlank(workOrderId)) {
      throw new Error("work_order_id is required.");
    }

    const workOrder = getWorkOrderById(workOrderId);

    if (!workOrder) {
      throw new Error("Maintenance work order not found: " + workOrderId);
    }

    return workOrder;
  }

  function getWorkOrdersByUnit(unitId) {
    return BaseRepository.findByField(SHEET.WORK_ORDER, "unit_id", unitId);
  }

  function getWorkOrdersByAsset(assetId) {
    return BaseRepository.findByField(SHEET.WORK_ORDER, "asset_id", assetId);
  }

  function getWorkOrdersByReservation(reservationId) {
    return BaseRepository.findByField(
      SHEET.WORK_ORDER,
      "reservation_id",
      reservationId,
    );
  }

  function getWorkOrdersByStatus(status) {
    return getAllWorkOrders().filter(
      (workOrder) => normalize(workOrder.status) === normalize(status),
    );
  }

  function getOpenWorkOrders() {
    return getAllWorkOrders().filter((workOrder) =>
      ACTIVE_WORK_ORDER_STATUSES.has(normalize(workOrder.status)),
    );
  }

  function getWorkOrdersByTechnician(staffId) {
    return BaseRepository.findByField(SHEET.WORK_ORDER, "assigned_to", staffId);
  }

  /**
   * ========================================================
   * WORK ORDER VALIDATION
   * ========================================================
   */

  function validateSource(source) {
    const normalized = normalize(source);

    if (!VALID_SOURCES.has(normalized)) {
      throw new Error("Invalid maintenance source: " + source);
    }

    return normalized;
  }

  function validatePriority(priority) {
    const normalized = normalize(priority);

    if (!VALID_PRIORITIES.has(normalized)) {
      throw new Error("Invalid maintenance priority: " + priority);
    }

    return normalized;
  }

  function validateWorkOrderStatus(status) {
    const normalized = normalize(status);

    if (!VALID_WORK_ORDER_STATUSES.has(normalized)) {
      throw new Error("Invalid maintenance work order status: " + status);
    }

    return normalized;
  }

  function validateWorkOrder(data) {
    if (!data) {
      throw new Error("Work order data is required.");
    }

    const unit = requireUnit(data.unit_id);

    let asset = null;

    if (!isBlank(data.asset_id)) {
      asset = requireAsset(data.asset_id);

      if (String(asset.unit_id) !== String(unit.unit_id)) {
        throw new Error(
          "Asset " +
            asset.asset_id +
            " does not belong to unit " +
            unit.unit_id +
            ".",
        );
      }
    }

    if (!isBlank(data.reservation_id)) {
      const reservation = requireReservation(data.reservation_id);

      if (
        reservation.unit_id &&
        String(reservation.unit_id) !== String(data.unit_id)
      ) {
        throw new Error(
          "Reservation " +
            data.reservation_id +
            " does not belong to unit " +
            data.unit_id +
            ".",
        );
      }
    }

    validateSource(data.source);

    if (isBlank(data.issue_type)) {
      throw new Error("issue_type is required.");
    }

    if (isBlank(data.description)) {
      throw new Error("description is required.");
    }

    validatePriority(data.priority);

    validateWorkOrderStatus(data.status);

    if (!isBlank(data.assigned_to)) {
      requireTechnician(data.assigned_to);
    }

    if (!isBlank(data.scheduled_date)) {
      parseDate(data.scheduled_date);
    }

    validateNonNegativeNumber(data.cost, "cost");

    return true;
  }

  /**
   * ========================================================
   * WORK ORDER COMMANDS
   * ========================================================
   */

  function createWorkOrder(data, actorId) {
    const input = Object.assign(
      {
        source: WORK_ORDER_SOURCE.MANUAL,

        priority: PRIORITY.MEDIUM,

        status: WORK_ORDER_STATUS.OPEN,
      },
      data || {},
    );

    validateWorkOrder(input);

    const record = {
      work_order_id: IdService.nextId(ENTITY.WORK_ORDER),

      unit_id: normalizeText(input.unit_id),

      asset_id: normalizeText(input.asset_id),

      reservation_id: normalizeText(input.reservation_id),

      source: validateSource(input.source),

      issue_type: normalizeText(input.issue_type),

      description: normalizeText(input.description),

      priority: validatePriority(input.priority),

      assigned_to: normalizeText(input.assigned_to),

      scheduled_date: isBlank(input.scheduled_date)
        ? ""
        : formatDate(input.scheduled_date),

      status: validateWorkOrderStatus(input.status),

      started_at: normalizeText(input.started_at),

      completed_at: normalizeText(input.completed_at),

      cost: validateNonNegativeNumber(input.cost, "cost"),

      resolution: normalizeText(input.resolution),
    };

    const created = BaseRepository.insert(SHEET.WORK_ORDER, record);

    AuditService.logCreate(
      ENTITY.WORK_ORDER,
      created.work_order_id,
      created,
      actorId,
    );

    return created;
  }

  function createGuestIssue(data, actorId) {
    return createWorkOrder(
      Object.assign({}, data || {}, {
        source: WORK_ORDER_SOURCE.GUEST,
      }),
      actorId,
    );
  }

  function createInspectionIssue(data, actorId) {
    return createWorkOrder(
      Object.assign({}, data || {}, {
        source: WORK_ORDER_SOURCE.INSPECTION,
      }),
      actorId,
    );
  }

  function createManualWorkOrder(data, actorId) {
    return createWorkOrder(
      Object.assign({}, data || {}, {
        source: WORK_ORDER_SOURCE.MANUAL,
      }),
      actorId,
    );
  }

  function updateWorkOrder(workOrderId, changes, actorId) {
    const existing = requireWorkOrder(workOrderId);

    if (TERMINAL_WORK_ORDER_STATUSES.has(normalize(existing.status))) {
      throw new Error("Cannot update terminal work order: " + workOrderId);
    }

    const merged = Object.assign({}, existing, changes || {}, {
      work_order_id: workOrderId,
    });

    validateWorkOrder(merged);

    const updates = Object.assign({}, changes || {});

    delete updates.work_order_id;

    if (Object.prototype.hasOwnProperty.call(updates, "status")) {
      updates.status = validateWorkOrderStatus(updates.status);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "priority")) {
      updates.priority = validatePriority(updates.priority);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "source")) {
      updates.source = validateSource(updates.source);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "scheduled_date") &&
      !isBlank(updates.scheduled_date)
    ) {
      updates.scheduled_date = formatDate(updates.scheduled_date);
    }

    const updated = BaseRepository.update(
      SHEET.WORK_ORDER,
      "work_order_id",
      workOrderId,
      updates,
    );

    AuditService.logUpdate(
      ENTITY.WORK_ORDER,
      workOrderId,
      existing,
      updated,
      actorId,
    );

    return updated;
  }

  function getAllowedTransitions(status) {
    const normalized = validateWorkOrderStatus(status);

    return (WORK_ORDER_TRANSITIONS[normalized] || []).slice();
  }

  function assertTransition(fromStatus, toStatus) {
    const from = validateWorkOrderStatus(fromStatus);

    const to = validateWorkOrderStatus(toStatus);

    const allowed = WORK_ORDER_TRANSITIONS[from] || [];

    if (!allowed.includes(to)) {
      throw new Error(
        "Invalid maintenance work order transition: " + from + " -> " + to,
      );
    }

    return true;
  }

  function changeWorkOrderStatus(
    workOrderId,
    newStatus,
    actorId,
    additionalChanges,
  ) {
    const existing = requireWorkOrder(workOrderId);

    const target = validateWorkOrderStatus(newStatus);

    assertTransition(existing.status, target);

    const updates = Object.assign({}, additionalChanges || {}, {
      status: target,
    });

    const updated = BaseRepository.update(
      SHEET.WORK_ORDER,
      "work_order_id",
      workOrderId,
      updates,
    );

    AuditService.logStatusChange(
      ENTITY.WORK_ORDER,
      workOrderId,
      existing.status,
      target,
      actorId,
    );

    return updated;
  }

  function assignTechnician(workOrderId, staffId, actorId) {
    requireTechnician(staffId);

    const workOrder = requireWorkOrder(workOrderId);

    if (TERMINAL_WORK_ORDER_STATUSES.has(normalize(workOrder.status))) {
      throw new Error(
        "Cannot assign technician to terminal work order: " + workOrderId,
      );
    }

    return updateWorkOrder(
      workOrderId,
      {
        assigned_to: staffId,
      },
      actorId,
    );
  }

  function assignWorkOrder(workOrderId, staffId, actorId) {
    return assignTechnician(workOrderId, staffId, actorId);
  }

  function scheduleWorkOrder(workOrderId, scheduledDate, staffId, actorId) {
    const existing = requireWorkOrder(workOrderId);

    if (!isBlank(staffId)) {
      requireTechnician(staffId);
    }

    const updates = {
      scheduled_date: formatDate(scheduledDate),
    };

    if (!isBlank(staffId)) {
      updates.assigned_to = staffId;
    }

    if (normalize(existing.status) === WORK_ORDER_STATUS.SCHEDULED) {
      return updateWorkOrder(workOrderId, updates, actorId);
    }

    return changeWorkOrderStatus(
      workOrderId,
      WORK_ORDER_STATUS.SCHEDULED,
      actorId,
      updates,
    );
  }

  function startWorkOrder(workOrderId, actorId) {
    const workOrder = requireWorkOrder(workOrderId);

    // Validate lifecycle first.
    assertTransition(workOrder.status, WORK_ORDER_STATUS.IN_PROGRESS);

    if (isBlank(workOrder.assigned_to)) {
      throw new Error("Work order must be assigned before it can be started.");
    }

    requireTechnician(workOrder.assigned_to);

    return changeWorkOrderStatus(
      workOrderId,
      WORK_ORDER_STATUS.IN_PROGRESS,
      actorId,
      {
        started_at: timestamp(),
      },
    );
  }

  function completeWorkOrder(workOrderId, resolution, cost, actorId) {
    const workOrder = requireWorkOrder(workOrderId);

    if (normalize(workOrder.status) !== WORK_ORDER_STATUS.IN_PROGRESS) {
      throw new Error("Only IN_PROGRESS work orders can be completed.");
    }

    if (isBlank(resolution)) {
      throw new Error("resolution is required when completing a work order.");
    }

    const finalCost = isBlank(cost)
      ? workOrder.cost
      : validateNonNegativeNumber(cost, "cost");

    const completed = changeWorkOrderStatus(
      workOrderId,
      WORK_ORDER_STATUS.COMPLETED,
      actorId,
      {
        completed_at: timestamp(),

        resolution: normalizeText(resolution),

        cost: finalCost,
      },
    );

    if (normalize(completed.source) === WORK_ORDER_SOURCE.PREVENTIVE) {
      recordPreventiveCompletion(completed, actorId);
    }

    return completed;
  }

  function cancelWorkOrder(workOrderId, reason, actorId) {
    const workOrder = requireWorkOrder(workOrderId);

    if (TERMINAL_WORK_ORDER_STATUSES.has(normalize(workOrder.status))) {
      throw new Error("Work order is already terminal: " + workOrderId);
    }

    return changeWorkOrderStatus(
      workOrderId,
      WORK_ORDER_STATUS.CANCELLED,
      actorId,
      {
        resolution: normalizeText(reason),
      },
    );
  }

  /**
   * ========================================================
   * PREVENTIVE WORK ORDER GENERATION
   * ========================================================
   */

  function findExistingPreventiveWorkOrder(schedule) {
    if (!schedule || isBlank(schedule.next_due)) {
      return null;
    }

    const asset = requireAsset(schedule.asset_id);

    const dueDate = formatDate(schedule.next_due);

    return (
      getWorkOrdersByAsset(schedule.asset_id).find((workOrder) => {
        if (normalize(workOrder.source) !== WORK_ORDER_SOURCE.PREVENTIVE) {
          return false;
        }

        if (normalize(workOrder.status) === WORK_ORDER_STATUS.CANCELLED) {
          return false;
        }

        if (String(workOrder.unit_id) !== String(asset.unit_id)) {
          return false;
        }

        if (
          normalize(workOrder.issue_type) !==
          normalize(schedule.maintenance_type)
        ) {
          return false;
        }

        if (isBlank(workOrder.scheduled_date)) {
          return false;
        }

        return formatDate(workOrder.scheduled_date) === dueDate;
      }) || null
    );
  }

  function generatePreventiveWorkOrder(scheduleId, actorId) {
    const schedule = requireSchedule(scheduleId);

    if (!normalizeBoolean(schedule.active)) {
      throw new Error(
        "Cannot generate work order from inactive maintenance schedule: " +
          scheduleId,
      );
    }

    if (isBlank(schedule.next_due)) {
      throw new Error("Maintenance schedule has no next_due: " + scheduleId);
    }

    const existing = findExistingPreventiveWorkOrder(schedule);

    if (existing) {
      return {
        created: false,
        reason: "WORK_ORDER_ALREADY_EXISTS",
        schedule: schedule,
        work_order: existing,
      };
    }

    const asset = requireAsset(schedule.asset_id);

    const workOrder = createWorkOrder(
      {
        unit_id: asset.unit_id,

        asset_id: asset.asset_id,

        reservation_id: "",

        source: WORK_ORDER_SOURCE.PREVENTIVE,

        issue_type: schedule.maintenance_type,

        description: schedule.maintenance_type,

        priority: PRIORITY.MEDIUM,

        assigned_to: schedule.assigned_to,

        scheduled_date: schedule.next_due,

        status: WORK_ORDER_STATUS.SCHEDULED,

        cost: schedule.estimated_cost,

        resolution: "",
      },
      actorId,
    );

    return {
      created: true,
      reason: "",
      schedule: schedule,
      work_order: workOrder,
    };
  }

  function generateDueWorkOrders(asOfDate, actorId) {
    const dueSchedules = getDueSchedules(asOfDate);

    const results = [];

    dueSchedules.forEach((schedule) => {
      try {
        results.push({
          schedule_id: schedule.schedule_id,

          success: true,

          result: generatePreventiveWorkOrder(schedule.schedule_id, actorId),
        });
      } catch (err) {
        results.push({
          schedule_id: schedule.schedule_id,

          success: false,

          error: err.message,
        });
      }
    });

    return results;
  }

  function findScheduleForPreventiveWorkOrder(workOrder) {
    if (
      !workOrder ||
      normalize(workOrder.source) !== WORK_ORDER_SOURCE.PREVENTIVE ||
      isBlank(workOrder.asset_id)
    ) {
      return null;
    }

    const candidates = getActiveSchedules().filter(
      (schedule) =>
        String(schedule.asset_id) === String(workOrder.asset_id) &&
        normalize(schedule.maintenance_type) ===
          normalize(workOrder.issue_type),
    );

    if (candidates.length === 0) {
      return null;
    }

    const exact = candidates.find((schedule) => {
      if (isBlank(schedule.next_due) || isBlank(workOrder.scheduled_date)) {
        return false;
      }

      return (
        formatDate(schedule.next_due) === formatDate(workOrder.scheduled_date)
      );
    });

    if (exact) {
      return exact;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    return null;
  }

  function recordPreventiveCompletion(workOrderOrId, actorId) {
    const workOrder =
      typeof workOrderOrId === "string"
        ? requireWorkOrder(workOrderOrId)
        : workOrderOrId;

    if (!workOrder) {
      throw new Error("Work order is required.");
    }

    if (normalize(workOrder.source) !== WORK_ORDER_SOURCE.PREVENTIVE) {
      return null;
    }

    if (normalize(workOrder.status) !== WORK_ORDER_STATUS.COMPLETED) {
      throw new Error(
        "Preventive work order must be COMPLETED before updating its schedule.",
      );
    }

    const schedule = findScheduleForPreventiveWorkOrder(workOrder);

    if (!schedule) {
      return null;
    }

    const completionDate = !isBlank(workOrder.completed_at)
      ? formatDate(workOrder.completed_at)
      : !isBlank(workOrder.scheduled_date)
        ? formatDate(workOrder.scheduled_date)
        : getToday();

    const nextDue = calculateNextDue(schedule, completionDate);

    return updateSchedule(
      schedule.schedule_id,
      {
        last_completed: completionDate,

        next_due: nextDue,
      },
      actorId,
    );
  }

  function findScheduledWithoutDate() {
    return getAllWorkOrders().filter((workOrder) => {
      return (
        normalize(workOrder.status) === WORK_ORDER_STATUS.SCHEDULED &&
        isBlank(workOrder.scheduled_date)
      );
    });
  }
  /*
function findInProgressWithoutStartedAt() {

  return getAllWorkOrders()
    .filter(workOrder => {

      return (
        normalize(workOrder.status) ===
          WORK_ORDER_STATUS.IN_PROGRESS &&
        isBlank(workOrder.started_at)
      );
    });
}


function findCompletedWithoutTimestamp() {

  return getAllWorkOrders()
    .filter(workOrder => {

      return (
        normalize(workOrder.status) ===
          WORK_ORDER_STATUS.COMPLETED &&
        isBlank(workOrder.completed_at)
      );
    });
}


function findCompletedWithoutResolution() {

  return getAllWorkOrders()
    .filter(workOrder => {

      return (
        normalize(workOrder.status) ===
          WORK_ORDER_STATUS.COMPLETED &&
        isBlank(workOrder.resolution)
      );
    });
}
*/
  function findInProgressWithoutStartedAt() {
    return getAllWorkOrders().filter((workOrder) => {
      return (
        normalize(workOrder.status) === WORK_ORDER_STATUS.IN_PROGRESS &&
        isBlank(workOrder.started_at)
      );
    });
  }

  function findCompletedWithoutTimestamp() {
    return findCompletedWorkOrdersWithoutTimestamp();
  }

  function findCompletedWithoutResolution() {
    return findCompletedWorkOrdersWithoutResolution();
  }

  /**
   * ========================================================
   * INTEGRITY HELPERS - ASSETS
   * ========================================================
   */

  function findOrphanAssetUnitLinks() {
    return getAllAssets().filter(
      (asset) =>
        !BaseRepository.findById(CONFIG.SHEETS.UNITS, "unit_id", asset.unit_id),
    );
  }

  function findInvalidAssetStatuses() {
    return getAllAssets().filter(
      (asset) => !VALID_ASSET_STATUSES.has(normalize(asset.status)),
    );
  }

  function findInvalidAssetDates() {
    return getAllAssets().filter((asset) => {
      try {
        if (!isBlank(asset.purchase_date)) {
          parseDate(asset.purchase_date);
        }

        if (!isBlank(asset.warranty_until)) {
          parseDate(asset.warranty_until);
        }

        if (!isBlank(asset.purchase_date) && !isBlank(asset.warranty_until)) {
          if (
            parseDate(asset.warranty_until).getTime() <
            parseDate(asset.purchase_date).getTime()
          ) {
            return true;
          }
        }

        return false;
      } catch (err) {
        return true;
      }
    });
  }

  /**
   * ========================================================
   * INTEGRITY HELPERS - SCHEDULES
   * ========================================================
   */

  function findOrphanScheduleAssetLinks() {
    return getAllSchedules().filter(
      (schedule) => !getAssetById(schedule.asset_id),
    );
  }

  function findOrphanScheduleStaffLinks() {
    return getAllSchedules().filter((schedule) => {
      if (isBlank(schedule.assigned_to)) {
        return false;
      }

      return !StaffService.getStaffById(schedule.assigned_to);
    });
  }

  function findInvalidScheduleStaffAssignments() {
    return getAllSchedules().filter((schedule) => {
      if (isBlank(schedule.assigned_to)) {
        return false;
      }

      const staff = StaffService.getStaffById(schedule.assigned_to);

      if (!staff) {
        return false;
      }

      return (
        normalize(staff.status) !== "ACTIVE" ||
        normalize(staff.role) !== "TECHNICIAN"
      );
    });
  }

  function findInvalidScheduleFrequencies() {
    return getAllSchedules().filter(
      (schedule) => !VALID_FREQUENCIES.has(normalize(schedule.frequency)),
    );
  }

  function findInvalidScheduleIntervals() {
    return getAllSchedules().filter((schedule) => {
      const value = Number(schedule.interval_value);

      return !Number.isInteger(value) || value <= 0;
    });
  }

  function findInvalidScheduleDates() {
    return getAllSchedules().filter((schedule) => {
      try {
        if (!isBlank(schedule.last_completed)) {
          parseDate(schedule.last_completed);
        }

        if (!isBlank(schedule.next_due)) {
          parseDate(schedule.next_due);
        }

        return false;
      } catch (err) {
        return true;
      }
    });
  }

  function findActiveSchedulesWithoutNextDue() {
    return getActiveSchedules().filter((schedule) =>
      isBlank(schedule.next_due),
    );
  }

  function findDuplicateActiveSchedules() {
    const seen = {};
    const duplicates = [];

    getActiveSchedules().forEach((schedule) => {
      const key = [
        String(schedule.asset_id),
        normalize(schedule.maintenance_type),
        normalize(schedule.frequency),
      ].join("|");

      if (seen[key]) {
        duplicates.push(schedule);
      } else {
        seen[key] = schedule.schedule_id;
      }
    });

    return duplicates;
  }

  /**
   * ========================================================
   * INTEGRITY HELPERS - WORK ORDERS
   * ========================================================
   */

  function findOrphanWorkOrderUnitLinks() {
    return getAllWorkOrders().filter(
      (workOrder) =>
        !BaseRepository.findById(
          CONFIG.SHEETS.UNITS,
          "unit_id",
          workOrder.unit_id,
        ),
    );
  }

  function findOrphanWorkOrderAssetLinks() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.asset_id)) {
        return false;
      }

      return !getAssetById(workOrder.asset_id);
    });
  }

  function findWorkOrderAssetUnitMismatches() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.asset_id)) {
        return false;
      }

      const asset = getAssetById(workOrder.asset_id);

      if (!asset) {
        return false;
      }

      return String(asset.unit_id) !== String(workOrder.unit_id);
    });
  }

  function findAssetUnitMismatches() {
    return findWorkOrderAssetUnitMismatches();
  }
  function findOrphanWorkOrderReservationLinks() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.reservation_id)) {
        return false;
      }

      return !BaseRepository.findById(
        CONFIG.SHEETS.RESERVATIONS,
        "reservation_id",
        workOrder.reservation_id,
      );
    });
  }

  function findReservationUnitMismatches() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.reservation_id)) {
        return false;
      }

      const reservation = BaseRepository.findById(
        CONFIG.SHEETS.RESERVATIONS,
        "reservation_id",
        workOrder.reservation_id,
      );

      // Missing reservation is handled by
      // findOrphanWorkOrderReservationLinks().
      if (!reservation) {
        return false;
      }

      return String(reservation.unit_id) !== String(workOrder.unit_id);
    });
  }

  function findOrphanWorkOrderStaffLinks() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.assigned_to)) {
        return false;
      }

      return !StaffService.getStaffById(workOrder.assigned_to);
    });
  }

  function findInvalidWorkOrderStaffAssignments() {
    return getAllWorkOrders().filter((workOrder) => {
      if (isBlank(workOrder.assigned_to)) {
        return false;
      }

      const staff = StaffService.getStaffById(workOrder.assigned_to);

      if (!staff) {
        return false;
      }

      return (
        normalize(staff.status) !== "ACTIVE" ||
        normalize(staff.role) !== "TECHNICIAN"
      );
    });
  }

  function findInvalidWorkOrderSources() {
    return getAllWorkOrders().filter(
      (workOrder) => !VALID_SOURCES.has(normalize(workOrder.source)),
    );
  }

  function findInvalidWorkOrderPriorities() {
    return getAllWorkOrders().filter(
      (workOrder) => !VALID_PRIORITIES.has(normalize(workOrder.priority)),
    );
  }

  function findInvalidWorkOrderStatuses() {
    return getAllWorkOrders().filter(
      (workOrder) =>
        !VALID_WORK_ORDER_STATUSES.has(normalize(workOrder.status)),
    );
  }

  function findCompletedWorkOrdersWithoutTimestamp() {
    return getAllWorkOrders().filter(
      (workOrder) =>
        normalize(workOrder.status) === WORK_ORDER_STATUS.COMPLETED &&
        isBlank(workOrder.completed_at),
    );
  }

  function findCompletedWorkOrdersWithoutResolution() {
    return getAllWorkOrders().filter(
      (workOrder) =>
        normalize(workOrder.status) === WORK_ORDER_STATUS.COMPLETED &&
        isBlank(workOrder.resolution),
    );
  }

  function findInvalidWorkOrderDates() {
    return getAllWorkOrders().filter((workOrder) => {
      try {
        if (!isBlank(workOrder.scheduled_date)) {
          parseDate(workOrder.scheduled_date);
        }

        return false;
      } catch (err) {
        return true;
      }
    });
  }

  function findDuplicatePreventiveWorkOrders() {
    const seen = {};
    const duplicates = [];

    getAllWorkOrders()
      .filter(
        (workOrder) =>
          normalize(workOrder.source) === WORK_ORDER_SOURCE.PREVENTIVE &&
          normalize(workOrder.status) !== WORK_ORDER_STATUS.CANCELLED,
      )
      .forEach((workOrder) => {
        if (isBlank(workOrder.asset_id) || isBlank(workOrder.scheduled_date)) {
          return;
        }

        let scheduledDate;

        try {
          scheduledDate = formatDate(workOrder.scheduled_date);
        } catch (err) {
          return;
        }

        const key = [
          String(workOrder.asset_id),
          normalize(workOrder.issue_type),
          scheduledDate,
        ].join("|");

        if (seen[key]) {
          duplicates.push(workOrder);
        } else {
          seen[key] = workOrder.work_order_id;
        }
      });

    return duplicates;
  }

  /**
   * ========================================================
   * PUBLIC API
   * ========================================================
   */

  return {
    // Constants
    ASSET_STATUS,
    FREQUENCY,
    WORK_ORDER_SOURCE,
    PRIORITY,
    WORK_ORDER_STATUS,

    // Date / recurrence helpers
    calculateNextDue,

    // Assets
    createAsset,
    updateAsset,
    activateAsset,
    deactivateAsset,

    getAssets,
    getAllAssets,
    getAssetById,
    getAssetsByUnit,
    getAssetsByStatus,
    getActiveAssets,

    assetExists,
    requireAsset,

    // Schedules
    createSchedule,
    updateSchedule,
    activateSchedule,
    deactivateSchedule,
    recalculateScheduleNextDue,

    getSchedules,
    getAllSchedules,
    getScheduleById,
    getSchedulesByAsset,
    getActiveSchedules,
    getInactiveSchedules,
    getDueSchedules,
    getOverdueSchedules,

    scheduleExists,
    requireSchedule,
    isScheduleDue,
    isScheduleOverdue,

    generatePreventiveWorkOrder,
    generateDueWorkOrders,
    findExistingPreventiveWorkOrder,
    findScheduleForPreventiveWorkOrder,
    recordPreventiveCompletion,

    // Work orders
    createWorkOrder,
    createGuestIssue,
    createInspectionIssue,
    createManualWorkOrder,

    updateWorkOrder,
    assignTechnician,
    scheduleWorkOrder,
    startWorkOrder,
    completeWorkOrder,
    cancelWorkOrder,
    changeWorkOrderStatus,

    getAllWorkOrders,
    getWorkOrders,
    getWorkOrderById,
    getWorkOrdersByUnit,
    getWorkOrdersByAsset,
    getWorkOrdersByReservation,
    getWorkOrdersByStatus,
    getWorkOrdersByTechnician,
    getOpenWorkOrders,

    workOrderExists,
    requireWorkOrder,

    getAllowedTransitions,
    assertTransition,

    assignWorkOrder,
    assignTechnician,

    // Asset integrity
    findOrphanAssetUnitLinks,
    findInvalidAssetStatuses,
    findInvalidAssetDates,
    //findAssetBySerialNumber,
    findDuplicateAssetSerialNumbers,
    findAssetUnitMismatches,

    // Schedule integrity
    findOrphanScheduleAssetLinks,
    findOrphanScheduleStaffLinks,
    findInvalidScheduleStaffAssignments,
    findInvalidScheduleFrequencies,
    findInvalidScheduleIntervals,
    findInvalidScheduleDates,
    findActiveSchedulesWithoutNextDue,
    findDuplicateActiveSchedules,

    // Work order integrity
    findOrphanWorkOrderUnitLinks,
    findOrphanWorkOrderAssetLinks,
    findWorkOrderAssetUnitMismatches,

    findOrphanWorkOrderReservationLinks,
    findReservationUnitMismatches,

    findOrphanWorkOrderStaffLinks,
    findInvalidWorkOrderStaffAssignments,

    findInvalidWorkOrderSources,
    findInvalidWorkOrderPriorities,
    findInvalidWorkOrderStatuses,
    findInvalidWorkOrderDates,

    findScheduledWithoutDate,
    findInProgressWithoutStartedAt,

    findCompletedWorkOrdersWithoutTimestamp,
    findCompletedWithoutTimestamp,

    findCompletedWorkOrdersWithoutResolution,
    findCompletedWithoutResolution,

    findDuplicatePreventiveWorkOrders,
  };
})();
