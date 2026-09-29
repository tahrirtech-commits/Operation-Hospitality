/**
 * ============================================================================
 * testReservationsUI.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.9 - RESERVATIONS UI ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 * No create/confirm/check-in/cancel/no-show/OTA write action is executed.
 * The test validates the rendered UI contract and the frozen API allowlist.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testReservationsUI() {

  Logger.log(
    '===== PHASE 6.9 RESERVATIONS UI TEST START ====='
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

  function contains(
    html,
    value
  ) {
    assertTrue(
      html.indexOf(value) !== -1,
      'Missing: ' + value
    );
  }


  const html =
    doGet({}).getContent();

  Logger.log(
    'Rendered bytes: ' +
    html.length
  );


  run(
    '1. doGet renders Phase 6.9 HTML',
    () => {
      assertTrue(
        html.length > 20000,
        'HTML unexpectedly small.'
      );
      return 'bytes=' + html.length;
    }
  );


  run(
    '2. Reservations placeholder is removed',
    () => {
      assertTrue(
        html.indexOf(
          'workflow controls will be added in Phase 6.9'
        ) === -1,
        'Old Phase 6.9 placeholder remains.'
      );
      return 'removed';
    }
  );


  run(
    '3. Availability search form exists',
    () => {
      [
        'availabilityForm',
        'availabilityStart',
        'availabilityEnd',
        'availabilityUnitType',
        'availabilityResults'
      ].forEach(id =>
        contains(
          html,
          'id="' + id + '"'
        )
      );
      return 'present';
    }
  );


  run(
    '4. Reservation register exists',
    () => {
      [
        'reservationListBody',
        'reservationCountBadge',
        'reservationFilters'
      ].forEach(id =>
        contains(
          html,
          'id="' + id + '"'
        )
      );
      return 'present';
    }
  );


  run(
    '5. Reservation filters exist',
    () => {
      [
        'reservationStatusFilter',
        'reservationSourceFilter',
        'reservationStartFilter',
        'reservationEndFilter'
      ].forEach(id =>
        contains(
          html,
          'id="' + id + '"'
        )
      );
      return '4 filters';
    }
  );


  run(
    '6. Reservation detail drawer exists',
    () => {
      [
        'reservationDrawer',
        'reservationDrawerBody',
        'reservationDrawerActions'
      ].forEach(id =>
        contains(
          html,
          'id="' + id + '"'
        )
      );
      return 'present';
    }
  );


  run(
    '7. Direct reservation drawer exists',
    () => {
      [
        'directReservationDrawer',
        'directReservationForm',
        'directCustomer',
        'directUnit',
        'directCheckIn',
        'directCheckOut'
      ].forEach(id =>
        contains(
          html,
          'id="' + id + '"'
        )
      );
      return 'present';
    }
  );


  run(
    '8. Direct booking is explicitly DIRECT and PENDING',
    () => {
      contains(
        html,
        "booking_source:\n            'DIRECT'"
      );
      contains(
        html,
        "status:\n            'PENDING'"
      );
      return 'contract preserved';
    }
  );


  run(
    '9. Direct booking uses server availability search',
    () => {
      contains(
        html,
        "'reservations.searchAvailability'"
      );
      return 'server authority preserved';
    }
  );


  run(
    '10. Reservation list uses frozen list route',
    () => {
      contains(
        html,
        "'reservations.list'"
      );
      return 'present';
    }
  );


  run(
    '11. Reservation detail uses frozen get route',
    () => {
      contains(
        html,
        "'reservations.get'"
      );
      return 'present';
    }
  );


  run(
    '12. Create uses frozen createDirect route',
    () => {
      contains(
        html,
        "'reservations.createDirect'"
      );
      return 'present';
    }
  );


  run(
    '13. Confirm route is wired',
    () => {
      contains(
        html,
        "'reservations.confirm'"
      );
      return 'present';
    }
  );


  run(
    '14. Check-in route is wired',
    () => {
      contains(
        html,
        "'reservations.checkIn'"
      );
      return 'present';
    }
  );


  run(
    '15. Cancel route is wired',
    () => {
      contains(
        html,
        "'reservations.cancel'"
      );
      return 'present';
    }
  );


  run(
    '16. No-show route is wired',
    () => {
      contains(
        html,
        "'reservations.noShow'"
      );
      return 'present';
    }
  );


  run(
    '17. OTA completion route is wired',
    () => {
      contains(
        html,
        "'reservations.otaBlockCompleted'"
      );
      return 'present';
    }
  );


  run(
    '18. Lifecycle buttons use allowed_transitions',
    () => {
      contains(
        html,
        'detail.allowed_transitions'
      );
      assertTrue(
        html.indexOf(
          'PENDING: ['
        ) === -1,
        'Client-side lifecycle state machine found.'
      );
      return 'server transitions rendered';
    }
  );


  run(
    '19. Customer and guest lookups use reference API',
    () => {
      contains(
        html,
        "'reference.customers'"
      );
      contains(
        html,
        "'reference.guests'"
      );
      return 'present';
    }
  );


  run(
    '20. Reservation reference bundle is used',
    () => {
      contains(
        html,
        "'reference.bundle'"
      );
      contains(
        html,
        "'RESERVATION_STATUS'"
      );
      contains(
        html,
        "'BOOKING_SOURCE'"
      );
      contains(
        html,
        "'UNIT_TYPE'"
      );
      return '3 categories';
    }
  );


  run(
    '21. Browser has no direct repository/domain access',
    () => {
      [
        'BaseRepository',
        'ReservationService.',
        'ReservationWorkflowService.',
        'AvailabilityService.',
        'OTABlockService.'
      ].forEach(value =>
        assertTrue(
          html.indexOf(value) === -1,
          'Forbidden browser dependency: ' +
          value
        )
      );
      return 'boundary verified';
    }
  );


  run(
    '22. Existing Dashboard UI remains present',
    () => {
      contains(
        html,
        'const DashboardUI'
      );
      contains(
        html,
        "'dashboard.get'"
      );
      return 'preserved';
    }
  );


  run(
    '23. Operations and Finance placeholders remain',
    () => {
      contains(
        html,
        'Phase 6.10'
      );
      contains(
        html,
        'Phase 6.11'
      );
      return 'preserved';
    }
  );


  run(
    '24. API allowlist remains 73 actions',
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
    '25. All 12 reservation API routes remain registered',
    () => {
      const actions =
        WebApiService.getActions();

      const reservationActions =
        actions.filter(action =>
          action.indexOf(
            'reservations.'
          ) === 0
        );

      assertTrue(
        reservationActions.length ===
          12,
        'Expected 12 reservation routes, got ' +
        reservationActions.length
      );

      return '12 routes';
    }
  );


  run(
    '26. ReservationsUI exposes reusable UI contract',
    () => {
      [
        'init',
        'initializeProperty',
        'loadReservations',
        'searchAvailability',
        'openReservation',
        'openDirectDrawer',
        'getState'
      ].forEach(name =>
        contains(
          html,
          name
        )
      );
      return '7 capabilities';
    }
  );


  run(
    '27. Responsive reservation rules exist',
    () => {
      contains(
        html,
        '@media (max-width: 1100px)'
      );
      contains(
        html,
        '@media (max-width: 700px)'
      );
      return 'responsive';
    }
  );


  run(
    '28. Google-style palette remains intact',
    () => {
      [
        '#1A73E8',
        '#202124',
        '#5F6368',
        '#DADCE0',
        '#F8FAFD'
      ].forEach(color =>
        contains(
          html,
          color
        )
      );
      return 'palette verified';
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
    '===== PHASE 6.9 RESERVATIONS UI TEST SUMMARY ====='
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
    '===== PHASE 6.9 RESERVATIONS UI TEST END ====='
  );


  if (failed > 0) {
    throw new Error(
      'Phase 6.9 Reservations UI acceptance failed. FAILED=' +
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
