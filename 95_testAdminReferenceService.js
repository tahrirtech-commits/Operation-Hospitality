/**
 * ============================================================================
 * testWebApiService_v1.1_fast.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.7B - WEB API SERVICE v1.1 INCREMENTAL ACCEPTANCE
 * ============================================================================
 *
 * PURPOSE
 * - Fast, non-destructive acceptance for the 6.7B API extension.
 * - Executes the NEW reference.* routes.
 * - Verifies stable envelopes / validation mapping.
 * - Verifies all existing frozen route groups remain registered.
 * - Does NOT recompute expensive Dashboard/Operations/Finance read models.
 *
 * WHY
 * The original full 6.5 regression already accepted the frozen 65-route API.
 * Re-running DashboardService through both API and direct facade can exceed
 * Google Apps Script execution limits.
 *
 * Acceptance: FAILED = 0
 * Expected tests: 18
 * ============================================================================
 */

function testWebApiService_v1_1Fast() {

  Logger.log(
    '===== PHASE 6.7B WEB API SERVICE v1.1 FAST TEST START ====='
  );

  const results = [];

  function pass(name, detail) {
    results.push({
      name: name,
      passed: true,
      detail: detail || ''
    });

    Logger.log(
      'PASS: ' +
      name +
      (detail ? ' | ' + detail : '')
    );
  }

  function fail(name, err) {
    const message =
      err && err.message
        ? err.message
        : String(err);

    results.push({
      name: name,
      passed: false,
      detail: message
    });

    Logger.log(
      'FAIL: ' +
      name +
      ' | ' +
      message
    );
  }

  function run(name, fn) {
    try {
      pass(
        name,
        fn() || ''
      );
    } catch (err) {
      fail(
        name,
        err
      );
    }
  }

  function assertTrue(value, message) {
    if (!value) {
      throw new Error(
        message || 'Assertion failed.'
      );
    }
  }

  function assertEqual(
    expected,
    actual,
    message
  ) {
    if (
      String(expected) !==
      String(actual)
    ) {
      throw new Error(
        (
          message
            ? message + ' | '
            : ''
        ) +
        'Expected=' +
        expected +
        ', Actual=' +
        actual
      );
    }
  }

  function assertSuccess(
    response,
    label
  ) {
    assertTrue(
      response &&
      response.success === true,
      (
        label ||
        'API call'
      ) +
      ' failed: ' +
      (
        response &&
        response.error
          ? response.error.message
          : 'unknown error'
      )
    );

    assertEqual(
      null,
      response.error,
      'Successful response has error'
    );

    assertTrue(
      response.meta &&
      !!response.meta.action &&
      !!response.meta.timestamp,
      'Success meta missing'
    );
  }

  function assertFailure(
    response,
    code
  ) {
    assertTrue(
      response &&
      response.success === false,
      'Expected controlled failure.'
    );

    assertEqual(
      null,
      response.data,
      'Failure data must be null'
    );

    assertTrue(
      !!response.error,
      'Failure error missing'
    );

    assertEqual(
      code,
      response.error.code,
      'Wrong error code'
    );

    assertTrue(
      response.meta &&
      !!response.meta.timestamp,
      'Failure meta missing'
    );
  }


  // --------------------------------------------------------------------------
  // Establish an operational property for scoped lookups.
  // Do not assume bootstrap's alphabetically-first property has units/staff.
  // --------------------------------------------------------------------------

  const properties =
    AdminReferenceService
      .getProperties();

  assertTrue(
    properties.length > 0,
    'No active properties found.'
  );

  let propertyId =
    properties[0].property_id;

  for (
    let i = 0;
    i < properties.length;
    i++
  ) {
    const candidate =
      properties[i]
        .property_id;

    const units =
      AdminReferenceService
        .getUnits(
          candidate
        );

    if (units.length > 0) {
      propertyId =
        candidate;
      break;
    }
  }

  Logger.log(
    'Property: ' +
    propertyId
  );


  // ==========================================================================
  // CONTRACT / ALLOWLIST
  // ==========================================================================

  run(
    '1. Public WebApiService contract exists',
    () => {

      [
        'call',
        'execute',
        'getActions'
      ].forEach(name =>
        assertTrue(
          typeof WebApiService[
            name
          ] === 'function',
          'Missing WebApiService.' +
          name
        )
      );

      return '3 methods';
    }
  );


  let actions = [];

  run(
    '2. Explicit allowlist contains exactly 73 actions',
    () => {

      actions =
        WebApiService
          .getActions();

      assertTrue(
        Array.isArray(actions),
        'getActions did not return array.'
      );

      assertEqual(
        73,
        actions.length,
        'Unexpected action count'
      );

      assertEqual(
        actions.length,
        new Set(actions).size,
        'Duplicate action found'
      );

      return (
        'actions=' +
        actions.length
      );
    }
  );


  run(
    '3. Eight reference routes are registered',
    () => {

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

      const set =
        new Set(actions);

      expected.forEach(action =>
        assertTrue(
          set.has(action),
          'Missing route: ' +
          action
        )
      );

      return '8 routes';
    }
  );


  run(
    '4. Frozen route groups remain registered',
    () => {

      const prefixes = {
        dashboard: 7,
        reservations: 12,
        operations: 24,
        finance: 22,
        reference: 8
      };

      Object.keys(prefixes)
        .forEach(prefix => {

          const count =
            actions.filter(action =>
              action.indexOf(
                prefix + '.'
              ) === 0
            ).length;

          assertEqual(
            prefixes[prefix],
            count,
            prefix +
            ' route count changed'
          );
        });

      return (
        '7 dashboard, 12 reservations, ' +
        '24 operations, 22 finance, 8 reference'
      );
    }
  );


  // ==========================================================================
  // NEW REFERENCE ROUTES - EXECUTED
  // ==========================================================================

  run(
    '5. reference.bootstrap works',
    () => {

      const response =
        WebApiService.call(
          'reference.bootstrap',
          {}
        );

      assertSuccess(
        response,
        'reference.bootstrap'
      );

      assertTrue(
        Array.isArray(
          response.data.properties
        ),
        'properties missing'
      );

      assertTrue(
        response.data.properties.length >
        0,
        'No properties returned'
      );

      return (
        'properties=' +
        response.data.properties.length +
        ', default=' +
        response.data
          .default_property_id
      );
    }
  );


  run(
    '6. reference.properties works',
    () => {

      const response =
        WebApiService.call(
          'reference.properties',
          {}
        );

      assertSuccess(
        response,
        'reference.properties'
      );

      assertTrue(
        Array.isArray(
          response.data
        ),
        'Expected array'
      );

      return (
        'properties=' +
        response.data.length
      );
    }
  );


  run(
    '7. reference.units works',
    () => {

      const response =
        WebApiService.call(
          'reference.units',
          {
            property_id:
              propertyId
          }
        );

      assertSuccess(
        response,
        'reference.units'
      );

      response.data
        .forEach(row =>
          assertEqual(
            propertyId,
            row.property_id,
            'Wrong property unit'
          )
        );

      return (
        'units=' +
        response.data.length
      );
    }
  );


  run(
    '8. reference.customers works',
    () => {

      const response =
        WebApiService.call(
          'reference.customers',
          {}
        );

      assertSuccess(
        response,
        'reference.customers'
      );

      return (
        'customers=' +
        response.data.length
      );
    }
  );


  run(
    '9. reference.guests works',
    () => {

      const response =
        WebApiService.call(
          'reference.guests',
          {}
        );

      assertSuccess(
        response,
        'reference.guests'
      );

      return (
        'guests=' +
        response.data.length
      );
    }
  );


  run(
    '10. reference.staff works',
    () => {

      const response =
        WebApiService.call(
          'reference.staff',
          {
            property_id:
              propertyId
          }
        );

      assertSuccess(
        response,
        'reference.staff'
      );

      response.data
        .forEach(row =>
          assertEqual(
            propertyId,
            row.property_id,
            'Wrong property staff'
          )
        );

      return (
        'staff=' +
        response.data.length
      );
    }
  );


  run(
    '11. reference.values works',
    () => {

      const response =
        WebApiService.call(
          'reference.values',
          {
            category:
              'BOOKING_SOURCE'
          }
        );

      assertSuccess(
        response,
        'reference.values'
      );

      assertTrue(
        response.data.length > 0,
        'BOOKING_SOURCE empty'
      );

      return (
        'values=' +
        response.data.length
      );
    }
  );


  run(
    '12. reference.bundle works',
    () => {

      const response =
        WebApiService.call(
          'reference.bundle',
          {
            categories: [
              'BOOKING_SOURCE',
              'RESERVATION_STATUS',
              'STAFF_ROLE'
            ]
          }
        );

      assertSuccess(
        response,
        'reference.bundle'
      );

      [
        'BOOKING_SOURCE',
        'RESERVATION_STATUS',
        'STAFF_ROLE'
      ].forEach(category =>
        assertTrue(
          Array.isArray(
            response.data[
              category
            ]
          ),
          'Missing category: ' +
          category
        )
      );

      return (
        'categories=' +
        Object.keys(
          response.data
        ).length
      );
    }
  );


  // ==========================================================================
  // CONTROLLED ERROR ENVELOPES
  // ==========================================================================

  run(
    '13. Missing property maps to VALIDATION_ERROR',
    () => {

      const response =
        WebApiService.call(
          'reference.units',
          {}
        );

      assertFailure(
        response,
        'VALIDATION_ERROR'
      );

      return response.error.code;
    }
  );


  run(
    '14. Missing category maps to VALIDATION_ERROR',
    () => {

      const response =
        WebApiService.call(
          'reference.values',
          {}
        );

      assertFailure(
        response,
        'VALIDATION_ERROR'
      );

      return response.error.code;
    }
  );


  run(
    '15. Invalid bundle type maps to VALIDATION_ERROR',
    () => {

      const response =
        WebApiService.call(
          'reference.bundle',
          {
            categories:
              'BOOKING_SOURCE'
          }
        );

      assertFailure(
        response,
        'VALIDATION_ERROR'
      );

      return response.error.code;
    }
  );


  run(
    '16. Unknown action remains NOT_FOUND',
    () => {

      const response =
        WebApiService.call(
          'not.allowed',
          {}
        );

      assertFailure(
        response,
        'NOT_FOUND'
      );

      return response.error.code;
    }
  );


  // ==========================================================================
  // DEPENDENCY / SECURITY BOUNDARY
  // ==========================================================================

  run(
    '17. AdminReferenceService dependency contract exists',
    () => {

      [
        'getBootstrap',
        'getProperties',
        'getUnits',
        'getCustomers',
        'getGuests',
        'getStaff',
        'getReferenceValues',
        'getReferenceBundle'
      ].forEach(name =>
        assertTrue(
          typeof AdminReferenceService[
            name
          ] === 'function',
          'Missing AdminReferenceService.' +
          name
        )
      );

      return '8 methods';
    }
  );


  run(
    '18. Raw repository/domain escape routes remain inaccessible',
    () => {

      const forbidden = [
        'repository.findAll',
        'repository.insert',
        'repository.update',
        'sheet.read',
        'sheet.write',
        'property.getAll',
        'unit.getAll',
        'staff.getAll',
        'operationalStatus.change',
        'reservation.rawUpdate',
        'finance.grandTotal'
      ];

      const set =
        new Set(actions);

      forbidden.forEach(action =>
        assertTrue(
          !set.has(action),
          'Forbidden action exposed: ' +
          action
        )
      );

      return 'boundary verified';
    }
  );


  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  const passed =
    results.filter(
      result =>
        result.passed
    ).length;

  const failed =
    results.length -
    passed;


  Logger.log(
    '===== PHASE 6.7B WEB API SERVICE v1.1 FAST TEST SUMMARY ====='
  );

  Logger.log(
    'PASSED: ' +
    passed
  );

  Logger.log(
    'FAILED: ' +
    failed
  );

  Logger.log(
    JSON.stringify(
      results,
      null,
      2
    )
  );

  Logger.log(
    '===== PHASE 6.7B WEB API SERVICE v1.1 FAST TEST END ====='
  );


  if (failed > 0) {
    throw new Error(
      'Phase 6.7B WebApiService v1.1 fast acceptance failed. FAILED=' +
      failed
    );
  }


  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    action_count:
      actions.length,
    property_id:
      propertyId
  };
}
