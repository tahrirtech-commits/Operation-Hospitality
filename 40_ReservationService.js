/**
 * ============================================================
 * 40_ReservationService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 3 - RESERVATIONS
 * ============================================================
 *
 * Authoritative service for reservation lifecycle.
 *
 * Responsibilities:
 * - Create reservations
 * - Validate reservation data
 * - Check availability before inventory-blocking reservations
 * - Update reservation details
 * - Manage reservation lifecycle/status
 * - Cancel reservations
 * - Check-in / complete / no-show
 * - Reservation queries
 * - Audit reservation changes
 *
 * NOT responsible for:
 * - Reservation guest assignments
 * - OTA blocking workflow
 * - Payments
 * - Charges
 * - Housekeeping
 *
 * Date semantics:
 *
 *   [check_in_date, check_out_date)
 *
 * Checkout date is exclusive.
 *
 * Blocking statuses:
 * - PENDING
 * - CONFIRMED
 * - CHECKED_IN
 *
 * Non-blocking statuses:
 * - COMPLETED
 * - CANCELLED
 * - NO_SHOW
 *
 * ============================================================
 */

const ReservationService = (() => {
  const ENTITY_TYPE = "RESERVATION";

  const DEFAULT_STATUS = "PENDING";

  const BLOCKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CHECKED_IN"]);

  const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]);

  /**
   * ----------------------------------------------------------
   * GENERIC HELPERS
   * ----------------------------------------------------------
   */

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
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

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  function normalizeActorId(actorId) {
    return normalizeText(actorId) || CONFIG.DEFAULTS.ACTOR_ID;
  }

  function cloneObject(object) {
    return Object.assign({}, object || {});
  }

  /**
   * ----------------------------------------------------------
   * RESERVATION NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeReservation(input) {
    const reservation = cloneObject(input);

    if (Object.prototype.hasOwnProperty.call(reservation, "reservation_id")) {
      reservation.reservation_id = normalizeText(reservation.reservation_id);
    }

    if (Object.prototype.hasOwnProperty.call(reservation, "unit_id")) {
      reservation.unit_id = normalizeText(reservation.unit_id);
    }

    if (Object.prototype.hasOwnProperty.call(reservation, "customer_id")) {
      reservation.customer_id = normalizeText(reservation.customer_id);
    }

    if (Object.prototype.hasOwnProperty.call(reservation, "booking_source")) {
      reservation.booking_source = normalize(reservation.booking_source);
    }

    if (Object.prototype.hasOwnProperty.call(reservation, "status")) {
      reservation.status = normalize(reservation.status);
    }

    if (
      Object.prototype.hasOwnProperty.call(reservation, "check_in_date") &&
      !isBlank(reservation.check_in_date)
    ) {
      reservation.check_in_date = AvailabilityService.normalizeDate(
        reservation.check_in_date,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(reservation, "check_out_date") &&
      !isBlank(reservation.check_out_date)
    ) {
      reservation.check_out_date = AvailabilityService.normalizeDate(
        reservation.check_out_date,
      );
    }

    return reservation;
  }

  /**
   * ----------------------------------------------------------
   * BASIC LOOKUPS
   * ----------------------------------------------------------
   */

  function getAll() {
    return BaseRepository.findAll(CONFIG.SHEETS.RESERVATIONS);
  }

  function getById(reservationId) {
    if (isBlank(reservationId)) {
      return null;
    }

    return BaseRepository.findById(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      normalizeText(reservationId),
    );
  }

  function exists(reservationId) {
    return !!getById(reservationId);
  }

  function requireReservation(reservationId) {
    const reservation = getById(reservationId);

    if (!reservation) {
      throw new Error("Reservation not found: " + reservationId);
    }

    return reservation;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATION
   * ----------------------------------------------------------
   */

  function validateReservation(reservation, options) {
    options = options || {};

    if (!reservation || typeof reservation !== "object") {
      throw new Error("Reservation object is required.");
    }

    ValidationService.requireFields(reservation, [
      "unit_id",
      "booking_source",
      "check_in_date",
      "check_out_date",
      "status",
    ]);

    /*
     * Unit must exist.
     */

    ValidationService.validateUnitExists(reservation.unit_id);

    /*
     * Customer is optional at the generic service level,
     * but if supplied it must exist.
     */

    if (!isBlank(reservation.customer_id)) {
      ValidationService.validateCustomerExists(reservation.customer_id);
    }

    /*
     * Reference-data validation.
     */

    ValidationService.validateReference(
      "BOOKING_SOURCE",
      reservation.booking_source,
    );

    ValidationService.validateReference(
      "RESERVATION_STATUS",
      reservation.status,
    );

    /*
     * Checkout-exclusive date range.
     */

    AvailabilityService.validateDateRange(
      reservation.check_in_date,
      reservation.check_out_date,
    );

    /*
     * Prevent accidental reservation ID duplication
     * during creation.
     */

    if (options.isCreate === true && !isBlank(reservation.reservation_id)) {
      if (exists(reservation.reservation_id)) {
        throw new Error(
          "Reservation already exists: " + reservation.reservation_id,
        );
      }
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * STATUS HELPERS
   * ----------------------------------------------------------
   */

  function isBlockingStatus(status) {
    return BLOCKING_STATUSES.has(normalize(status));
  }

  function isTerminalStatus(status) {
    return TERMINAL_STATUSES.has(normalize(status));
  }

  /**
   * ----------------------------------------------------------
   * AVAILABILITY VALIDATION
   * ----------------------------------------------------------
   */

  function assertAvailable(
    unitId,
    checkInDate,
    checkOutDate,
    excludeReservationId,
  ) {
    /*
     * AvailabilityService already owns the inventory rules:
     *
     * - Unit master status
     * - Operational status
     * - Reservation conflicts
     * - External calendar conflicts
     * - OTA block conflicts
     */

    const result = AvailabilityService.checkAvailability(
      unitId,
      checkInDate,
      checkOutDate,
      excludeReservationId,
    );

    if (!result.available) {
      const reasons = Array.isArray(result.reasons) ? result.reasons : [];

      const reasonText = reasons
        .map((reason) => {
          if (typeof reason === "string") {
            return reason;
          }

          if (reason && reason.message) {
            return reason.message;
          }

          if (reason && reason.code) {
            return reason.code;
          }

          return String(reason);
        })
        .join("; ");

      throw new Error(
        "Unit " +
          unitId +
          " is not available from " +
          checkInDate +
          " to " +
          checkOutDate +
          (reasonText ? ": " + reasonText : "."),
      );
    }

    return result;
  }

  /**
   * ----------------------------------------------------------
   * CREATE RESERVATION
   * ----------------------------------------------------------
   */

  function createReservation(input, actorId) {
    actorId = normalizeActorId(actorId);

    let reservation = normalizeReservation(input);

    /*
     * Service owns the initial status.
     */

    reservation.status = normalize(reservation.status || DEFAULT_STATUS);

    /*
     * Validate BEFORE consuming an ID.
     */

    validateReservation(reservation, {
      isCreate: true,
    });

    /*
     * Any reservation created in a blocking state
     * must pass availability first.
     */

    if (isBlockingStatus(reservation.status)) {
      assertAvailable(
        reservation.unit_id,
        reservation.check_in_date,
        reservation.check_out_date,
        null,
      );
    }

    reservation.reservation_id = IdService.nextId(ENTITY_TYPE);

    const now = timestamp();

    /*
     * These fields are only written if they exist
     * as columns in the sheet because BaseRepository.insert()
     * maps the object to the actual sheet headers.
     */

    reservation.created_at = now;

    reservation.updated_at = now;

    const inserted = BaseRepository.insert(
      CONFIG.SHEETS.RESERVATIONS,
      reservation,
    );

    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.reservation_id,
      inserted,
      actorId,
    );

    return inserted;
  }

  /**
   * ----------------------------------------------------------
   * UPDATE RESERVATION
   * ----------------------------------------------------------
   */

  function updateReservation(reservationId, changes, actorId) {
    actorId = normalizeActorId(actorId);

    const existing = requireReservation(reservationId);

    if (!changes || typeof changes !== "object") {
      throw new Error("Reservation changes are required.");
    }

    /*
     * Lifecycle changes should go through changeStatus().
     */

    if (
      Object.prototype.hasOwnProperty.call(changes, "status") &&
      normalize(changes.status) !== normalize(existing.status)
    ) {
      throw new Error(
        "Reservation status must be changed using changeStatus().",
      );
    }

    /*
     * Protect immutable fields.
     */

    if (
      Object.prototype.hasOwnProperty.call(changes, "reservation_id") &&
      normalizeText(changes.reservation_id) !==
        normalizeText(existing.reservation_id)
    ) {
      throw new Error("reservation_id cannot be changed.");
    }

    let updated = Object.assign({}, existing, changes);

    updated.reservation_id = existing.reservation_id;

    if (Object.prototype.hasOwnProperty.call(existing, "created_at")) {
      updated.created_at = existing.created_at;
    }

    updated = normalizeReservation(updated);

    validateReservation(updated, {
      isCreate: false,
    });

    /*
     * If the reservation currently blocks inventory,
     * changing unit or dates must re-check availability.
     *
     * The current reservation is excluded from its own
     * conflict search.
     */

    const inventoryChanged =
      normalizeText(updated.unit_id) !== normalizeText(existing.unit_id) ||
      String(updated.check_in_date) !== String(existing.check_in_date) ||
      String(updated.check_out_date) !== String(existing.check_out_date);

    if (inventoryChanged && isBlockingStatus(updated.status)) {
      assertAvailable(
        updated.unit_id,
        updated.check_in_date,
        updated.check_out_date,
        updated.reservation_id,
      );
    }

    updated.updated_at = timestamp();

    const saved = BaseRepository.update(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      reservationId,
      updated,
    );

    AuditService.logUpdate(
      ENTITY_TYPE,
      reservationId,
      existing,
      saved,
      actorId,
    );

    return saved;
  }

  /**
   * ----------------------------------------------------------
   * STATUS TRANSITION VALIDATION
   * ----------------------------------------------------------
   */

  function getAllowedTransitions() {
    return {
      PENDING: ["CONFIRMED", "CANCELLED"],

      CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],

      CHECKED_IN: ["COMPLETED"],

      COMPLETED: [],

      CANCELLED: [],

      NO_SHOW: [],
    };
  }

  function assertStatusTransition(currentStatus, newStatus) {
    currentStatus = normalize(currentStatus);

    newStatus = normalize(newStatus);

    if (currentStatus === newStatus) {
      return true;
    }

    const transitions = getAllowedTransitions();

    const allowed = transitions[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        "Invalid reservation status transition: " +
          currentStatus +
          " -> " +
          newStatus,
      );
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * CHANGE STATUS
   * ----------------------------------------------------------
   */

  function changeStatus(reservationId, newStatus, actorId) {
    actorId = normalizeActorId(actorId);

    const existing = requireReservation(reservationId);

    newStatus = normalize(newStatus);

    ValidationService.validateReference("RESERVATION_STATUS", newStatus);

    assertStatusTransition(existing.status, newStatus);

    if (normalize(existing.status) === newStatus) {
      return existing;
    }

    /*
     * If transitioning from a non-blocking state to a
     * blocking state in the future, availability must
     * be revalidated.
     *
     * Current MVP lifecycle does not normally allow
     * terminal states to reopen, but keeping this rule
     * here makes the invariant explicit.
     */

    if (!isBlockingStatus(existing.status) && isBlockingStatus(newStatus)) {
      assertAvailable(
        existing.unit_id,
        existing.check_in_date,
        existing.check_out_date,
        existing.reservation_id,
      );
    }

    const updated = Object.assign({}, existing, {
      status: newStatus,

      updated_at: timestamp(),
    });

    /*
     * Optional lifecycle timestamps.
     *
     * BaseRepository will only persist these when matching
     * columns exist in 09_Reservations.
     */

    if (newStatus === "CHECKED_IN") {
      updated.checked_in_at = timestamp();
    }

    if (newStatus === "COMPLETED") {
      updated.completed_at = timestamp();
    }

    if (newStatus === "CANCELLED") {
      updated.cancelled_at = timestamp();
    }

    if (newStatus === "NO_SHOW") {
      updated.no_show_at = timestamp();
    }

    const saved = BaseRepository.update(
      CONFIG.SHEETS.RESERVATIONS,
      "reservation_id",
      reservationId,
      updated,
    );

    AuditService.logStatusChange(
      ENTITY_TYPE,
      reservationId,
      existing.status,
      newStatus,
      actorId,
    );

    return saved;
  }

  /**
   * ----------------------------------------------------------
   * LIFECYCLE CONVENIENCE METHODS
   * ----------------------------------------------------------
   */

  function confirmReservation(reservationId, actorId) {
    return changeStatus(reservationId, "CONFIRMED", actorId);
  }

  function cancelReservation(reservationId, actorId) {
    return changeStatus(reservationId, "CANCELLED", actorId);
  }

  function checkInReservation(reservationId, actorId) {
    return changeStatus(reservationId, "CHECKED_IN", actorId);
  }

  function completeReservation(reservationId, actorId) {
    return changeStatus(reservationId, "COMPLETED", actorId);
  }

  function markNoShow(reservationId, actorId) {
    return changeStatus(reservationId, "NO_SHOW", actorId);
  }

  /**
   * ----------------------------------------------------------
   * QUERY HELPERS
   * ----------------------------------------------------------
   */

  function getByUnit(unitId) {
    return BaseRepository.findByField(
      CONFIG.SHEETS.RESERVATIONS,
      "unit_id",
      normalizeText(unitId),
    );
  }

  function getByCustomer(customerId) {
    return BaseRepository.findByField(
      CONFIG.SHEETS.RESERVATIONS,
      "customer_id",
      normalizeText(customerId),
    );
  }

  function getByStatus(status) {
    status = normalize(status);

    return getAll().filter(
      (reservation) => normalize(reservation.status) === status,
    );
  }

  function getByBookingSource(bookingSource) {
    bookingSource = normalize(bookingSource);

    return getAll().filter(
      (reservation) => normalize(reservation.booking_source) === bookingSource,
    );
  }

  function getBlockingReservations() {
    return getAll().filter((reservation) =>
      isBlockingStatus(reservation.status),
    );
  }

  function getActiveReservations() {
    return getBlockingReservations();
  }

  function getTerminalReservations() {
    return getAll().filter((reservation) =>
      isTerminalStatus(reservation.status),
    );
  }

  /**
   * ----------------------------------------------------------
   * DATE RANGE QUERY
   * ----------------------------------------------------------
   */

  function getReservationsForDateRange(startDate, endDate, options) {
    options = options || {};

    AvailabilityService.validateDateRange(startDate, endDate);

    const unitId = normalizeText(options.unit_id);

    const propertyId = normalizeText(options.property_id);

    const includeNonBlocking = options.include_non_blocking === true;

    let reservations = getAll();

    if (unitId) {
      reservations = reservations.filter(
        (reservation) => normalizeText(reservation.unit_id) === unitId,
      );
    }

    if (propertyId) {
      const propertyUnitIds = new Set(
        UnitService.getUnitsByProperty(propertyId).map((unit) =>
          normalizeText(unit.unit_id),
        ),
      );

      reservations = reservations.filter((reservation) =>
        propertyUnitIds.has(normalizeText(reservation.unit_id)),
      );
    }

    if (!includeNonBlocking) {
      reservations = reservations.filter((reservation) =>
        isBlockingStatus(reservation.status),
      );
    }

    return reservations.filter((reservation) => {
      if (
        isBlank(reservation.check_in_date) ||
        isBlank(reservation.check_out_date)
      ) {
        return false;
      }

      try {
        return AvailabilityService.rangesOverlap(
          reservation.check_in_date,
          reservation.check_out_date,
          startDate,
          endDate,
        );
      } catch (err) {
        return false;
      }
    });
  }

  /**
   * ----------------------------------------------------------
   * CURRENT / UPCOMING RESERVATIONS
   * ----------------------------------------------------------
   */

  function today() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE,
    );
  }

  function getCurrentReservations() {
    const currentDate = today();

    return getBlockingReservations().filter((reservation) => {
      try {
        return (
          AvailabilityService.dateToNumber(reservation.check_in_date) <=
            AvailabilityService.dateToNumber(currentDate) &&
          AvailabilityService.dateToNumber(currentDate) <
            AvailabilityService.dateToNumber(reservation.check_out_date)
        );
      } catch (err) {
        return false;
      }
    });
  }

  function getUpcomingReservations() {
    const currentDate = today();

    return getBlockingReservations()
      .filter((reservation) => {
        try {
          return (
            AvailabilityService.dateToNumber(reservation.check_in_date) >
            AvailabilityService.dateToNumber(currentDate)
          );
        } catch (err) {
          return false;
        }
      })
      .sort(
        (a, b) =>
          AvailabilityService.dateToNumber(a.check_in_date) -
          AvailabilityService.dateToNumber(b.check_in_date),
      );
  }

  /**
   * ----------------------------------------------------------
   * ARRIVALS / DEPARTURES
   * ----------------------------------------------------------
   */

  function getArrivals(date) {
    date = AvailabilityService.normalizeDate(date || today());

    return getAll().filter(
      (reservation) =>
        normalize(reservation.status) === "CONFIRMED" &&
        AvailabilityService.normalizeDate(reservation.check_in_date) === date,
    );
  }

  function getDepartures(date) {
    date = AvailabilityService.normalizeDate(date || today());

    return getAll().filter(
      (reservation) =>
        normalize(reservation.status) === "CHECKED_IN" &&
        AvailabilityService.normalizeDate(reservation.check_out_date) === date,
    );
  }

  /**
   * ----------------------------------------------------------
   * RESERVATION SUMMARY
   * ----------------------------------------------------------
   */

  function getReservationSummary(reservationId) {
    const reservation = requireReservation(reservationId);

    const unit = UnitService.getUnitById(reservation.unit_id);

    let customer = null;

    if (!isBlank(reservation.customer_id)) {
      customer = CustomerService.getCustomerById(reservation.customer_id);
    }

    return {
      reservation: reservation,

      unit: unit,

      customer: customer,

      blocking: isBlockingStatus(reservation.status),

      terminal: isTerminalStatus(reservation.status),
    };
  }

  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {
    createReservation,

    updateReservation,

    getAll,

    getById,

    exists,

    requireReservation,

    getByUnit,

    getByCustomer,

    getByStatus,

    getByBookingSource,

    getBlockingReservations,

    getActiveReservations,

    getTerminalReservations,

    getReservationsForDateRange,

    getCurrentReservations,

    getUpcomingReservations,

    getArrivals,

    getDepartures,

    getReservationSummary,

    validateReservation,

    isBlockingStatus,

    isTerminalStatus,

    assertAvailable,

    getAllowedTransitions,

    assertStatusTransition,

    changeStatus,

    confirmReservation,

    cancelReservation,

    checkInReservation,

    completeReservation,

    markNoShow,
  };
})();
