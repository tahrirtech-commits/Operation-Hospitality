/**
 * ============================================================================
 * testWebApiService.gs
 * PHASE 6.5 / 6.7B - WEB API SERVICE v1.1 ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 * Tests only read routes, validation/error envelopes and dependency contracts.
 * No reservation/operations/finance write route is executed.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testWebApiService() {

  Logger.log('===== PHASE 6.7B WEB API SERVICE v1.1 TEST START =====');

  const results = [];

  function pass(name, detail) {
    results.push({name:name, passed:true, detail:detail || ''});
    Logger.log('PASS: ' + name + (detail ? ' | ' + detail : ''));
  }

  function fail(name, err) {
    const msg = err && err.message ? err.message : String(err);
    results.push({name:name, passed:false, detail:msg});
    Logger.log('FAIL: ' + name + ' | ' + msg);
  }

  function assertTrue(v, msg) {
    if (!v) throw new Error(msg || 'Assertion failed.');
  }

  function assertEqual(expected, actual, msg) {
    if (String(expected) !== String(actual)) {
      throw new Error(
        (msg ? msg + ' | ' : '') +
        'Expected=' + expected + ', Actual=' + actual
      );
    }
  }

  function run(name, fn) {
    try { pass(name, fn() || ''); }
    catch (err) { fail(name, err); }
  }

  const properties = PropertyService.getAllProperties();
  assertTrue(properties.length > 0, 'No properties found.');

  const propertyId = properties[0].property_id;
  const units = UnitService.getUnitsByProperty(propertyId);
  assertTrue(units.length > 0, 'No units found.');
  const unitId = units[0].unit_id;

  const today = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    CONFIG.DATE_FORMATS.DATE
  );

  const startDate = '2026-01-01';
  const endDate = '2026-12-31';

  Logger.log('Property: ' + propertyId);
  Logger.log('Unit: ' + unitId);
  Logger.log('Date: ' + today);

  run('1. Public WebApiService contract exists', () => {
    ['call', 'execute', 'getActions'].forEach(name =>
      assertTrue(
        typeof WebApiService[name] === 'function',
        'Missing WebApiService.' + name
      )
    );
    return '3 methods';
  });

  let actions;

  run('2. Explicit API allowlist is available', () => {
    actions = WebApiService.getActions();
    assertTrue(Array.isArray(actions), 'getActions did not return array');
    assertTrue(actions.length > 0, 'No API actions registered');
    assertEqual(
      actions.length,
      new Set(actions).size,
      'Duplicate API action'
    );
    assertEqual(
      73,
      actions.length,
      'Expected 65 existing + 8 reference actions'
    );
    return 'actions=' + actions.length;
  });

  run('2A. Reference routes are explicitly allowlisted', () => {
    const expected = [
      'reference.bootstrap',
      'reference.properties',
      'reference.units',
      'reference.customers',
      'reference.guests',
      'reference.staff',
      'reference.values',
      'reference.bundle'
    ];

    const set = new Set(actions);
    expected.forEach(action =>
      assertTrue(
        set.has(action),
        'Missing reference action: ' + action
      )
    );

    return '8 reference actions';
  });

  run('2B. Reference bootstrap route matches facade', () => {
    const api = WebApiService.call(
      'reference.bootstrap',
      {}
    );

    const expected =
      AdminReferenceService.getBootstrap();

    assertTrue(
      api.success === true,
      api.error && api.error.message
    );

    assertEqual(
      expected.properties.length,
      api.data.properties.length
    );

    assertEqual(
      expected.default_property_id,
      api.data.default_property_id
    );

    return (
      'properties=' +
      api.data.properties.length
    );
  });

  run('2C. Reference property route works', () => {
    const api = WebApiService.call(
      'reference.properties',
      {}
    );

    assertTrue(
      api.success === true,
      api.error && api.error.message
    );

    assertTrue(
      Array.isArray(api.data),
      'Property response is not array'
    );

    return 'properties=' + api.data.length;
  });

  run('2D. Reference unit route works', () => {
    const api = WebApiService.call(
      'reference.units',
      {
        property_id: propertyId
      }
    );

    assertTrue(
      api.success === true,
      api.error && api.error.message
    );

    assertTrue(
      Array.isArray(api.data),
      'Unit response is not array'
    );

    api.data.forEach(row =>
      assertEqual(
        propertyId,
        row.property_id,
        'Wrong property unit returned'
      )
    );

    return 'units=' + api.data.length;
  });

  run('2E. Reference customer and guest routes work', () => {
    const customers =
      WebApiService.call(
        'reference.customers',
        {}
      );

    const guests =
      WebApiService.call(
        'reference.guests',
        {}
      );

    assertTrue(
      customers.success === true,
      customers.error &&
      customers.error.message
    );

    assertTrue(
      guests.success === true,
      guests.error &&
      guests.error.message
    );

    return (
      'customers=' +
      customers.data.length +
      ', guests=' +
      guests.data.length
    );
  });

  run('2F. Reference staff route works', () => {
    const api = WebApiService.call(
      'reference.staff',
      {
        property_id: propertyId
      }
    );

    assertTrue(
      api.success === true,
      api.error && api.error.message
    );

    api.data.forEach(row =>
      assertEqual(
        propertyId,
        row.property_id,
        'Wrong property staff returned'
      )
    );

    return 'staff=' + api.data.length;
  });

  run('2G. Reference value and bundle routes work', () => {
    const values =
      WebApiService.call(
        'reference.values',
        {
          category:
            'BOOKING_SOURCE'
        }
      );

    const bundle =
      WebApiService.call(
        'reference.bundle',
        {
          categories: [
            'BOOKING_SOURCE',
            'RESERVATION_STATUS'
          ]
        }
      );

    assertTrue(
      values.success === true,
      values.error &&
      values.error.message
    );

    assertTrue(
      bundle.success === true,
      bundle.error &&
      bundle.error.message
    );

    assertTrue(
      Array.isArray(
        bundle.data
          .BOOKING_SOURCE
      ),
      'Bundle BOOKING_SOURCE missing'
    );

    return (
      'values=' +
      values.data.length +
      ', categories=' +
      Object.keys(bundle.data).length
    );
  });

  run('2H. Reference route validation remains controlled', () => {
    const missingProperty =
      WebApiService.call(
        'reference.units',
        {}
      );

    const missingCategory =
      WebApiService.call(
        'reference.values',
        {}
      );

    const badBundle =
      WebApiService.call(
        'reference.bundle',
        {
          categories:
            'BOOKING_SOURCE'
        }
      );

    [
      missingProperty,
      missingCategory,
      badBundle
    ].forEach(response => {
      assertTrue(
        response.success === false,
        'Expected controlled failure'
      );

      assertEqual(
        'VALIDATION_ERROR',
        response.error.code
      );
    });

    return 'validation envelopes verified';
  });

  run('3. Dashboard route matches DashboardService', () => {
    const api = WebApiService.call('dashboard.get', {
      property_id: propertyId,
      date: today
    });
    const expected = DashboardService.getDashboard({
      property_id: propertyId,
      date: today
    });

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.property.property_id, api.data.property.property_id);
    assertEqual(expected.units.length, api.data.units.length);
    assertEqual(expected.arrivals.length, api.data.arrivals.length);
    assertEqual(expected.departures.length, api.data.departures.length);

    return 'units=' + api.data.units.length;
  });

  run('4. Dashboard KPI route matches facade', () => {
    const api = WebApiService.call('dashboard.kpis', {
      property_id: propertyId,
      date: today
    });
    const expected = DashboardService.getKpis({
      property_id: propertyId,
      date: today
    });

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(
      JSON.stringify(expected),
      JSON.stringify(api.data)
    );
    return 'matched';
  });

  run('5. Reservation list route matches facade', () => {
    const api = WebApiService.call('reservations.list', {
      property_id: propertyId
    });
    const expected = AdminReservationService.listReservations({
      property_id: propertyId
    });

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.length, api.data.length);

    return 'reservations=' + api.data.length;
  });

  run('6. Availability route matches facade', () => {
    const api = WebApiService.call('reservations.checkAvailability', {
      unit_id: unitId,
      start_date: today,
      end_date: addOneDayForWebApiTest_(today)
    });
    const expected = AdminReservationService.checkUnitAvailability({
      unit_id: unitId,
      start_date: today,
      end_date: addOneDayForWebApiTest_(today)
    });

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(
      expected.availability.available,
      api.data.availability.available
    );

    return 'available=' + api.data.availability.available;
  });

  run('7. Operations board route matches facade', () => {
    const api = WebApiService.call('operations.board', {
      property_id: propertyId
    });
    const expected = AdminOperationsService.getOperationsBoard(propertyId);

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.units.length, api.data.units.length);
    assertEqual(expected.housekeeping.length, api.data.housekeeping.length);
    assertEqual(expected.inspections.length, api.data.inspections.length);
    assertEqual(expected.maintenance.length, api.data.maintenance.length);

    return 'units=' + api.data.units.length;
  });

  run('8. Unit operations route matches facade', () => {
    const api = WebApiService.call('operations.unit', {
      unit_id: unitId
    });
    const expected = AdminOperationsService.getUnitOperations(unitId);

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.unit.unit_id, api.data.unit.unit_id);
    assertEqual(
      expected.housekeeping_tasks.length,
      api.data.housekeeping_tasks.length
    );

    return unitId;
  });

  run('9. Finance overview route matches facade', () => {
    const api = WebApiService.call('finance.overview', {
      property_id: propertyId,
      start_date: startDate,
      end_date: endDate,
      as_of_date: today
    });
    const expected = AdminFinanceService.getFinanceOverview(
      propertyId,
      startDate,
      endDate,
      today
    );

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.expenses.rows.length, api.data.expenses.rows.length);
    assertEqual(expected.utilities.bills.length, api.data.utilities.bills.length);
    assertEqual(expected.internet.services.length, api.data.internet.services.length);

    return 'expenses=' + api.data.expenses.rows.length;
  });

  run('10. Expense list route matches facade', () => {
    const api = WebApiService.call('finance.expenses.list', {
      property_id: propertyId
    });
    const expected = AdminFinanceService.listExpenses({
      property_id: propertyId
    });

    assertTrue(api.success === true, api.error && api.error.message);
    assertEqual(expected.length, api.data.length);

    return 'expenses=' + api.data.length;
  });

  run('11. Success envelope is stable', () => {
    const api = WebApiService.call('operations.unit', {
      unit_id: unitId
    });

    assertEqual(true, api.success);
    assertTrue(api.data !== null, 'data is null');
    assertEqual(null, api.error);
    assertTrue(api.meta && api.meta.action, 'meta.action missing');
    assertTrue(api.meta && api.meta.timestamp, 'meta.timestamp missing');

    return api.meta.action;
  });

  run('12. Unknown action returns controlled error', () => {
    const api = WebApiService.call('internal.deleteEverything', {});

    assertEqual(false, api.success);
    assertEqual(null, api.data);
    assertTrue(api.error && api.error.code, 'error.code missing');
    assertTrue(api.error && api.error.message, 'error.message missing');
    assertEqual('internal.deleteEverything', api.meta.action);

    return api.error.code;
  });

  run('13. Missing required parameter returns validation envelope', () => {
    const api = WebApiService.call('operations.unit', {});

    assertEqual(false, api.success);
    assertEqual('VALIDATION_ERROR', api.error.code);

    return api.error.code;
  });

  run('14. Invalid entity returns controlled error', () => {
    const api = WebApiService.call('operations.unit', {
      unit_id: 'UNIT-999999'
    });

    assertEqual(false, api.success);
    assertTrue(
      api.error.code === 'NOT_FOUND' ||
      api.error.code === 'APPLICATION_ERROR',
      'Unexpected code: ' + api.error.code
    );

    return api.error.code;
  });

  run('15. Strict execute throws for unknown action', () => {
    let threw = false;
    try {
      WebApiService.execute('not.allowed', {});
    } catch (err) {
      threw = true;
    }
    assertTrue(threw, 'execute did not throw');
    return 'rejected';
  });

  run('16. Dashboard dependency contract exists', () => {
    [
      'getDashboard','getKpis','getUnitBoard','getArrivals',
      'getDepartures','getOperations','getAlerts'
    ].forEach(name => assertTrue(
      typeof DashboardService[name] === 'function',
      'Missing DashboardService.' + name
    ));
    return '7 methods';
  });

  run('17. Reservation dependency contract exists', () => {
    [
      'searchAvailability','checkUnitAvailability','listReservations',
      'getReservation','createDirectReservation','confirmReservation',
      'cancelReservation','checkInReservation','markNoShow',
      'markOTABlockCompleted','getArrivals','getDepartures'
    ].forEach(name => assertTrue(
      typeof AdminReservationService[name] === 'function',
      'Missing AdminReservationService.' + name
    ));
    return '12 methods';
  });

  run('18. Operations dependency contract exists', () => {
    [
      'getOperationsBoard','getUnitOperations','getStayOperations',
      'getTodayHousekeeping','getOverdueHousekeeping',
      'getPendingInspections','getOpenMaintenance',
      'getDueHousekeepingSchedules','checkIn','checkOut',
      'startCleaning','completeCleaning','completeInspection',
      'applyInspectionResult','completeMaintenanceAndRequestInspection',
      'assignHousekeepingTask','cancelHousekeepingTask',
      'startInspection','setChecklistResult','cancelInspection',
      'createManualWorkOrder','assignTechnician',
      'scheduleWorkOrder','startWorkOrder'
    ].forEach(name => assertTrue(
      typeof AdminOperationsService[name] === 'function',
      'Missing AdminOperationsService.' + name
    ));
    return '24 methods';
  });

  run('19. Finance dependency contract exists', () => {
    [
      'getFinanceOverview','getUnitFinance','listExpenses',
      'createExpense','updateExpense','listUtilities',
      'listUtilityBills','getOverdueUtilityBills','createUtility',
      'updateUtility','changeUtilityStatus','createUtilityBill',
      'updateUtilityBill','markUtilityBillPaid',
      'markUtilityBillPending','markUtilityBillRefunded',
      'listInternetServices','getExpiringInternetContracts',
      'createInternetService','updateInternetService',
      'activateInternetService','deactivateInternetService'
    ].forEach(name => assertTrue(
      typeof AdminFinanceService[name] === 'function',
      'Missing AdminFinanceService.' + name
    ));
    return '22 methods';
  });

  run('20. Admin reference dependency contract exists', () => {
    [
      'getBootstrap','getProperties','getUnits','getCustomers',
      'getGuests','getStaff','getReferenceValues','getReferenceBundle'
    ].forEach(name => assertTrue(
      typeof AdminReferenceService[name] === 'function',
      'Missing AdminReferenceService.' + name
    ));

    return '8 methods';
  });

  run('21. API does not expose raw repository/domain escape routes', () => {
    const forbidden = [
      'repository.findAll',
      'repository.insert',
      'operationalStatus.change',
      'reservation.rawUpdate',
      'sheet.read',
      'sheet.write',
      'finance.grandTotal'
    ];

    const set = new Set(WebApiService.getActions());
    forbidden.forEach(action =>
      assertTrue(!set.has(action), 'Forbidden action exposed: ' + action)
    );

    return 'boundary verified';
  });

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  Logger.log('===== PHASE 6.7B WEB API SERVICE v1.1 TEST SUMMARY =====');
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log(JSON.stringify(results, null, 2));
  Logger.log('===== PHASE 6.7B WEB API SERVICE v1.1 TEST END =====');

  if (failed > 0) {
    throw new Error(
      'Phase 6.7B WebApiService v1.1 acceptance failed. FAILED=' + failed
    );
  }

  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    action_count: WebApiService.getActions().length,
    property_id: propertyId
  };
}

function addOneDayForWebApiTest_(dateValue) {
  const p = String(dateValue).split('-');
  const d = new Date(Date.UTC(
    Number(p[0]),
    Number(p[1]) - 1,
    Number(p[2])
  ));
  d.setUTCDate(d.getUTCDate() + 1);

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')
  ].join('-');
}
