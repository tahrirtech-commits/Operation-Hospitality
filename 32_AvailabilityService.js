/**

 * ============================================================

 * 32_AvailabilityService.gs

 * RENTAL OPERATIONS MVP

 * ============================================================

 *

 * Authoritative read-only availability decision service.

 *

 * A unit is SELLABLE / AVAILABLE only when:

 *

 * 1. Unit master status == ACTIVE

 * 2. Operational status == READY

 * 3. No blocking internal reservation

 * 4. No active external calendar event

 * 5. No blocking OTA/Admin block

 *

 * ------------------------------------------------------------

 * DATE SEMANTICS

 * ------------------------------------------------------------

 *

 * All booking/calendar ranges use:

 *

 * [start_date, end_date)

 *

 * Meaning:

 *

 * - start date is inclusive

 * - end date is exclusive

 *

 * Example:

 *

 * Reservation A:

 * 2026-10-01 -> 2026-10-05

 *

 * Reservation B:

 * 2026-10-05 -> 2026-10-10

 *

 * These DO NOT overlap.

 *

 * ------------------------------------------------------------

 * OTA BLOCK WORKFLOW

 * ------------------------------------------------------------

 *

 * PENDING

 *   Admin still needs to block dates on Airbnb / Booking.com.

 *   The dates MUST already be protected internally.

 *

 * BLOCKED

 *   Admin confirmed that the OTA has been blocked.

 *   The dates remain protected internally.

 *

 * CANCELLED

 *   Blocking request is cancelled.

 *   The record does NOT block availability.

 *

 * Therefore:

 *

 * PENDING   -> BLOCKS availability

 * BLOCKED   -> BLOCKS availability

 * CANCELLED -> DOES NOT block availability

 *

 * ============================================================

 */

