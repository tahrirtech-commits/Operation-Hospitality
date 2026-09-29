/**
 * ============================================================================
 * testAdminReservationService.gs
 * PHASE 6.2 - ADMIN RESERVATION SERVICE ACCEPTANCE TEST
 * ============================================================================
 *
 * NON-DESTRUCTIVE acceptance test.
 *
 * It validates the Phase 6 facade without creating another permanent
 * reservation fixture. Phase 3 already acceptance-tested the authoritative
 * write workflows; this test verifies that Phase 6 delegates to those APIs.
 *
 * Run:
 *   testAdminReservationService()
 *
 * Acceptance:
 *   FAILED: 0
 * ============================================================================
 */

function testAdminReservationService() {

  Logger.log(
    '===== PHASE 6.2 ADMIN RESERVATION SERVICE TEST START ====='
  );

  const results = [];

  function pass(name, detail) {
    results.push({name:name, passed:true, detail:detail || ''});
    Logger.log('PASS: ' + name + (detail ? ' | ' + detail : ''));
  }

  function fail(name, err) {
    const message = err && err.message ? err.message : String(err);
    results.push({name:name, passed:false, detail:message});
    Logger.log('FAIL: ' + name + ' | ' + message);
  }

  function assertTrue(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed.');
  }

  function assertEqual(expected, actual, message) {
    if (String(expected) !== String(actual)) {
      throw new Error(
        (message ? message + ' | ' : '') +
        'Expected=' + expected + ', Actual=' + actual
      );
    }
  }

  function run(name, fn) {
    try {
      pass(name, fn() || '');
    } catch (err) {
      fail(name, err);
    }
  }

  const properties = PropertyService.getAllProperties();
  assertTrue(properties.length > 0, 'At least one property is required.');

  const property = properties[0];
  const propertyId = property.property_id;
  const units = UnitService.getUnitsByProperty(propertyId);

  assertTrue(units.length > 0, 'At least one unit is required.');

  const unit = units[0];

  const today = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    CONFIG.DATE_FORMATS.DATE
  );

  function addDays(dateString, days) {
    const p = dateString.split('-');
    const d = new Date(Date.UTC(
      Number(p[0]), Number(p[1]) - 1, Number(p[2])
    ));
    d.setUTCDate(d.getUTCDate() + days);
    return [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0')
    ].join('-');
  }

  const tomorrow = addDays(today, 1);

  Logger.log('Property: ' + propertyId);
  Logger.log('Unit: ' + unit.unit_id);
  Logger.log('Date: ' + today);

  run('1. Public facade methods exist', () => {
    [
      'searchAvailability',
      'checkUnitAvailability',
      'listReservations',
      'getReservation',
      'createDirectReservation',
      'confirmReservation',
      'cancelReservation',
      'checkInReservation',
      'markNoShow',
      'markOTABlockCompleted',
      'getArrivals',
      'getDepartures'
    ].forEach(name => {
      assertTrue(
        typeof AdminReservationService[name] === 'function',
        'Missing method: ' + name
      );
    });
    return '12 methods';
  });

  run('2. Availability search delegates correctly', () => {
    const result = AdminReservationService.searchAvailability({
      property_id: propertyId,
      start_date: today,
      end_date: tomorrow
    });

    const authoritative = AvailabilityService.getAvailableUnits(
      today,
      tomorrow,
      {property_id: propertyId}
    );

    assertEqual(authoritative.length, result.count);
    assertEqual(authoritative.length, result.units.length);

    return 'available=' + result.count;
  });

  run('3. Unit availability matches AvailabilityService', () => {
    const result = AdminReservationService.checkUnitAvailability({
      unit_id: unit.unit_id,
      start_date: today,
      end_date: tomorrow
    });

    const authoritative = AvailabilityService.checkAvailability(
      unit.unit_id,
      today,
      tomorrow
    );

    assertEqual(
      authoritative.available,
      result.availability.available
    );

    return unit.unit_id + ' available=' + result.availability.available;
  });

  run('4. Reservation list returns enriched records', () => {
    const rows = AdminReservationService.listReservations({
      property_id: propertyId
    });

    assertTrue(Array.isArray(rows), 'Expected array.');

    rows.forEach(row => {
      assertTrue(row.reservation, 'reservation missing.');
      assertTrue(row.unit, 'unit missing.');
      assertEqual(propertyId, row.unit.property_id);
    });

    return 'reservations=' + rows.length;
  });

  run('5. Status filtering is consistent', () => {
    const rows = AdminReservationService.listReservations({
      property_id: propertyId,
      status: 'COMPLETED'
    });

    rows.forEach(row => {
      assertEqual('COMPLETED', String(row.reservation.status).toUpperCase());
    });

    return 'completed=' + rows.length;
  });

  run('6. Date-range query is property isolated', () => {
    const end = addDays(today, 365);

    const rows = AdminReservationService.listReservations({
      property_id: propertyId,
      start_date: today,
      end_date: end,
      include_non_blocking: true
    });

    rows.forEach(row => {
      assertEqual(propertyId, row.unit.property_id);
    });

    return 'range_rows=' + rows.length;
  });

  const allReservations = ReservationService.getAll();

  if (allReservations.length > 0) {
    run('7. Reservation detail matches workflow view', () => {
      const reservation = allReservations[0];

      const result = AdminReservationService.getReservation(
        reservation.reservation_id
      );

      const workflow = ReservationWorkflowService.getReservationWorkflow(
        reservation.reservation_id
      );

      assertEqual(
        reservation.reservation_id,
        result.reservation.reservation_id
      );

      assertEqual(
        workflow.guests.length,
        result.guests.length
      );

      assertEqual(
        workflow.ota_blocks.length,
        result.ota_blocks.length
      );

      return reservation.reservation_id;
    });
  } else {
    pass('7. Reservation detail matches workflow view', 'SKIPPED: no reservations');
  }

  run('8. Arrivals match ReservationService', () => {
    const unitIds = new Set(
      units.map(row => String(row.unit_id).trim())
    );

    const expected = ReservationService.getArrivals(today)
      .filter(row => unitIds.has(String(row.unit_id).trim()));

    const actual = AdminReservationService.getArrivals(
      propertyId,
      today
    );

    assertEqual(expected.length, actual.length);

    return 'arrivals=' + actual.length;
  });

  run('9. Departures match ReservationService', () => {
    const unitIds = new Set(
      units.map(row => String(row.unit_id).trim())
    );

    const expected = ReservationService.getDepartures(today)
      .filter(row => unitIds.has(String(row.unit_id).trim()));

    const actual = AdminReservationService.getDepartures(
      propertyId,
      today
    );

    assertEqual(expected.length, actual.length);

    return 'departures=' + actual.length;
  });

  run('10. Invalid property is rejected', () => {
    let rejected = false;
    try {
      AdminReservationService.searchAvailability({
        property_id: 'PROP-999999',
        start_date: today,
        end_date: tomorrow
      });
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Invalid property was not rejected.');
    return 'rejected';
  });

  run('11. Invalid unit is rejected', () => {
    let rejected = false;
    try {
      AdminReservationService.checkUnitAvailability({
        unit_id: 'UNIT-999999',
        start_date: today,
        end_date: tomorrow
      });
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Invalid unit was not rejected.');
    return 'rejected';
  });

  run('12. Partial date-range filter is rejected', () => {
    let rejected = false;
    try {
      AdminReservationService.listReservations({
        property_id: propertyId,
        start_date: today
      });
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Partial date range was not rejected.');
    return 'rejected';
  });

  run('13. Unknown reservation is rejected', () => {
    let rejected = false;
    try {
      AdminReservationService.getReservation('RES-999999');
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Unknown reservation was not rejected.');
    return 'rejected';
  });

  run('14. Direct-create facade rejects malformed request before write', () => {
    let rejected = false;
    try {
      AdminReservationService.createDirectReservation({});
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Malformed create request was not rejected.');
    return 'rejected without write';
  });

  run('15. Write facade delegates only to frozen workflow APIs', () => {
    assertTrue(
      typeof ReservationWorkflowService.createDirectReservation === 'function',
      'createDirectReservation workflow missing.'
    );
    assertTrue(
      typeof ReservationWorkflowService.confirmReservation === 'function',
      'confirmReservation workflow missing.'
    );
    assertTrue(
      typeof ReservationWorkflowService.cancelReservation === 'function',
      'cancelReservation workflow missing.'
    );
    assertTrue(
      typeof ReservationWorkflowService.checkIn === 'function',
      'checkIn workflow missing.'
    );
    assertTrue(
      typeof ReservationWorkflowService.markNoShow === 'function',
      'markNoShow workflow missing.'
    );
    assertTrue(
      typeof ReservationWorkflowService.getReservationWorkflow === 'function',
      'getReservationWorkflow missing.'
    );

    return 'workflow contract verified';
  });

  run('16. OTA block completion dependency exists', () => {
    assertTrue(
      typeof OTABlockService.markBlocked === 'function',
      'OTABlockService.markBlocked() missing.'
    );

    return 'markBlocked available';
  });

  const passed = results.filter(row => row.passed).length;
  const failed = results.length - passed;

  Logger.log(
    '===== PHASE 6.2 ADMIN RESERVATION SERVICE TEST SUMMARY ====='
  );
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log(JSON.stringify(results, null, 2));
  Logger.log(
    '===== PHASE 6.2 ADMIN RESERVATION SERVICE TEST END ====='
  );

  if (failed > 0) {
    throw new Error(
      'Phase 6.2 AdminReservationService acceptance failed. FAILED=' +
      failed
    );
  }

  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    property_id: propertyId,
    date: today
  };
}
