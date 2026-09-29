/**
 * ============================================================================
 * 70_DashboardService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.1 - ADMIN DASHBOARD READ MODEL
 * ============================================================================
 *
 * Read-only application service for the Phase 6 Admin UI.
 *
 * RESPONSIBILITIES
 * - Build a UI-ready operational dashboard for one property/date.
 * - Delegate sellability to AvailabilityService.
 * - Delegate reservation date semantics to ReservationService / AvailabilityService.
 * - Read current operational state from OperationalStatusService.
 * - Reuse StayOperationsService for reservation-centric operational context.
 *
 * NON-RESPONSIBILITIES
 * - No writes.
 * - No status transitions.
 * - No direct creation/update of reservations, tasks, inspections or work orders.
 * - No reimplementation of availability business rules.
 *
 * Single-day availability is evaluated as:
 *   [date, date + 1 day)
 *
 * ============================================================================
 */

const DashboardService = (() => {

  const ACTIVE_UNIT_STATUS = 'ACTIVE';

  const ACTIVE_RESERVATION_STATUSES = new Set([
    'PENDING',
    'CONFIRMED',
    'CHECKED_IN'
  ]);

  const OPEN_HOUSEKEEPING_STATUSES = new Set([
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS'
  ]);

  const OPEN_INSPECTION_STATUSES = new Set([
    'PENDING',
    'SCHEDULED',
    'IN_PROGRESS'
  ]);

  const OPEN_MAINTENANCE_STATUSES = new Set([
    'OPEN',
    'SCHEDULED',
    'IN_PROGRESS'
  ]);


  // ==========================================================================
  // BASIC HELPERS
  // ==========================================================================

  function isBlank(value) {
    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );
  }


  function text(value) {
    return isBlank(value)
      ? ''
      : String(value).trim();
  }


  function upper(value) {
    return text(value).toUpperCase();
  }


  function today() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );
  }


  function normalizeDate(value) {
    return AvailabilityService.normalizeDate(
      value || today()
    );
  }


  function addDays(dateValue, days) {
    const normalized = normalizeDate(dateValue);
    const parts = normalized.split('-');

    const date = new Date(Date.UTC(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    ));

    date.setUTCDate(
      date.getUTCDate() + Number(days || 0)
    );

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
  }


  function sameId(a, b) {
    return text(a) === text(b);
  }


  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }


  function safeCall(callback, fallback) {
    try {
      return callback();
    } catch (err) {
      return fallback;
    }
  }


  function sortByDateAndId(rows, dateField, idField) {
    return safeArray(rows)
      .slice()
      .sort((a, b) => {
        const ad = text(a && a[dateField]);
        const bd = text(b && b[dateField]);

        if (ad !== bd) {
          return ad.localeCompare(bd);
        }

        return text(a && a[idField])
          .localeCompare(text(b && b[idField]));
      });
  }


  // ==========================================================================
  // PROPERTY / UNIT HELPERS
  // ==========================================================================

  function requireProperty(propertyId) {
    propertyId = text(propertyId);

    if (!propertyId) {
      throw new Error(
        'property_id is required.'
      );
    }

    const property =
      PropertyService.getPropertyById(
        propertyId
      );

    if (!property) {
      throw new Error(
        'Property not found: ' + propertyId
      );
    }

    return property;
  }


  function getPropertyUnits(propertyId) {
    return UnitService
      .getUnitsByProperty(propertyId)
      .slice()
      .sort((a, b) => {
        const ac =
          text(a.unit_code) ||
          text(a.unit_name) ||
          text(a.unit_id);

        const bc =
          text(b.unit_code) ||
          text(b.unit_name) ||
          text(b.unit_id);

        return ac.localeCompare(bc);
      });
  }


  function getUnitMap(units) {
    const map = {};

    safeArray(units).forEach(unit => {
      map[text(unit.unit_id)] = unit;
    });

    return map;
  }


  function getOperationalStatus(unitId) {
    return OperationalStatusService
      .getStatus(unitId);
  }


  // ==========================================================================
  // PERFORMANCE PATCH 2 - DASHBOARD BATCH READ HELPERS
  // ==========================================================================
  //
  // These helpers are intentionally used by getDashboard() only.
  // Public component methods keep their Phase 6.1 behavior/contract.
  //
  // Availability remains authoritative in AvailabilityService.
  // We batch only read-only lookup data that was previously fetched
  // repeatedly per unit / reservation.
  // ==========================================================================

  function getOperationalStatusMap(unitIds) {
    const unitSet = new Set(
      safeArray(unitIds).map(text)
    );

    const map = {};

    BaseRepository
      .findAll(
        CONFIG.SHEETS
          .UNIT_OPERATIONAL_STATUS
      )
      .forEach(row => {
        const unitId =
          text(row.unit_id);

        if (
          unitSet.has(unitId) &&
          !map[unitId]
        ) {
          map[unitId] = row;
        }
      });

    return map;
  }


  function getCustomerMap(customerIds) {
    const customerSet = new Set(
      safeArray(customerIds)
        .map(text)
        .filter(Boolean)
    );

    const map = {};

    if (customerSet.size === 0) {
      return map;
    }

    BaseRepository
      .findAll(
        CONFIG.SHEETS.CUSTOMERS
      )
      .forEach(row => {
        const customerId =
          text(row.customer_id);

        if (customerSet.has(customerId)) {
          map[customerId] = row;
        }
      });

    return map;
  }


  function getCustomerIdsFromReservations(
    reservations
  ) {
    return Array.from(
      new Set(
        safeArray(reservations)
          .map(row =>
            text(
              row &&
              row.customer_id
            )
          )
          .filter(Boolean)
      )
    );
  }


  function buildUnitBoardRowFromContext(
    unit,
    date,
    reservationsForDay,
    operationalStatusMap,
    customerMap,
    availabilityMap
  ) {
    const availability =
      availabilityMap[
        text(unit.unit_id)
      ];

    const operationalStatus =
      operationalStatusMap[
        text(unit.unit_id)
      ] || null;

    const reservation =
      getActiveReservationForUnit(
        unit.unit_id,
        date,
        reservationsForDay
      );

    const customer =
      reservation
        ? (
            customerMap[
              text(
                reservation.customer_id
              )
            ] || null
          )
        : null;

    return {
      unit_id:
        unit.unit_id,

      unit_code:
        unit.unit_code || '',

      unit_name:
        unit.unit_name || '',

      unit_type:
        unit.unit_type || '',

      property_id:
        unit.property_id || '',

      master_status:
        upper(unit.status),

      operational_status:
        operationalStatus
          ? upper(
              operationalStatus
                .operational_status
            )
          : '',

      operational_status_record:
        operationalStatus || null,

      reservation:
        reservation || null,

      customer:
        customer || null,

      customer_name:
        getCustomerDisplayName(
          customer
        ),

      sellable:
        availability.available === true,

      availability:
        availability,

      attention_required:
        (
          upper(unit.status) ===
            ACTIVE_UNIT_STATUS &&
          (
            !operationalStatus ||
            upper(
              operationalStatus
                .operational_status
            ) !== 'READY'
          )
        )
    };
  }


  function enrichReservationFromContext(
    reservation,
    unitMap,
    operationalStatusMap,
    customerMap
  ) {
    const unit =
      unitMap[
        text(
          reservation.unit_id
        )
      ] || null;

    const customer =
      customerMap[
        text(
          reservation.customer_id
        )
      ] || null;

    let stayOperations = null;

    if (
      typeof StayOperationsService !==
        'undefined' &&
      StayOperationsService &&
      typeof StayOperationsService
        .getStayOperations === 'function'
    ) {
      stayOperations =
        safeCall(
          () =>
            StayOperationsService
              .getStayOperations(
                reservation
                  .reservation_id
              ),
          null
        );
    }

    return {
      reservation:
        reservation,

      unit:
        unit,

      customer:
        customer,

      customer_name:
        getCustomerDisplayName(
          customer
        ),

      operational_status:
        stayOperations
          ? stayOperations
              .operational_status
          : (
              unit
                ? (
                    operationalStatusMap[
                      text(unit.unit_id)
                    ] || null
                  )
                : null
            ),

      stay_operations:
        stayOperations
    };
  }


  // ==========================================================================
  // RESERVATION HELPERS
  // ==========================================================================

  function getPropertyArrivals(propertyId, date, unitMap) {
    return ReservationService
      .getArrivals(date)
      .filter(reservation =>
        !!unitMap[text(reservation.unit_id)]
      );
  }


  function getPropertyDepartures(propertyId, date, unitMap) {
    return ReservationService
      .getDepartures(date)
      .filter(reservation =>
        !!unitMap[text(reservation.unit_id)]
      );
  }


  function getReservationsForDay(propertyId, date) {
    const endDate = addDays(date, 1);

    return ReservationService
      .getReservationsForDateRange(
        date,
        endDate,
        {
          property_id: propertyId,
          include_non_blocking: true
        }
      );
  }


  function getActiveReservationForUnit(
    unitId,
    date,
    reservationsForDay
  ) {
    const candidates =
      safeArray(reservationsForDay)
        .filter(reservation =>
          sameId(
            reservation.unit_id,
            unitId
          )
        )
        .filter(reservation =>
          ACTIVE_RESERVATION_STATUSES
            .has(
              upper(
                reservation.status
              )
            )
        );

    if (candidates.length === 0) {
      return null;
    }

    const priority = {
      CHECKED_IN: 1,
      CONFIRMED: 2,
      PENDING: 3
    };

    candidates.sort((a, b) => {
      const ap =
        priority[upper(a.status)] || 99;
      const bp =
        priority[upper(b.status)] || 99;

      if (ap !== bp) {
        return ap - bp;
      }

      return text(a.check_in_date)
        .localeCompare(
          text(b.check_in_date)
        );
    });

    return candidates[0];
  }


  function getCustomerForReservation(reservation) {
    if (
      !reservation ||
      isBlank(reservation.customer_id)
    ) {
      return null;
    }

    return safeCall(
      () =>
        CustomerService.getCustomerById(
          reservation.customer_id
        ),
      null
    );
  }


  function getCustomerDisplayName(customer) {
    if (!customer) {
      return '';
    }

    if (
      typeof CustomerService
        .getDisplayName === 'function'
    ) {
      return safeCall(
        () =>
          CustomerService.getDisplayName(
            customer
          ),
        ''
      );
    }

    return (
      text(customer.full_name) ||
      text(customer.name) ||
      [
        text(customer.first_name),
        text(customer.last_name)
      ].filter(Boolean).join(' ') ||
      text(customer.customer_id)
    );
  }


  // ==========================================================================
  // AVAILABILITY / UNIT BOARD
  // ==========================================================================

  function buildUnitBoardRow(
    unit,
    date,
    reservationsForDay
  ) {
    const endDate = addDays(date, 1);

    const availability =
      AvailabilityService
        .checkAvailability(
          unit.unit_id,
          date,
          endDate
        );

    const operationalStatus =
      getOperationalStatus(
        unit.unit_id
      );

    const reservation =
      getActiveReservationForUnit(
        unit.unit_id,
        date,
        reservationsForDay
      );

    const customer =
      getCustomerForReservation(
        reservation
      );

    return {
      unit_id:
        unit.unit_id,

      unit_code:
        unit.unit_code || '',

      unit_name:
        unit.unit_name || '',

      unit_type:
        unit.unit_type || '',

      property_id:
        unit.property_id || '',

      master_status:
        upper(unit.status),

      operational_status:
        operationalStatus
          ? upper(
              operationalStatus
                .operational_status
            )
          : '',

      operational_status_record:
        operationalStatus || null,

      reservation:
        reservation || null,

      customer:
        customer || null,

      customer_name:
        getCustomerDisplayName(
          customer
        ),

      sellable:
        availability.available === true,

      availability:
        availability,

      attention_required:
        (
          upper(unit.status) ===
            ACTIVE_UNIT_STATUS &&
          (
            !operationalStatus ||
            upper(
              operationalStatus
                .operational_status
            ) !== 'READY'
          )
        )
    };
  }


  function getUnitBoard(options) {
    options = options || {};

    const property =
      requireProperty(
        options.property_id
      );

    const date =
      normalizeDate(
        options.date
      );

    const units =
      getPropertyUnits(
        property.property_id
      );

    const reservationsForDay =
      getReservationsForDay(
        property.property_id,
        date
      );

    return units.map(unit =>
      buildUnitBoardRow(
        unit,
        date,
        reservationsForDay
      )
    );
  }


  // ==========================================================================
  // ARRIVALS / DEPARTURES
  // ==========================================================================

  function enrichReservation(
    reservation,
    unitMap
  ) {
    const unit =
      unitMap[
        text(
          reservation.unit_id
        )
      ] || null;

    const customer =
      getCustomerForReservation(
        reservation
      );

    let stayOperations = null;

    if (
      typeof StayOperationsService !==
        'undefined' &&
      StayOperationsService &&
      typeof StayOperationsService
        .getStayOperations === 'function'
    ) {
      stayOperations =
        safeCall(
          () =>
            StayOperationsService
              .getStayOperations(
                reservation
                  .reservation_id
              ),
          null
        );
    }

    return {
      reservation:
        reservation,

      unit:
        unit,

      customer:
        customer,

      customer_name:
        getCustomerDisplayName(
          customer
        ),

      operational_status:
        stayOperations
          ? stayOperations
              .operational_status
          : (
              unit
                ? getOperationalStatus(
                    unit.unit_id
                  )
                : null
            ),

      stay_operations:
        stayOperations
    };
  }


  function getArrivals(options) {
    options = options || {};

    const property =
      requireProperty(
        options.property_id
      );

    const date =
      normalizeDate(
        options.date
      );

    const units =
      getPropertyUnits(
        property.property_id
      );

    const unitMap =
      getUnitMap(units);

    return getPropertyArrivals(
      property.property_id,
      date,
      unitMap
    ).map(reservation =>
      enrichReservation(
        reservation,
        unitMap
      )
    );
  }


  function getDepartures(options) {
    options = options || {};

    const property =
      requireProperty(
        options.property_id
      );

    const date =
      normalizeDate(
        options.date
      );

    const units =
      getPropertyUnits(
        property.property_id
      );

    const unitMap =
      getUnitMap(units);

    return getPropertyDepartures(
      property.property_id,
      date,
      unitMap
    ).map(reservation =>
      enrichReservation(
        reservation,
        unitMap
      )
    );
  }


  // ==========================================================================
  // OPERATIONS
  // ==========================================================================

  function getOpenHousekeeping(unitIds) {
    const unitSet = new Set(unitIds);

    return BaseRepository
      .findAll(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS
      )
      .filter(row =>
        unitSet.has(
          text(row.unit_id)
        )
      )
      .filter(row =>
        OPEN_HOUSEKEEPING_STATUSES
          .has(
            upper(row.status)
          )
      );
  }


  function getOpenInspections(unitIds) {
    const unitSet = new Set(unitIds);

    return BaseRepository
      .findAll(
        CONFIG.SHEETS.INSPECTIONS
      )
      .filter(row =>
        unitSet.has(
          text(row.unit_id)
        )
      )
      .filter(row =>
        OPEN_INSPECTION_STATUSES
          .has(
            upper(row.status)
          )
      );
  }


  function getOpenMaintenance(unitIds) {
    const unitSet = new Set(unitIds);

    return BaseRepository
      .findAll(
        CONFIG.SHEETS
          .MAINTENANCE_WORK_ORDERS
      )
      .filter(row =>
        unitSet.has(
          text(row.unit_id)
        )
      )
      .filter(row =>
        OPEN_MAINTENANCE_STATUSES
          .has(
            upper(row.status)
          )
      );
  }


  function getOperations(options) {
    options = options || {};

    const property =
      requireProperty(
        options.property_id
      );

    const date =
      normalizeDate(
        options.date
      );

    const units =
      getPropertyUnits(
        property.property_id
      );

    const unitIds =
      units.map(unit =>
        text(unit.unit_id)
      );

    const housekeeping =
      getOpenHousekeeping(
        unitIds
      );

    const inspections =
      getOpenInspections(
        unitIds
      );

    const maintenance =
      getOpenMaintenance(
        unitIds
      );

    return {
      date:
        date,

      housekeeping:
        sortByDateAndId(
          housekeeping,
          'scheduled_date',
          'task_id'
        ),

      inspections:
        sortByDateAndId(
          inspections,
          'scheduled_at',
          'inspection_id'
        ),

      maintenance:
        sortByDateAndId(
          maintenance,
          'scheduled_date',
          'work_order_id'
        )
    };
  }


  // ==========================================================================
  // ALERTS
  // ==========================================================================

  function getAlerts(options) {
    options = options || {};

    const unitBoard =
      options.unit_board ||
      getUnitBoard(options);

    const operations =
      options.operations ||
      getOperations(options);

    const alerts = [];

    unitBoard.forEach(row => {
      const status =
        upper(
          row.operational_status
        );

      if (
        row.master_status ===
          ACTIVE_UNIT_STATUS &&
        !row.operational_status
      ) {
        alerts.push({
          severity: 'ERROR',
          type:
            'MISSING_OPERATIONAL_STATUS',
          unit_id:
            row.unit_id,
          message:
            'Active unit has no operational status.'
        });

        return;
      }

      if (
        status === 'DIRTY' ||
        status === 'CLEANING' ||
        status === 'INSPECTION' ||
        status === 'MAINTENANCE' ||
        status === 'OUT_OF_SERVICE' ||
        status === 'BLOCKED'
      ) {
        alerts.push({
          severity:
            status === 'OUT_OF_SERVICE'
              ? 'ERROR'
              : 'WARNING',

          type:
            'UNIT_NOT_READY',

          unit_id:
            row.unit_id,

          operational_status:
            status,

          message:
            'Unit ' +
            row.unit_id +
            ' is ' +
            status +
            '.'
        });
      }
    });


    operations.housekeeping
      .forEach(task => {
        alerts.push({
          severity: 'INFO',
          type:
            'HOUSEKEEPING_OPEN',
          unit_id:
            task.unit_id || '',
          entity_id:
            task.task_id || '',
          message:
            'Housekeeping task ' +
            task.task_id +
            ' is ' +
            upper(task.status) +
            '.'
        });
      });


    operations.inspections
      .forEach(inspection => {
        alerts.push({
          severity: 'INFO',
          type:
            'INSPECTION_OPEN',
          unit_id:
            inspection.unit_id || '',
          entity_id:
            inspection.inspection_id || '',
          message:
            'Inspection ' +
            inspection.inspection_id +
            ' is ' +
            upper(inspection.status) +
            '.'
        });
      });


    operations.maintenance
      .forEach(workOrder => {
        alerts.push({
          severity: 'WARNING',
          type:
            'MAINTENANCE_OPEN',
          unit_id:
            workOrder.unit_id || '',
          entity_id:
            workOrder.work_order_id || '',
          message:
            'Maintenance work order ' +
            workOrder.work_order_id +
            ' is ' +
            upper(workOrder.status) +
            '.'
        });
      });


    return alerts;
  }


  // ==========================================================================
  // KPIs
  // ==========================================================================

  function getKpis(options) {
    options = options || {};

    const unitBoard =
      options.unit_board ||
      getUnitBoard(options);

    const arrivals =
      options.arrivals ||
      getArrivals(options);

    const departures =
      options.departures ||
      getDepartures(options);

    const kpis = {
      total_units:
        unitBoard.length,

      active_units:
        0,

      occupied:
        0,

      reserved:
        0,

      ready:
        0,

      dirty:
        0,

      cleaning:
        0,

      inspection:
        0,

      maintenance:
        0,

      out_of_service:
        0,

      blocked:
        0,

      sellable:
        0,

      arrivals:
        arrivals.length,

      departures:
        departures.length
    };


    unitBoard.forEach(row => {
      if (
        row.master_status ===
        ACTIVE_UNIT_STATUS
      ) {
        kpis.active_units += 1;
      }

      if (row.sellable) {
        kpis.sellable += 1;
      }

      const status =
        upper(
          row.operational_status
        );

      if (status === 'OCCUPIED') {
        kpis.occupied += 1;
      } else if (
        status === 'RESERVED'
      ) {
        kpis.reserved += 1;
      } else if (
        status === 'READY'
      ) {
        kpis.ready += 1;
      } else if (
        status === 'DIRTY'
      ) {
        kpis.dirty += 1;
      } else if (
        status === 'CLEANING'
      ) {
        kpis.cleaning += 1;
      } else if (
        status === 'INSPECTION'
      ) {
        kpis.inspection += 1;
      } else if (
        status === 'MAINTENANCE'
      ) {
        kpis.maintenance += 1;
      } else if (
        status === 'OUT_OF_SERVICE'
      ) {
        kpis.out_of_service += 1;
      } else if (
        status === 'BLOCKED'
      ) {
        kpis.blocked += 1;
      }
    });


    return kpis;
  }


  // ==========================================================================
  // COMPLETE DASHBOARD
  // ==========================================================================

  function getDashboard(options) {
    options = options || {};

    const property =
      requireProperty(
        options.property_id
      );

    const date =
      normalizeDate(
        options.date
      );

    // ------------------------------------------------------------------------
    // PERFORMANCE PATCH 2
    //
    // Load the shared dashboard context once, then reuse it across:
    // - unit board
    // - arrivals / departures
    // - operations
    // - alerts
    // - KPIs
    //
    // Availability remains delegated per unit to AvailabilityService.
    // ------------------------------------------------------------------------

    const units =
      getPropertyUnits(
        property.property_id
      );

    const unitMap =
      getUnitMap(units);

    const unitIds =
      units.map(unit =>
        text(unit.unit_id)
      );

    const reservationsForDay =
      getReservationsForDay(
        property.property_id,
        date
      );

    // Arrivals/departures keep ReservationService as the authority for
    // reservation-date semantics, but unit/customer/status lookups below
    // reuse the shared dashboard context.
    const arrivalReservations =
      getPropertyArrivals(
        property.property_id,
        date,
        unitMap
      );

    const departureReservations =
      getPropertyDepartures(
        property.property_id,
        date,
        unitMap
      );

    const customerIds =
      getCustomerIdsFromReservations(
        reservationsForDay
          .concat(
            arrivalReservations,
            departureReservations
          )
      );

    const operationalStatusMap =
      getOperationalStatusMap(
        unitIds
      );

    const customerMap =
      getCustomerMap(
        customerIds
      );

    const availabilityResults =
      AvailabilityService
        .checkUnitsAvailability(
          unitIds,
          date,
          addDays(date, 1)
        );

    const availabilityMap = {};

    availabilityResults.forEach(
      availability => {
        availabilityMap[
          text(availability.unit_id)
        ] = availability;
      }
    );

    const unitBoard =
      units.map(unit =>
        buildUnitBoardRowFromContext(
          unit,
          date,
          reservationsForDay,
          operationalStatusMap,
          customerMap,
          availabilityMap
        )
      );

    const arrivals =
      arrivalReservations.map(
        reservation =>
          enrichReservationFromContext(
            reservation,
            unitMap,
            operationalStatusMap,
            customerMap
          )
      );

    const departures =
      departureReservations.map(
        reservation =>
          enrichReservationFromContext(
            reservation,
            unitMap,
            operationalStatusMap,
            customerMap
          )
      );

    // Reuse the unit IDs already loaded for the dashboard instead of
    // calling getOperations(), which would re-read property + units.
    const operations = {
      date:
        date,

      housekeeping:
        sortByDateAndId(
          getOpenHousekeeping(
            unitIds
          ),
          'scheduled_date',
          'task_id'
        ),

      inspections:
        sortByDateAndId(
          getOpenInspections(
            unitIds
          ),
          'scheduled_at',
          'inspection_id'
        ),

      maintenance:
        sortByDateAndId(
          getOpenMaintenance(
            unitIds
          ),
          'scheduled_date',
          'work_order_id'
        )
    };

    const alerts =
      getAlerts({
        property_id:
          property.property_id,
        date:
          date,
        unit_board:
          unitBoard,
        operations:
          operations
      });

    const kpis =
      getKpis({
        property_id:
          property.property_id,
        date:
          date,
        unit_board:
          unitBoard,
        arrivals:
          arrivals,
        departures:
          departures
      });

    return {
      generated_at:
        Utilities.formatDate(
          new Date(),
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      date:
        date,

      property:
        property,

      kpis:
        kpis,

      units:
        unitBoard,

      arrivals:
        arrivals,

      departures:
        departures,

      housekeeping:
        operations.housekeeping,

      inspections:
        operations.inspections,

      maintenance:
        operations.maintenance,

      alerts:
        alerts
    };
  }


  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {
    getDashboard,
    getKpis,
    getUnitBoard,
    getArrivals,
    getDepartures,
    getOperations,
    getAlerts
  };

})();
