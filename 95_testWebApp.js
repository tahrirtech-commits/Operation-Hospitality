/**
 * ============================================================================
 * testWebApp.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.6 - WEB APP ACCEPTANCE TEST
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 *
 * IMPORTANT:
 * This test does NOT call doGet(), because Index.html is Phase 6.7.
 * It validates the browser bridge and architectural boundary only.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testWebApp() {

  Logger.log('===== PHASE 6.6 WEB APP TEST START =====');

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
    const msg =
      err && err.message
        ? err.message
        : String(err);

    results.push({
      name: name,
      passed: false,
      detail: msg
    });

    Logger.log(
      'FAIL: ' +
      name +
      ' | ' +
      msg
    );
  }

  function assertTrue(value, message) {
    if (!value) {
      throw new Error(
        message || 'Assertion failed.'
      );
    }
  }

  function assertEqual(expected, actual, message) {
    if (String(expected) !== String(actual)) {
      throw new Error(
        (message ? message + ' | ' : '') +
        'Expected=' +
        expected +
        ', Actual=' +
        actual
      );
    }
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


  const properties =
    PropertyService.getAllProperties();

  assertTrue(
    properties.length > 0,
    'No properties found.'
  );

  const propertyId =
    properties[0].property_id;

  const units =
    UnitService.getUnitsByProperty(
      propertyId
    );

  assertTrue(
    units.length > 0,
    'No units found.'
  );

  const unitId =
    units[0].unit_id;

  const today =
    Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );


  Logger.log(
    'Property: ' +
    propertyId
  );

  Logger.log(
    'Unit: ' +
    unitId
  );

  Logger.log(
    'Date: ' +
    today
  );


  // ==========================================================================
  // CONTRACT
  // ==========================================================================

  run(
    '1. doGet entry point exists',
    () => {

      assertTrue(
        typeof doGet === 'function',
        'doGet is missing.'
      );

      return 'available';
    }
  );


  run(
    '2. Browser API bridge exists',
    () => {

      assertTrue(
        typeof apiCall === 'function',
        'apiCall is missing.'
      );

      return 'available';
    }
  );


  run(
    '3. WebApiService dependency exists',
    () => {

      assertTrue(
        typeof WebApiService === 'object',
        'WebApiService is missing.'
      );

      assertTrue(
        typeof WebApiService.call === 'function',
        'WebApiService.call is missing.'
      );

      return 'contract verified';
    }
  );


  // ==========================================================================
  // READ ROUTE DELEGATION
  // ==========================================================================

  run(
    '4. apiCall delegates operations.unit',
    () => {

      const viaWebApp =
        apiCall(
          'operations.unit',
          {
            unit_id: unitId
          }
        );

      const direct =
        WebApiService.call(
          'operations.unit',
          {
            unit_id: unitId
          }
        );

      assertEqual(
        direct.success,
        viaWebApp.success
      );

      assertEqual(
        direct.data.unit.unit_id,
        viaWebApp.data.unit.unit_id
      );

      assertEqual(
        direct.data.housekeeping_tasks.length,
        viaWebApp.data.housekeeping_tasks.length
      );

      return unitId;
    }
  );


  run(
    '5. apiCall delegates reservation list',
    () => {

      const viaWebApp =
        apiCall(
          'reservations.list',
          {
            property_id: propertyId
          }
        );

      const direct =
        WebApiService.call(
          'reservations.list',
          {
            property_id: propertyId
          }
        );

      assertEqual(
        true,
        viaWebApp.success
      );

      assertEqual(
        direct.data.length,
        viaWebApp.data.length
      );

      return (
        'reservations=' +
        viaWebApp.data.length
      );
    }
  );


  run(
    '6. apiCall delegates finance expense list',
    () => {

      const viaWebApp =
        apiCall(
          'finance.expenses.list',
          {
            property_id: propertyId
          }
        );

      const direct =
        WebApiService.call(
          'finance.expenses.list',
          {
            property_id: propertyId
          }
        );

      assertEqual(
        true,
        viaWebApp.success
      );

      assertEqual(
        direct.data.length,
        viaWebApp.data.length
      );

      return (
        'expenses=' +
        viaWebApp.data.length
      );
    }
  );


  // ==========================================================================
  // ENVELOPE / ERROR PROPAGATION
  // ==========================================================================

  run(
    '7. Success envelope is preserved',
    () => {

      const response =
        apiCall(
          'operations.unit',
          {
            unit_id: unitId
          }
        );

      assertEqual(
        true,
        response.success
      );

      assertTrue(
        response.data !== null,
        'data is null.'
      );

      assertEqual(
        null,
        response.error
      );

      assertTrue(
        response.meta &&
        response.meta.action,
        'meta.action missing.'
      );

      assertTrue(
        response.meta &&
        response.meta.timestamp,
        'meta.timestamp missing.'
      );

      assertEqual(
        'operations.unit',
        response.meta.action
      );

      return 'envelope preserved';
    }
  );


  run(
    '8. Unknown action error is preserved',
    () => {

      const response =
        apiCall(
          'not.allowed',
          {}
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        null,
        response.data
      );

      assertTrue(
        response.error &&
        response.error.code,
        'error.code missing.'
      );

      assertTrue(
        response.error &&
        response.error.message,
        'error.message missing.'
      );

      assertEqual(
        'not.allowed',
        response.meta.action
      );

      return response.error.code;
    }
  );


  run(
    '9. Validation error is preserved',
    () => {

      const response =
        apiCall(
          'operations.unit',
          {}
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        'VALIDATION_ERROR',
        response.error.code
      );

      return response.error.code;
    }
  );


  run(
    '10. Invalid entity error is preserved',
    () => {

      const response =
        apiCall(
          'operations.unit',
          {
            unit_id:
              'UNIT-999999'
          }
        );

      assertEqual(
        false,
        response.success
      );

      assertTrue(
        response.error &&
        response.error.code,
        'error.code missing.'
      );

      return response.error.code;
    }
  );


  run(
    '11. Missing params object defaults safely',
    () => {

      const response =
        apiCall(
          'operations.unit'
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        'VALIDATION_ERROR',
        response.error.code
      );

      return 'safe default';
    }
  );


  // ==========================================================================
  // ALLOWLIST / BOUNDARY
  // ==========================================================================

  run(
    '12. API action allowlist remains available through WebApiService',
    () => {

      const actions =
        WebApiService.getActions();

      assertTrue(
        Array.isArray(actions),
        'Actions is not an array.'
      );

      assertTrue(
        actions.length > 0,
        'No API actions registered.'
      );

      return (
        'actions=' +
        actions.length
      );
    }
  );


  run(
    '13. Raw repository route remains inaccessible',
    () => {

      const response =
        apiCall(
          'repository.findAll',
          {}
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        null,
        response.data
      );

      return response.error.code;
    }
  );


  run(
    '14. Raw operational status route remains inaccessible',
    () => {

      const response =
        apiCall(
          'operationalStatus.change',
          {
            unit_id: unitId,
            status: 'READY'
          }
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        null,
        response.data
      );

      return response.error.code;
    }
  );


  run(
    '15. Raw Sheet write route remains inaccessible',
    () => {

      const response =
        apiCall(
          'sheet.write',
          {}
        );

      assertEqual(
        false,
        response.success
      );

      assertEqual(
        null,
        response.data
      );

      return response.error.code;
    }
  );


  // ==========================================================================
  // WEB APP DESIGN BOUNDARY
  // ==========================================================================

  run(
    '16. Browser bridge returns serializable data',
    () => {

      const response =
        apiCall(
          'operations.unit',
          {
            unit_id: unitId
          }
        );

      const serialized =
        JSON.stringify(response);

      assertTrue(
        serialized &&
        serialized.length > 0,
        'Response could not be serialized.'
      );

      return (
        'bytes=' +
        serialized.length
      );
    }
  );


  run(
    '17. Browser bridge exposes no strict execute method',
    () => {

      assertTrue(
        typeof apiExecute ===
        'undefined',
        'Unsafe apiExecute global exists.'
      );

      return 'only apiCall exposed';
    }
  );


  run(
    '18. WebApp acceptance does not require Index.html yet',
    () => {

      /*
       * Deliberately do not invoke doGet().
       *
       * This check documents the phase boundary:
       * 6.6 = server entry point / bridge
       * 6.7 = Index.html
       */
      assertTrue(
        typeof doGet === 'function'
      );

      return 'doGet invocation deferred to Phase 6.7';
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
    '===== PHASE 6.6 WEB APP TEST SUMMARY ====='
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
    '===== PHASE 6.6 WEB APP TEST END ====='
  );


  if (failed > 0) {

    throw new Error(
      'Phase 6.6 WebApp acceptance failed. FAILED=' +
      failed
    );

  }


  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    action_count:
      WebApiService
        .getActions()
        .length,
    property_id:
      propertyId
  };

}
