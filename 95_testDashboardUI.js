/**
 * ============================================================================
 * testDashboardUI.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.8 - DASHBOARD UI ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 *
 * This acceptance test validates the rendered HTML contract and the approved
 * server boundary. It intentionally does NOT execute dashboard.get because the
 * frozen DashboardService is comparatively expensive and was already accepted.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testDashboardUI() {

  Logger.log(
    '===== PHASE 6.8 DASHBOARD UI TEST START ====='
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
      pass(name, fn() || '');
    } catch (err) {
      fail(name, err);
    }
  }

  function assertTrue(value, message) {
    if (!value) {
      throw new Error(
        message || 'Assertion failed.'
      );
    }
  }

  function assertContains(
    haystack,
    needle,
    message
  ) {
    assertTrue(
      haystack.indexOf(needle) !== -1,
      message ||
      (
        'Missing expected content: ' +
        needle
      )
    );
  }

  function countMatches(
    value,
    pattern
  ) {
    const matches =
      value.match(pattern);

    return matches
      ? matches.length
      : 0;
  }


  const output =
    doGet({});

  const html =
    output.getContent();

  Logger.log(
    'Rendered bytes: ' +
    html.length
  );


  run(
    '1. doGet renders Phase 6.8 Index.html',
    () => {
      assertTrue(
        html.length > 10000,
        'Rendered HTML unexpectedly small.'
      );
      return 'bytes=' + html.length;
    }
  );


  run(
    '2. Dashboard placeholder is removed',
    () => {
      assertTrue(
        html.indexOf(
          'will be added in Phase 6.8'
        ) === -1,
        'Old dashboard placeholder remains.'
      );
      return 'removed';
    }
  );


  run(
    '3. KPI grid exists',
    () => {
      assertContains(
        html,
        'id="dashboardKpis"'
      );
      assertContains(
        html,
        'class="kpi-grid"'
      );
      return 'present';
    }
  );


  run(
    '4. Unit operational board exists',
    () => {
      assertContains(
        html,
        'id="unitBoardBody"'
      );
      assertContains(
        html,
        'Operational status'
      );
      assertContains(
        html,
        'Sellable'
      );
      return 'present';
    }
  );


  run(
    '5. Arrivals and departures panels exist',
    () => {
      assertContains(
        html,
        'id="dashboardArrivals"'
      );
      assertContains(
        html,
        'id="dashboardDepartures"'
      );
      return 'present';
    }
  );


  run(
    '6. Operational workload exists',
    () => {
      [
        'housekeepingCount',
        'inspectionCount',
        'maintenanceCount'
      ].forEach(id =>
        assertContains(
          html,
          'id="' + id + '"'
        )
      );
      return '3 workload counters';
    }
  );


  run(
    '7. Attention Required panel exists',
    () => {
      assertContains(
        html,
        'Attention required'
      );
      assertContains(
        html,
        'id="dashboardAlerts"'
      );
      return 'present';
    }
  );


  run(
    '8. Dashboard refresh control exists',
    () => {
      assertContains(
        html,
        'id="dashboardRefresh"'
      );
      assertContains(
        html,
        'Refreshing dashboard'
      );
      return 'present';
    }
  );


  run(
    '9. Dashboard uses aggregate dashboard.get route',
    () => {
      assertContains(
        html,
        "'dashboard.get'"
      );
      return 'aggregate route found';
    }
  );


  run(
    '10. Dashboard does not call dashboard sub-routes',
    () => {
      [
        "'dashboard.kpis'",
        "'dashboard.units'",
        "'dashboard.arrivals'",
        "'dashboard.departures'",
        "'dashboard.operations'",
        "'dashboard.alerts'"
      ].forEach(route =>
        assertTrue(
          html.indexOf(route) === -1,
          'Redundant dashboard route found: ' +
          route
        )
      );
      return 'single aggregate strategy verified';
    }
  );


  run(
    '11. Property bootstrap uses approved reference route',
    () => {
      assertContains(
        html,
        "'reference.bootstrap'"
      );
      return 'present';
    }
  );


  run(
    '12. Initial property selection can find property with units',
    () => {
      assertContains(
        html,
        "'reference.units'"
      );
      assertContains(
        html,
        'chooseInitialProperty'
      );
      return 'operational property fallback present';
    }
  );


  run(
    '13. Last property selection is persisted',
    () => {
      assertContains(
        html,
        'rentalOps.propertyId'
      );
      assertContains(
        html,
        'localStorage'
      );
      return 'persistence present';
    }
  );


  run(
    '14. Property changes drive dashboard refresh',
    () => {
      assertContains(
        html,
        "'app:property'"
      );
      assertContains(
        html,
        'DashboardUI'
      );
      return 'event binding present';
    }
  );


  run(
    '15. Browser uses only apiCall server bridge',
    () => {
      assertContains(
        html,
        '.apiCall('
      );

      assertTrue(
        html.indexOf(
          '.getDashboard('
        ) === -1,
        'Direct DashboardService call found.'
      );

      assertTrue(
        html.indexOf(
          'BaseRepository'
        ) === -1,
        'Repository reference found.'
      );

      return 'boundary verified';
    }
  );


  run(
    '16. Dashboard renders server sellable value',
    () => {
      assertContains(
        html,
        'row.sellable'
      );
      return 'server value rendered';
    }
  );


  run(
    '17. Dashboard renders server alerts',
    () => {
      assertContains(
        html,
        'renderAlerts('
      );
      assertContains(
        html,
        'alert.message'
      );
      return 'server alerts rendered';
    }
  );


  run(
    '18. Google-style palette remains intact',
    () => {
      [
        '#1A73E8',
        '#202124',
        '#5F6368',
        '#DADCE0',
        '#F8FAFD',
        '#188038',
        '#D93025'
      ].forEach(color =>
        assertContains(
          html,
          color
        )
      );
      return 'palette verified';
    }
  );


  run(
    '19. Responsive dashboard rules exist',
    () => {
      assertContains(
        html,
        '@media (max-width: 1180px)'
      );
      assertContains(
        html,
        '@media (max-width: 720px)'
      );
      return 'responsive rules present';
    }
  );


  run(
    '20. Existing three future-phase placeholders remain',
    () => {
      assertContains(
        html,
        'Phase 6.9'
      );
      assertContains(
        html,
        'Phase 6.10'
      );
      assertContains(
        html,
        'Phase 6.11'
      );
      return 'future screens preserved';
    }
  );


  run(
    '21. Web API exposes dashboard.get and reference routes',
    () => {
      const actions =
        WebApiService.getActions();

      [
        'dashboard.get',
        'reference.bootstrap',
        'reference.units'
      ].forEach(action =>
        assertTrue(
          actions.indexOf(action) !== -1,
          'Missing API action: ' +
          action
        )
      );

      return (
        'actions=' +
        actions.length
      );
    }
  );


  run(
    '22. API allowlist remains 73 actions',
    () => {
      const actions =
        WebApiService.getActions();

      assertTrue(
        actions.length === 73,
        'Expected 73 actions, got ' +
        actions.length
      );

      return '73 actions';
    }
  );


  run(
    '23. Controlled bridge failure remains stable',
    () => {
      const response =
        apiCall(
          'not.allowed',
          {}
        );

      assertTrue(
        response.success === false,
        'Unknown action unexpectedly succeeded.'
      );

      assertTrue(
        response.error &&
        response.error.code ===
          'NOT_FOUND',
        'Expected NOT_FOUND.'
      );

      return response.error.code;
    }
  );


  run(
    '24. DashboardUI exposes reusable UI contract',
    () => {
      [
        'init',
        'load',
        'refresh',
        'getState'
      ].forEach(name =>
        assertContains(
          html,
          name
        )
      );
      return '4 capabilities';
    }
  );


  const passed =
    results.filter(
      result =>
        result.passed
    ).length;

  const failed =
    results.length -
    passed;


  Logger.log(
    '===== PHASE 6.8 DASHBOARD UI TEST SUMMARY ====='
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
    '===== PHASE 6.8 DASHBOARD UI TEST END ====='
  );


  if (failed > 0) {
    throw new Error(
      'Phase 6.8 Dashboard UI acceptance failed. FAILED=' +
      failed
    );
  }


  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    rendered_html_bytes:
      html.length
  };
}
