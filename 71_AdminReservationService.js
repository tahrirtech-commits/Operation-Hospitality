/**

 \* ============================================================================

 \* 71_AdminReservationService.gs

 \* RENTAL OPERATIONS MVP

 \* PHASE 6.2 - ADMIN RESERVATION FACADE

 \* ============================================================================

 \*

 \* UI-facing application facade for reservation administration.

 \*

 \* AUTHORITIES

 \* - AvailabilityService: availability / sellability.

 \* - ReservationService: reservation reads and reservation semantics.

 \* - ReservationWorkflowService: reservation workflow writes.

 \* - OTABlockService / ReservationGuestService: exposed through workflow view.

 \*

 \* This service does NOT write directly to Google Sheets.

 \* ============================================================================

 */

const AdminReservationService = (() => {
  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function text(value) {
    return isBlank(value) ? "" : String(value).trim();
  }

  function upper(value) {
    return text(value).toUpperCase();
  }

  function requireObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error((name || "Input") + " must be an object.");
    }

    return value;
  }

  function normalizeActor(actorId) {
    return text(actorId) || "SYSTEM";
  }

  function normalizeDate(value) {
    return AvailabilityService.normalizeDate(value);
  }

  function requireProperty(propertyId) {
    propertyId = text(propertyId);

    if (!propertyId) {
      throw new Error("property_id is required.");
    }

    const property = PropertyService.getPropertyById(propertyId);

    if (!property) {
      throw new Error("Property not found: " + propertyId);
    }

    return property;
  }

  function requireUnit(unitId) {
    unitId = text(unitId);

    if (!unitId) {
      throw new Error("unit_id is required.");
    }

    const unit = UnitService.getUnitById(unitId);

    if (!unit) {
      throw new Error("Unit not found: " + unitId);
    }

    return unit;
  }

  function requireReservation(reservationId) {
    reservationId = text(reservationId);

    if (!reservationId) {
      throw new Error("reservation_id is required.");
    }

    return ReservationService.requireReservation(reservationId);
  }

  function getCustomer(reservation) {
    if (!reservation || isBlank(reservation.customer_id)) {
      return null;
    }

    return CustomerService.getCustomerById(reservation.customer_id) || null;
  }

  function getCustomerName(customer) {
    if (!customer) return "";

    if (typeof CustomerService.getDisplayName === "function") {
      try {
        return CustomerService.getDisplayName(customer);
      } catch (err) {}
    }

    return (
      text(customer.full_name) ||
      text(customer.name) ||
      [text(customer.first_name), text(customer.last_name)]

        .filter(Boolean)
        .join(" ") ||
      text(customer.customer_id)
    );
  }

  function enrichReservation(reservation) {
    if (!reservation) return null;

    const unit = UnitService.getUnitById(reservation.unit_id) || null;

    const property = unit
      ? PropertyService.getPropertyById(unit.property_id)
      : null;

    const customer = getCustomer(reservation);

    return {
      reservation: reservation,

      unit: unit,

      property: property,

      customer: customer,

      customer_name: getCustomerName(customer),

      blocking: ReservationService.isBlockingStatus(reservation.status),

      terminal: ReservationService.isTerminalStatus(reservation.status),

      allowed_transitions:
        typeof ReservationService.getAllowedTransitions === "function"
          ? ReservationService.getAllowedTransitions(reservation.status)
          : [],
    };
  }

  /**

   \* Availability search for the reservation screen.

   \*

   \* request:

   \* {

   \*   property_id,

   \*   start_date,

   \*   end_date,

   \*   unit_type?        // optional

   \* }

   */

  function searchAvailability(request) {
    requireObject(request, "Availability request");

    const property = requireProperty(request.property_id);

    const startDate = normalizeDate(request.start_date);

    const endDate = normalizeDate(request.end_date);

    AvailabilityService.validateDateRange(startDate, endDate);

    const filters = {
      property_id: property.property_id,
    };

    if (!isBlank(request.unit_type)) {
      filters.unit_type = text(request.unit_type);
    }

    const units = AvailabilityService.getAvailableUnits(
      startDate,

      endDate,

      filters,
    );

    return {
      property: property,

      start_date: startDate,

      end_date: endDate,

      count: units.length,

      units: units,
    };
  }

  /**

   \* Detailed availability for one unit.

   */

  function checkUnitAvailability(request) {
    requireObject(request, "Availability request");

    const unit = requireUnit(request.unit_id);

    const startDate = normalizeDate(request.start_date);

    const endDate = normalizeDate(request.end_date);

    AvailabilityService.validateDateRange(startDate, endDate);

    return {
      unit: unit,

      availability: AvailabilityService.checkAvailability(
        unit.unit_id,

        startDate,

        endDate,

        request.options || null,
      ),
    };
  }

  /**

   \* Reservation list/query for Admin UI.

   \*

   \* filters:

   \* {

   \*   property_id?,

   \*   unit_id?,

   \*   customer_id?,

   \*   status?,

   \*   booking_source?,

   \*   start_date?,

   \*   end_date?,

   \*   include_non_blocking?

   \* }

   */

  function listReservations(filters) {
    filters = filters || {};

    let rows;

    if (!isBlank(filters.start_date) || !isBlank(filters.end_date)) {
      if (isBlank(filters.start_date) || isBlank(filters.end_date)) {
        throw new Error(
          "start_date and end_date must both be supplied for date-range search.",
        );
      }

      const startDate = normalizeDate(filters.start_date);
      const endDate = normalizeDate(filters.end_date);

      AvailabilityService.validateDateRange(startDate, endDate);

      rows = ReservationService.getReservationsForDateRange(
        startDate,
        endDate,
        {
          property_id: text(filters.property_id),
          unit_id: text(filters.unit_id),
          include_non_blocking: filters.include_non_blocking === true,
        },
      );
    } else {
      rows = ReservationService.getAll();

      if (!isBlank(filters.property_id)) {
        const property = requireProperty(filters.property_id);
        const unitIds = new Set(
          UnitService.getUnitsByProperty(property.property_id).map((unit) =>
            text(unit.unit_id),
          ),
        );

        rows = rows.filter((row) => unitIds.has(text(row.unit_id)));
      }

      if (!isBlank(filters.unit_id)) {
        const unitId = requireUnit(filters.unit_id).unit_id;
        rows = rows.filter((row) => text(row.unit_id) === text(unitId));
      }
    }

    if (!isBlank(filters.customer_id)) {
      rows = rows.filter(
        (row) => text(row.customer_id) === text(filters.customer_id),
      );
    }

    if (!isBlank(filters.status)) {
      const status = upper(filters.status);
      rows = rows.filter((row) => upper(row.status) === status);
    }

    if (!isBlank(filters.booking_source)) {
      const source = upper(filters.booking_source);
      rows = rows.filter((row) => upper(row.booking_source) === source);
    }

    rows = rows.slice().sort((a, b) => {
      const ad = text(a.check_in_date);
      const bd = text(b.check_in_date);
      if (ad !== bd) return ad.localeCompare(bd);
      return text(a.reservation_id).localeCompare(text(b.reservation_id));
    });

    /*
     * PERFORMANCE PATCH 4
     *
     * Bulk-load enrichment dependencies once, then join in memory.
     * This preserves the exact list response shape while eliminating
     * per-reservation Unit and Customer reads.
     */
    const allUnits = UnitService.getAllUnits();
    const allCustomers = CustomerService.getAllCustomers();

    const unitMap = new Map(allUnits.map((unit) => [text(unit.unit_id), unit]));

    const customerMap = new Map(
      allCustomers.map((customer) => [text(customer.customer_id), customer]),
    );

    /*
     * Only resolve properties actually referenced by returned reservations.
     * Property lookup count is therefore bounded by distinct properties,
     * not reservation count.
     */
    const propertyIds = new Set();

    rows.forEach((row) => {
      const unit = unitMap.get(text(row.unit_id));
      if (unit && !isBlank(unit.property_id)) {
        propertyIds.add(text(unit.property_id));
      }
    });

    const propertyMap = new Map();

    propertyIds.forEach((propertyId) => {
      const property = PropertyService.getPropertyById(propertyId);
      if (property) {
        propertyMap.set(propertyId, property);
      }
    });

    return rows.map((reservation) => {
      const unit = unitMap.get(text(reservation.unit_id)) || null;

      const property = unit
        ? propertyMap.get(text(unit.property_id)) || null
        : null;

      const customer = isBlank(reservation.customer_id)
        ? null
        : customerMap.get(text(reservation.customer_id)) || null;

      return {
        reservation: reservation,
        unit: unit,
        property: property,
        customer: customer,
        customer_name: getCustomerName(customer),
        blocking: ReservationService.isBlockingStatus(reservation.status),
        terminal: ReservationService.isTerminalStatus(reservation.status),
        allowed_transitions:
          typeof ReservationService.getAllowedTransitions === "function"
            ? ReservationService.getAllowedTransitions(reservation.status)
            : [],
      };
    });
  }

  /**

   \* Complete UI-oriented reservation view.

   \* Workflow view is authoritative for guests, OTA blocks and unit ops status.

   */

  function getReservation(reservationId) {
    const reservation = requireReservation(reservationId);

    const summary = enrichReservation(reservation);

    const workflow = ReservationWorkflowService.getReservationWorkflow(
      reservation.reservation_id,
    );

    return Object.assign({}, summary, {
      guests: workflow.guests || [],

      ota_blocks: workflow.ota_blocks || [],

      operational_status: workflow.operational_status || null,
    });
  }

  /**

   \* DIRECT reservation creation.

   \*

   \* request:

   \* {

   \*   reservation: {...},

   \*   guests: [{guest_id, role}],

   \*   ota_sources: ['AIRBNB','BOOKING_COM'],

   \*   actor_id

   \* }

   */

  function createDirectReservation(request) {
    requireObject(request, "Direct reservation request");

    requireObject(request.reservation, "reservation");

    const reservation = Object.assign({}, request.reservation);

    const guests = Array.isArray(request.guests) ? request.guests : [];

    const otaSources = Array.isArray(request.ota_sources)
      ? request.ota_sources
      : [];

    const actorId = normalizeActor(request.actor_id);

    // Pre-flight check for faster UI feedback.

    if (ReservationService.isBlockingStatus(reservation.status || "PENDING")) {
      ReservationService.assertAvailable(
        reservation.unit_id,

        reservation.check_in_date,

        reservation.check_out_date,

        null,
      );
    }

    // Workflow re-checks availability inside its lock.

    return ReservationWorkflowService.createDirectReservation(
      reservation,

      guests,

      otaSources,

      actorId,
    );
  }

  function confirmReservation(reservationId, actorId) {
    requireReservation(reservationId);

    return ReservationWorkflowService.confirmReservation(
      text(reservationId),

      normalizeActor(actorId),
    );
  }

  function cancelReservation(reservationId, actorId, reason) {
    requireReservation(reservationId);

    return ReservationWorkflowService.cancelReservation(
      text(reservationId),

      normalizeActor(actorId),

      text(reason),
    );
  }

  /**

   \* ReservationWorkflowService.checkIn is authoritative because it also

   \* coordinates the operational unit status.

   */

  function checkInReservation(reservationId, actorId) {
    requireReservation(reservationId);

    return ReservationWorkflowService.checkIn(
      text(reservationId),

      normalizeActor(actorId),
    );
  }

  function markNoShow(reservationId, actorId) {
    requireReservation(reservationId);

    return ReservationWorkflowService.markNoShow(
      text(reservationId),

      normalizeActor(actorId),
    );
  }

  /**

   \* Manual OTA-block completion belongs to OTABlockService.

   \* This is deliberately exposed separately from reservation confirmation.

   */

  function markOTABlockCompleted(otaBlockId, actorId, notes) {
    otaBlockId = text(otaBlockId);

    if (!otaBlockId) {
      throw new Error("ota_block_id is required.");
    }

    if (typeof OTABlockService.markBlocked !== "function") {
      throw new Error(
        "OTABlockService.markBlocked() is not available in the current frozen API.",
      );
    }

    return OTABlockService.markBlocked(
      otaBlockId,

      normalizeActor(actorId),

      text(notes),
    );
  }

  function getArrivals(propertyId, date) {
    const property = requireProperty(propertyId);

    date = normalizeDate(date);

    const unitIds = new Set(
      UnitService.getUnitsByProperty(property.property_id)

        .map((unit) => text(unit.unit_id)),
    );

    return ReservationService.getArrivals(date)

      .filter((row) => unitIds.has(text(row.unit_id)))

      .map(enrichReservation);
  }

  function getDepartures(propertyId, date) {
    const property = requireProperty(propertyId);

    date = normalizeDate(date);

    const unitIds = new Set(
      UnitService.getUnitsByProperty(property.property_id)

        .map((unit) => text(unit.unit_id)),
    );

    return ReservationService.getDepartures(date)

      .filter((row) => unitIds.has(text(row.unit_id)))

      .map(enrichReservation);
  }

  return {
    searchAvailability,

    checkUnitAvailability,

    listReservations,

    getReservation,

    createDirectReservation,

    confirmReservation,

    cancelReservation,

    checkInReservation,

    markNoShow,

    markOTABlockCompleted,

    getArrivals,

    getDepartures,
  };
})();
