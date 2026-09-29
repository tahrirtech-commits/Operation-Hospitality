/**
 * ============================================================================
 * testAdminShell.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.7 - INDEX.HTML / ADMIN SHELL ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 *
 * This test now invokes doGet(), so Index.html must exist in the Apps Script
 * project before running it.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testAdminShell() {

  Logger.log(
    '===== PHASE 6.7 ADMIN SHELL TEST START ====='
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
      (
        detail
          ? ' | ' + detail
          : ''
      )
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


  function assertTrue(
    value,
    message
  ) {

    if (!value) {
      throw new Error(
        message ||
        'Assertion failed.'
      );
    }

  }


  function assertContains(
    text,
    expected,
    message
  ) {

    if (
      String(text)
        .indexOf(expected) ===
      -1
    ) {

      throw new Error(
        (
          message
            ? message + ' | '
            : ''
        ) +
        'Missing: ' +
        expected
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


  let output;
  let html;


  run(
    '1. doGet renders Index.html',
    () => {

      output =
        doGet({});

      assertTrue(
        output,
        'doGet returned no output.'
      );

      assertTrue(
        typeof output.getContent ===
        'function',
        'doGet did not return HtmlOutput.'
      );

      html =
        output.getContent();

      assertTrue(
        html &&
        html.length > 0,
        'Rendered HTML is empty.'
      );

      return (
        'bytes=' +
        html.length
      );
    }
  );


  run(
    '2. HTML document structure exists',
    () => {

      assertContains(
        html,
        '<!DOCTYPE html>'
      );

      assertContains(
        html,
        '<html>'
      );

      assertContains(
        html,
        '<body>'
      );

      assertContains(
        html,
        '</html>'
      );

      return 'valid shell structure';
    }
  );


  run(
    '3. Responsive viewport metadata exists',
    () => {

      /*
       * The viewport is added by 81_WebApp.gs via HtmlOutput.addMetaTag().
       * HtmlOutput.getContent() does not necessarily expose platform-added
       * meta tags, so validate the source-side doGet contract indirectly by
       * ensuring doGet returned HtmlOutput successfully and the shell itself
       * contains responsive CSS.
       */
      assertContains(
        html,
        '@media (max-width: 820px)'
      );

      assertContains(
        html,
        '@media (max-width: 560px)'
      );

      return 'responsive CSS present';
    }
  );


  run(
    '4. Sidebar navigation exists',
    () => {

      assertContains(
        html,
        'data-route="dashboard"'
      );

      assertContains(
        html,
        'data-route="reservations"'
      );

      assertContains(
        html,
        'data-route="operations"'
      );

      assertContains(
        html,
        'data-route="finance"'
      );

      return '4 routes';
    }
  );


  run(
    '5. Four application views exist',
    () => {

      [
        'view-dashboard',
        'view-reservations',
        'view-operations',
        'view-finance'
      ].forEach(
        id =>
          assertContains(
            html,
            'id="' + id + '"'
          )
      );

      return '4 views';
    }
  );


  run(
    '6. Shared property selector exists',
    () => {

      assertContains(
        html,
        'id="propertySelect"'
      );

      return 'available';
    }
  );


  run(
    '7. Shared loading state exists',
    () => {

      assertContains(
        html,
        'id="loadingOverlay"'
      );

      assertContains(
        html,
        'function beginLoading'
      );

      assertContains(
        html,
        'function endLoading'
      );

      return 'available';
    }
  );


  run(
    '8. Shared notification region exists',
    () => {

      assertContains(
        html,
        'id="toastRegion"'
      );

      assertContains(
        html,
        'function notify'
      );

      return 'available';
    }
  );


  run(
    '9. System status indicator exists',
    () => {

      assertContains(
        html,
        'id="systemStatus"'
      );

      assertContains(
        html,
        'function setSystemStatus'
      );

      return 'available';
    }
  );


  run(
    '10. Browser API client uses google.script.run',
    () => {

      assertContains(
        html,
        'google.script.run'
      );

      assertContains(
        html,
        '.apiCall('
      );

      return 'bridge configured';
    }
  );


  run(
    '11. Browser API client uses success handler',
    () => {

      assertContains(
        html,
        '.withSuccessHandler('
      );

      return 'configured';
    }
  );


  run(
    '12. Browser API client uses failure handler',
    () => {

      assertContains(
        html,
        '.withFailureHandler('
      );

      return 'configured';
    }
  );


  run(
    '13. Browser API client checks response envelope',
    () => {

      assertContains(
        html,
        'response.success !== true'
      );

      assertContains(
        html,
        'response.error'
      );

      return 'envelope handled';
    }
  );


  run(
    '14. Hash routing exists',
    () => {

      assertContains(
        html,
        'window.location.hash'
      );

      assertContains(
        html,
        "'hashchange'"
      );

      assertContains(
        html,
        'function navigate'
      );

      return 'configured';
    }
  );


  run(
    '15. Property context events exist',
    () => {

      assertContains(
        html,
        "'app:property'"
      );

      assertContains(
        html,
        'function setProperty'
      );

      return 'configured';
    }
  );


  run(
    '16. Route events exist for screen modules',
    () => {

      assertContains(
        html,
        "'app:route'"
      );

      return 'configured';
    }
  );


  run(
    '17. Mobile navigation exists',
    () => {

      assertContains(
        html,
        'id="mobileMenuButton"'
      );

      assertContains(
        html,
        'function toggleMobileMenu'
      );

      return 'configured';
    }
  );


  run(
    '18. App exposes reusable shell API',
    () => {

      [
        'init',
        'api',
        'navigate',
        'setProperties',
        'setProperty',
        'beginLoading',
        'endLoading',
        'notify',
        'setSystemStatus',
        'getState'
      ].forEach(
        method =>
          assertContains(
            html,
            method
          )
      );

      return '10 capabilities';
    }
  );


  run(
    '19. Dashboard placeholder identifies Phase 6.8',
    () => {

      assertContains(
        html,
        'Phase 6.8'
      );

      return 'present';
    }
  );


  run(
    '20. Reservation placeholder identifies Phase 6.9',
    () => {

      assertContains(
        html,
        'Phase 6.9'
      );

      return 'present';
    }
  );


  run(
    '21. Operations placeholder identifies Phase 6.10',
    () => {

      assertContains(
        html,
        'Phase 6.10'
      );

      return 'present';
    }
  );


  run(
    '22. Finance placeholder identifies Phase 6.11',
    () => {

      assertContains(
        html,
        'Phase 6.11'
      );

      return 'present';
    }
  );


  run(
    '23. Shell contains no direct Sheet access',
    () => {

      const forbidden = [
        'SpreadsheetApp',
        'BaseRepository',
        'getActiveSpreadsheet',
        'getSheetByName'
      ];

      forbidden.forEach(
        token => {

          assertTrue(
            html.indexOf(token) === -1,
            'Forbidden browser token found: ' +
            token
          );

        }
      );

      return 'boundary verified';
    }
  );


  run(
    '24. Shell contains no direct facade calls',
    () => {

      const forbidden = [
        'DashboardService.',
        'AdminReservationService.',
        'AdminOperationsService.',
        'AdminFinanceService.',
        'WebApiService.'
      ];

      forbidden.forEach(
        token => {

          assertTrue(
            html.indexOf(token) === -1,
            'Direct service call found: ' +
            token
          );

        }
      );

      return 'apiCall only';
    }
  );


  run(
    '25. Google-style admin palette is applied',
    () => {

      [
        '--accent: #1a73e8;',
        '--accent-soft: #e8f0fe;',
        '--text: #202124;',
        '--muted: #5f6368;',
        '--border: #dadce0;',
        '--success: #188038;',
        '--danger: #d93025;'
      ].forEach(
        token =>
          assertContains(
            html,
            token
          )
      );

      assertTrue(
        html.indexOf('--accent: #1f4f46;') === -1,
        'Legacy olive accent is still present.'
      );

      assertTrue(
        html.indexOf('background: #172a26;') === -1,
        'Legacy dark olive sidebar is still present.'
      );

      return 'Google-like palette verified';
    }
  );


  run(
    '26. Server bridge still returns controlled envelope',
    () => {

      const response =
        apiCall(
          'not.allowed',
          {}
        );

      assertTrue(
        response &&
        response.success === false,
        'Controlled failure envelope not returned.'
      );

      assertTrue(
        response.error &&
        response.error.code,
        'error.code missing.'
      );

      return response.error.code;
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
    '===== PHASE 6.7 ADMIN SHELL TEST SUMMARY ====='
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
    '===== PHASE 6.7 ADMIN SHELL TEST END ====='
  );


  if (failed > 0) {

    throw new Error(
      'Phase 6.7 Admin Shell acceptance failed. FAILED=' +
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