const AvailabilityService = (() => {
  /**

   * ==========================================================

   * CONSTANTS

   * ==========================================================

   */

  const UNIT_ACTIVE = "ACTIVE";

  const OPERATIONAL_READY = "READY";

  const BLOCKING_RESERVATION_STATUSES = new Set([
    "PENDING",

    "CONFIRMED",

    "CHECKED_IN",
  ]);

  const NON_BLOCKING_RESERVATION_STATUSES = new Set([
    "COMPLETED",

    "CANCELLED",

    "NO_SHOW",
  ]);

  const BLOCKING_OTA_BLOCK_STATUSES = new Set(["PENDING", "BLOCKED"]);

  const NON_BLOCKING_OTA_BLOCK_STATUSES = new Set(["CANCELLED"]);

  /**

   * ==========================================================

   * BASIC HELPERS

   * ==========================================================

   */

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function normalize(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value)
      .trim()

      .toUpperCase();
  }

  /**

   * ==========================================================

   * DATE NORMALIZATION

   * ==========================================================

   */

  function normalizeDate(value) {
    if (isBlank(value)) {
      throw new Error("Date value is required.");
    }

    /*

     * Google Sheets may return Date objects.

     */

    if (Object.prototype.toString.call(value) === "[object Date]") {
      if (isNaN(value.getTime())) {
        throw new Error("Invalid Date object.");
      }

      return Utilities.formatDate(
        value,

        CONFIG.TIMEZONE,

        CONFIG.DATE_FORMATS.DATE,
      );
    }

    const text = String(value).trim();

    /*

     * Preferred canonical format.

     */

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parts = text.split("-");

      const year = Number(parts[0]);

      const month = Number(parts[1]);

      const day = Number(parts[2]);

      const date = new Date(
        Date.UTC(
          year,

          month - 1,

          day,
        ),
      );

      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        throw new Error("Invalid date: " + text);
      }

      return text;
    }

    /*

     * Fallback for valid Date-compatible values.

     */

    const parsed = new Date(value);

    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid date: " + value);
    }

    return Utilities.formatDate(
      parsed,

      CONFIG.TIMEZONE,

      CONFIG.DATE_FORMATS.DATE,
    );
  }

  /**

   * Convert YYYY-MM-DD to an integer-like UTC timestamp.

   *

   * This avoids time-of-day issues when comparing booking

   * date ranges.

   */

  function dateToNumber(value) {
    const normalized = normalizeDate(value);

    const parts = normalized.split("-");

    return Date.UTC(
      Number(parts[0]),

      Number(parts[1]) - 1,

      Number(parts[2]),
    );
  }

  /**

   * ==========================================================

   * DATE RANGE VALIDATION

   * ==========================================================

   */

  function validateDateRange(
    startDate,

    endDate,
  ) {
    const start = normalizeDate(startDate);

    const end = normalizeDate(endDate);

    if (dateToNumber(start) >= dateToNumber(end)) {
      throw new Error("End date must be after start date.");
    }

    return {
      start_date: start,

      end_date: end,
    };
  }

  /**

   * ==========================================================

   * RANGE OVERLAP

   * ==========================================================

   *

   * [A.start, A.end)

   * overlaps

   * [B.start, B.end)

   *

   * when:

   *

   * A.start < B.end

   * AND

   * A.end > B.start

   */

  function rangesOverlap(
    startA,

    endA,

    startB,

    endB,
  ) {
    const rangeA = validateDateRange(
      startA,

      endA,
    );

    const rangeB = validateDateRange(
      startB,

      endB,
    );

    return (
      dateToNumber(rangeA.start_date) < dateToNumber(rangeB.end_date) &&
      dateToNumber(rangeA.end_date) > dateToNumber(rangeB.start_date)
    );
  }

  /**

   * ==========================================================

   * UNIT

   * ==========================================================

   */

  function requireUnit(unitId) {
    if (isBlank(unitId)) {
      throw new Error("unit_id is required.");
    }

    const unit = UnitService.getUnitById(String(unitId).trim());

    if (!unit) {
      throw new Error("Unit not found: " + unitId);
    }

    return unit;
  }

  /**

   * ==========================================================

   * MASTER UNIT STATUS

   * ==========================================================

   */

  function checkUnitMasterStatus(unit) {
    const status = normalize(unit.status);

    return {
      active: status === UNIT_ACTIVE,

      status: status,
    };
  }

  /**

   * ==========================================================

   * OPERATIONAL STATUS

   * ==========================================================

   */

  function checkOperationalStatus(unitId) {
    const statusRecord = OperationalStatusService.getStatus(unitId);

    if (!statusRecord) {
      return {
        ready: false,

        status: null,

        record: null,
      };
    }

    const status = normalize(statusRecord.operational_status);

    return {
      ready: status === OPERATIONAL_READY,

      status: status,

      record: statusRecord,
    };
  }

  /**

   * ==========================================================

   * RESERVATION STATUS

   * ==========================================================

   */

  function isReservationBlocking(reservation) {
    if (!reservation) {
      return false;
    }

    const status = normalize(reservation.status);

    return BLOCKING_RESERVATION_STATUSES.has(status);
  }

  function getReservationStartDate(reservation) {
    if (!isBlank(reservation.check_in_date)) {
      return reservation.check_in_date;
    }

    /*

     * Temporary backward compatibility.

     */

    return reservation.start_date;
  }

  function getReservationEndDate(reservation) {
    if (!isBlank(reservation.check_out_date)) {
      return reservation.check_out_date;
    }

    /*

     * Temporary backward compatibility.

     */

    return reservation.end_date;
  }

  /**

   * ==========================================================

   * INTERNAL RESERVATION CONFLICTS

   * ==========================================================

   */

  function getConflictingReservations(
    unitId,

    startDate,

    endDate,

    excludeReservationId,
  ) {
    requireUnit(unitId);

    const requestedRange = validateDateRange(
      startDate,

      endDate,
    );

    const reservations = BaseRepository.findByField(
      CONFIG.SHEETS.RESERVATIONS,

      "unit_id",

      unitId,
    );

    return reservations.filter((reservation) => {
      if (!isReservationBlocking(reservation)) {
        return false;
      }

      if (
        !isBlank(excludeReservationId) &&
        String(reservation.reservation_id).trim() ===
          String(excludeReservationId).trim()
      ) {
        return false;
      }

      const reservationStart = getReservationStartDate(reservation);

      const reservationEnd = getReservationEndDate(reservation);

      if (isBlank(reservationStart) || isBlank(reservationEnd)) {
        /*

           * Malformed records are handled by

           * IntegrityCheckService.

           */

        return false;
      }

      try {
        return rangesOverlap(
          requestedRange.start_date,

          requestedRange.end_date,

          reservationStart,

          reservationEnd,
        );
      } catch (err) {
        /*

           * Invalid reservation ranges are handled

           * by integrity checks.

           */

        return false;
      }
    });
  }

  /**

   * ==========================================================

   * EXTERNAL CALENDAR CONFLICTS

   * ==========================================================

   */

  function getConflictingExternalEvents(
    unitId,

    startDate,

    endDate,
  ) {
    requireUnit(unitId);

    const range = validateDateRange(
      startDate,

      endDate,
    );

    return ExternalCalendarService.getConflictingEvents(
      unitId,

      range.start_date,

      range.end_date,
    );
  }

  /**

   * ==========================================================

   * OTA / ADMIN BLOCK STATUS

   * ==========================================================

   */

  function isOTABlockBlocking(block) {
    if (!block) {
      return false;
    }

    const status = normalize(block.status);

    /*

     * Phase-2 workflow:

     *

     * PENDING:

     * Direct booking already exists internally.

     * OTA blocking task has not yet been completed.

     *

     * BLOCKED:

     * OTA has been successfully blocked.

     *

     * Both must protect internal availability.

     */

    return BLOCKING_OTA_BLOCK_STATUSES.has(status);
  }

  function getOTABlockStartDate(block) {
    if (!isBlank(block.start_date)) {
      return block.start_date;
    }

    /*

     * Temporary backward compatibility.

     */

    return block.check_in_date;
  }

  function getOTABlockEndDate(block) {
    if (!isBlank(block.end_date)) {
      return block.end_date;
    }

    /*

     * Temporary backward compatibility.

     */

    return block.check_out_date;
  }

  /**

   * ==========================================================

   * OTA / ADMIN BLOCK CONFLICTS

   * ==========================================================

   */

  function getConflictingOTABlocks(
    unitId,

    startDate,

    endDate,
  ) {
    requireUnit(unitId);

    const requestedRange = validateDateRange(
      startDate,

      endDate,
    );

    const blocks = BaseRepository.findByField(
      CONFIG.SHEETS.OTA_BLOCKS,

      "unit_id",

      unitId,
    );

    return blocks.filter((block) => {
      if (!isOTABlockBlocking(block)) {
        return false;
      }

      const blockStart = getOTABlockStartDate(block);

      const blockEnd = getOTABlockEndDate(block);

      if (isBlank(blockStart) || isBlank(blockEnd)) {
        return false;
      }

      try {
        return rangesOverlap(
          requestedRange.start_date,

          requestedRange.end_date,

          blockStart,

          blockEnd,
        );
      } catch (err) {
        /*

           * Invalid block records are handled

           * by IntegrityCheckService.

           */

        return false;
      }
    });
  }

  /**

   * ==========================================================

   * MAIN AVAILABILITY CHECK

   * ==========================================================

   */

  function checkAvailability(
    unitId,

    startDate,

    endDate,

    options,
  ) {
    options = options || {};

    const unit = requireUnit(unitId);

    const requestedRange = validateDateRange(
      startDate,

      endDate,
    );

    const masterStatus = checkUnitMasterStatus(unit);

    const operationalStatus = checkOperationalStatus(unit.unit_id);

    const reservationConflicts = getConflictingReservations(
      unit.unit_id,

      requestedRange.start_date,

      requestedRange.end_date,

      options.excludeReservationId || "",
    );

    const externalConflicts = getConflictingExternalEvents(
      unit.unit_id,

      requestedRange.start_date,

      requestedRange.end_date,
    );

    const otaBlockConflicts = getConflictingOTABlocks(
      unit.unit_id,

      requestedRange.start_date,

      requestedRange.end_date,
    );

    const reasons = [];

    if (!masterStatus.active) {
      reasons.push({
        code: "UNIT_NOT_ACTIVE",

        message: "Unit master status is not ACTIVE.",
      });
    }

    if (!operationalStatus.ready) {
      reasons.push({
        code: "UNIT_NOT_READY",

        message: "Unit operational status is not READY.",
      });
    }

    if (reservationConflicts.length > 0) {
      reasons.push({
        code: "RESERVATION_CONFLICT",

        message: "Unit has a conflicting internal reservation.",

        count: reservationConflicts.length,
      });
    }

    if (externalConflicts.length > 0) {
      reasons.push({
        code: "EXTERNAL_CALENDAR_CONFLICT",

        message: "Unit has a conflicting external calendar event.",

        count: externalConflicts.length,
      });
    }

    if (otaBlockConflicts.length > 0) {
      reasons.push({
        code: "OTA_BLOCK_CONFLICT",

        message: "Unit has a conflicting OTA/Admin block.",

        count: otaBlockConflicts.length,
      });
    }

    return {
      available: reasons.length === 0,

      unit_id: unit.unit_id,

      property_id: unit.property_id || "",

      unit_code: unit.unit_code || "",

      unit_name: unit.unit_name || "",

      start_date: requestedRange.start_date,

      end_date: requestedRange.end_date,

      unit_status: masterStatus.status,

      operational_status: operationalStatus.status,

      reasons: reasons,

      conflicts: {
        reservations: reservationConflicts,

        external_calendar_events: externalConflicts,

        ota_blocks: otaBlockConflicts,
      },
    };
  }

  /**

   * ==========================================================

   * BOOLEAN AVAILABILITY

   * ==========================================================

   */

  function isAvailable(
    unitId,

    startDate,

    endDate,

    options,
  ) {
    return checkAvailability(
      unitId,

      startDate,

      endDate,

      options,
    ).available;
  }

  /**

   * ==========================================================

   * AVAILABLE UNITS

   * ==========================================================

   */

  function getAvailableUnits(
    startDate,

    endDate,

    filters,
  ) {
    filters = filters || {};

    const range = validateDateRange(
      startDate,

      endDate,
    );

    let units = UnitService.getActiveUnits();

    /*

     * Optional property filter.

     */

    if (!isBlank(filters.property_id)) {
      units = units.filter(
        (unit) =>
          String(unit.property_id).trim() ===
          String(filters.property_id).trim(),
      );
    }

    /*

     * Optional unit type filter.

     */

    if (!isBlank(filters.unit_type)) {
      const requestedType = normalize(filters.unit_type);

      units = units.filter(
        (unit) => normalize(unit.unit_type) === requestedType,
      );
    }

    /*

     * Optional guest capacity filter.

     */

    if (!isBlank(filters.min_guests)) {
      const minGuests = Number(filters.min_guests);

      if (isNaN(minGuests) || minGuests < 0) {
        throw new Error("filters.min_guests must be a non-negative number.");
      }

      units = units.filter((unit) => {
        const capacity = Number(unit.max_guests || 0);

        return !isNaN(capacity) && capacity >= minGuests;
      });
    }

    const availableUnits = [];

    units.forEach((unit) => {
      const availability = checkAvailability(
        unit.unit_id,

        range.start_date,

        range.end_date,
      );

      if (availability.available) {
        availableUnits.push({
          unit: unit,

          availability: availability,
        });
      }
    });

    return availableUnits;
  }

  /**
   * ==========================================================
   * PERFORMANCE PATCH 3 - BATCH AVAILABILITY CONTEXT
   * ==========================================================
   *
   * Reads each availability dependency once for a multi-unit
   * request, then evaluates the existing rules in memory.
   *
   * checkAvailability() remains unchanged for single-unit use.
   * ==========================================================
   */

  function groupRowsByUnit(rows, unitSet) {
    const map = {};

    unitSet.forEach((unitId) => {
      map[unitId] = [];
    });

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const unitId = isBlank(row && row.unit_id)
        ? ""
        : String(row.unit_id).trim();

      if (unitSet.has(unitId)) {
        map[unitId].push(row);
      }
    });

    return map;
  }

  function buildOperationalStatusMap(rows, unitSet) {
    const map = {};

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const unitId = isBlank(row && row.unit_id)
        ? ""
        : String(row.unit_id).trim();

      if (unitSet.has(unitId) && !map[unitId]) {
        map[unitId] = row;
      }
    });

    return map;
  }

  function getBatchReservationConflicts(reservations, requestedRange) {
    return (reservations || []).filter((reservation) => {
      if (!isReservationBlocking(reservation)) {
        return false;
      }

      const reservationStart = getReservationStartDate(reservation);

      const reservationEnd = getReservationEndDate(reservation);

      if (isBlank(reservationStart) || isBlank(reservationEnd)) {
        return false;
      }

      try {
        return rangesOverlap(
          requestedRange.start_date,
          requestedRange.end_date,
          reservationStart,
          reservationEnd,
        );
      } catch (err) {
        return false;
      }
    });
  }

  function getBatchExternalConflicts(events, requestedRange) {
    return (events || []).filter((event) => {
      if (normalize(event.status) !== "ACTIVE") {
        return false;
      }

      if (isBlank(event.start_date) || isBlank(event.end_date)) {
        return false;
      }

      try {
        return rangesOverlap(
          event.start_date,
          event.end_date,
          requestedRange.start_date,
          requestedRange.end_date,
        );
      } catch (err) {
        return false;
      }
    });
  }

  function getBatchOTABlockConflicts(blocks, requestedRange) {
    return (blocks || []).filter((block) => {
      if (!isOTABlockBlocking(block)) {
        return false;
      }

      const blockStart = getOTABlockStartDate(block);

      const blockEnd = getOTABlockEndDate(block);

      if (isBlank(blockStart) || isBlank(blockEnd)) {
        return false;
      }

      try {
        return rangesOverlap(
          requestedRange.start_date,
          requestedRange.end_date,
          blockStart,
          blockEnd,
        );
      } catch (err) {
        return false;
      }
    });
  }

  function buildAvailabilityFromBatchContext(
    unit,
    requestedRange,
    operationalStatusRecord,
    reservations,
    externalEvents,
    otaBlocks,
  ) {
    const masterStatus = checkUnitMasterStatus(unit);

    const operationalStatusValue = operationalStatusRecord
      ? normalize(operationalStatusRecord.operational_status)
      : null;

    const operationalStatus = {
      ready: operationalStatusValue === OPERATIONAL_READY,
      status: operationalStatusValue,
      record: operationalStatusRecord || null,
    };

    const reservationConflicts = getBatchReservationConflicts(
      reservations,
      requestedRange,
    );

    const externalConflicts = getBatchExternalConflicts(
      externalEvents,
      requestedRange,
    );

    const otaBlockConflicts = getBatchOTABlockConflicts(
      otaBlocks,
      requestedRange,
    );

    const reasons = [];

    if (!masterStatus.active) {
      reasons.push({
        code: "UNIT_NOT_ACTIVE",
        message: "Unit master status is not ACTIVE.",
      });
    }

    if (!operationalStatus.ready) {
      reasons.push({
        code: "UNIT_NOT_READY",
        message: "Unit operational status is not READY.",
      });
    }

    if (reservationConflicts.length > 0) {
      reasons.push({
        code: "RESERVATION_CONFLICT",
        message: "Unit has a conflicting internal reservation.",
        count: reservationConflicts.length,
      });
    }

    if (externalConflicts.length > 0) {
      reasons.push({
        code: "EXTERNAL_CALENDAR_CONFLICT",
        message: "Unit has a conflicting external calendar event.",
        count: externalConflicts.length,
      });
    }

    if (otaBlockConflicts.length > 0) {
      reasons.push({
        code: "OTA_BLOCK_CONFLICT",
        message: "Unit has a conflicting OTA/Admin block.",
        count: otaBlockConflicts.length,
      });
    }

    return {
      available: reasons.length === 0,
      unit_id: unit.unit_id,
      property_id: unit.property_id || "",
      unit_code: unit.unit_code || "",
      unit_name: unit.unit_name || "",
      start_date: requestedRange.start_date,
      end_date: requestedRange.end_date,
      unit_status: masterStatus.status,
      operational_status: operationalStatus.status,
      reasons: reasons,
      conflicts: {
        reservations: reservationConflicts,
        external_calendar_events: externalConflicts,
        ota_blocks: otaBlockConflicts,
      },
    };
  }

  /**

   * ==========================================================

   * MULTIPLE UNIT AVAILABILITY

   * ==========================================================

   */

  function checkUnitsAvailability(unitIds, startDate, endDate) {
    if (!Array.isArray(unitIds)) {
      throw new Error("unitIds must be an array.");
    }

    const requestedRange = validateDateRange(startDate, endDate);

    const normalizedUnitIds = unitIds.map((unitId) =>
      isBlank(unitId) ? "" : String(unitId).trim(),
    );

    const unitSet = new Set(normalizedUnitIds);

    const allUnits = BaseRepository.findAll(CONFIG.SHEETS.UNITS);

    const unitMap = {};

    allUnits.forEach((unit) => {
      const unitId = isBlank(unit.unit_id) ? "" : String(unit.unit_id).trim();

      if (unitSet.has(unitId)) {
        unitMap[unitId] = unit;
      }
    });

    normalizedUnitIds.forEach((unitId) => {
      if (!unitId || !unitMap[unitId]) {
        throw new Error("Unit not found: " + unitId);
      }
    });

    const operationalStatusMap = buildOperationalStatusMap(
      BaseRepository.findAll(CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS),
      unitSet,
    );

    const reservationsByUnit = groupRowsByUnit(
      BaseRepository.findAll(CONFIG.SHEETS.RESERVATIONS),
      unitSet,
    );

    const externalEventsByUnit = groupRowsByUnit(
      BaseRepository.findAll(CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS),
      unitSet,
    );

    const otaBlocksByUnit = groupRowsByUnit(
      BaseRepository.findAll(CONFIG.SHEETS.OTA_BLOCKS),
      unitSet,
    );

    return normalizedUnitIds.map((unitId) =>
      buildAvailabilityFromBatchContext(
        unitMap[unitId],
        requestedRange,
        operationalStatusMap[unitId] || null,
        reservationsByUnit[unitId] || [],
        externalEventsByUnit[unitId] || [],
        otaBlocksByUnit[unitId] || [],
      ),
    );
  } /**

   * ==========================================================

   * UNIT CALENDAR CONFLICTS

   * ==========================================================

   *

   * Unlike checkAvailability(), this method focuses only on

   * calendar inventory conflicts and does not care whether the

   * unit is ACTIVE or READY.

   */

  function getUnitCalendarConflicts(
    unitId,

    startDate,

    endDate,
  ) {
    requireUnit(unitId);

    const range = validateDateRange(
      startDate,

      endDate,
    );

    const reservations = getConflictingReservations(
      unitId,

      range.start_date,

      range.end_date,
    );

    const externalEvents = getConflictingExternalEvents(
      unitId,

      range.start_date,

      range.end_date,
    );

    const otaBlocks = getConflictingOTABlocks(
      unitId,

      range.start_date,

      range.end_date,
    );

    return {
      unit_id: unitId,

      start_date: range.start_date,

      end_date: range.end_date,

      has_conflict:
        reservations.length > 0 ||
        externalEvents.length > 0 ||
        otaBlocks.length > 0,

      counts: {
        reservations: reservations.length,

        external_calendar_events: externalEvents.length,

        ota_blocks: otaBlocks.length,
      },

      conflicts: {
        reservations: reservations,

        external_calendar_events: externalEvents,

        ota_blocks: otaBlocks,
      },
    };
  }

  /**

   * ==========================================================

   * DIAGNOSTIC:

   * INTERNAL RESERVATION CONFLICTS

   * ==========================================================

   *

   * Finds blocking internal reservations that overlap another

   * blocking internal reservation for the same unit.

   */

  function findReservationConflicts() {
    const reservations = BaseRepository.findAll(CONFIG.SHEETS.RESERVATIONS);

    const blocking = reservations.filter((reservation) =>
      isReservationBlocking(reservation),
    );

    const conflicts = [];

    for (let i = 0; i < blocking.length; i++) {
      const first = blocking[i];

      const firstStart = getReservationStartDate(first);

      const firstEnd = getReservationEndDate(first);

      if (isBlank(firstStart) || isBlank(firstEnd)) {
        continue;
      }

      for (let j = i + 1; j < blocking.length; j++) {
        const second = blocking[j];

        if (String(first.unit_id).trim() !== String(second.unit_id).trim()) {
          continue;
        }

        const secondStart = getReservationStartDate(second);

        const secondEnd = getReservationEndDate(second);

        if (isBlank(secondStart) || isBlank(secondEnd)) {
          continue;
        }

        try {
          if (
            rangesOverlap(
              firstStart,

              firstEnd,

              secondStart,

              secondEnd,
            )
          ) {
            conflicts.push({
              unit_id: first.unit_id,

              reservation_1: first,

              reservation_2: second,
            });
          }
        } catch (err) {
          /*

           * Invalid records are reported separately

           * by IntegrityCheckService.

           */
        }
      }
    }

    return conflicts;
  }

  /**

   * ==========================================================

   * DIAGNOSTIC:

   * RESERVATION vs EXTERNAL CALENDAR

   * ==========================================================

   *

   * IMPORTANT:

   *

   * This does NOT automatically mean double booking.

   *

   * An Airbnb / Booking.com booking can legitimately appear:

   *

   * - as an internal reservation record

   * - and as an imported OTA iCal event

   *

   * IntegrityCheckService therefore treats these as warnings.

   */

  function findReservationExternalConflicts() {
    const reservations = BaseRepository.findAll(CONFIG.SHEETS.RESERVATIONS);

    const blockingReservations = reservations.filter((reservation) =>
      isReservationBlocking(reservation),
    );

    const conflicts = [];

    blockingReservations.forEach((reservation) => {
      if (isBlank(reservation.unit_id)) {
        return;
      }

      const startDate = getReservationStartDate(reservation);

      const endDate = getReservationEndDate(reservation);

      if (isBlank(startDate) || isBlank(endDate)) {
        return;
      }

      let externalEvents;

      try {
        externalEvents = getConflictingExternalEvents(
          reservation.unit_id,

          startDate,

          endDate,
        );
      } catch (err) {
        return;
      }

      externalEvents.forEach((externalEvent) => {
        conflicts.push({
          unit_id: reservation.unit_id,

          reservation: reservation,

          external_event: externalEvent,
        });
      });
    });

    return conflicts;
  }

  /**

   * ==========================================================

   * DIAGNOSTIC:

   * OTA BLOCK STATUS

   * ==========================================================

   */

  function getOTABlockStatusSummary() {
    const blocks = BaseRepository.findAll(CONFIG.SHEETS.OTA_BLOCKS);

    const summary = {
      total: blocks.length,

      pending: 0,

      blocked: 0,

      cancelled: 0,

      invalid: 0,
    };

    blocks.forEach((block) => {
      const status = normalize(block.status);

      switch (status) {
        case "PENDING":
          summary.pending++;

          break;

        case "BLOCKED":
          summary.blocked++;

          break;

        case "CANCELLED":
          summary.cancelled++;

          break;

        default:
          summary.invalid++;

          break;
      }
    });

    return summary;
  }

  /**

   * ==========================================================

   * PUBLIC API

   * ==========================================================

   */

  return {
    /*

     * Date utilities

     */

    normalizeDate,

    dateToNumber,

    validateDateRange,

    rangesOverlap,

    /*

     * Status helpers

     */

    isReservationBlocking,

    isOTABlockBlocking,

    /*

     * Conflict sources

     */

    getConflictingReservations,

    getConflictingExternalEvents,

    getConflictingOTABlocks,

    /*

     * Main availability

     */

    checkAvailability,

    isAvailable,

    getAvailableUnits,

    checkUnitsAvailability,

    getUnitCalendarConflicts,

    /*

     * Diagnostics

     */

    findReservationConflicts,

    findReservationExternalConflicts,

    getOTABlockStatusSummary,
  };
})();
