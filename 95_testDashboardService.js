/**
 * ============================================================================
 * testDashboardService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.1 - DASHBOARD SERVICE ACCEPTANCE TEST
 * ============================================================================
 *
 * READ-ONLY TEST.
 *
 * This test MUST NOT:
 * - create/update/delete reservations
 * - change unit operational status
 * - create housekeeping tasks
 * - create inspections
 * - create maintenance work orders
 * - consume IDs
 *
 * Run:
 *   testDashboardService()
 *
 * Acceptance:
 *   FAILED: 0
 *
 * ============================================================================
 */

function testDashboardService() {

  Logger.log(
    '===== PHASE 6.1 DASHBOARD SERVICE TEST START ====='
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
    condition,
    message
  ) {
    if (!condition) {
      throw new Error(
        message ||
        'Expected condition to be true.'
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


  function assertArray(
    value,
    message
  ) {
    if (!Array.isArray(value)) {
      throw new Error(
        message ||
        'Expected an array.'
      );
    }
  }


  function run(name, fn) {
    try {
      const detail = fn();
      pass(name, detail);
    } catch (err) {
      fail(name, err);
    }
  }


  const properties =
    PropertyService
      .getAllProperties();

  if (
    !properties ||
    properties.length === 0
  ) {
    throw new Error(
      'No properties exist. Dashboard acceptance test cannot run.'
    );
  }


  const property =
    properties[0];

  const propertyId =
    property.property_id;

  const date =
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
    'Date: ' +
    date
  );


  let dashboard = null;


  run(
    '1. getDashboard returns object',
    () => {
      dashboard =
        DashboardService
          .getDashboard({
            property_id:
              propertyId,
            date:
              date
          });

      assertTrue(
        dashboard &&
        typeof dashboard ===
          'object',
        'Dashboard object was not returned.'
      );

      return (
        'generated_at=' +
        dashboard.generated_at
      );
    }
  );


  run(
    '2. Dashboard property matches request',
    () => {
      assertTrue(
        dashboard,
        'Dashboard unavailable because previous test failed.'
      );

      assertEqual(
        propertyId,
        dashboard.property
          .property_id
      );

      return propertyId;
    }
  );


  run(
    '3. Dashboard date is canonical',
    () => {
      assertEqual(
        date,
        dashboard.date
      );

      return dashboard.date;
    }
  );


  run(
    '4. Unit board contains all property units',
    () => {
      const expected =
        UnitService
          .getUnitsByProperty(
            propertyId
          );

      assertArray(
        dashboard.units
      );

      assertEqual(
        expected.length,
        dashboard.units.length
      );

      return (
        'units=' +
        dashboard.units.length
      );
    }
  );


  run(
    '5. Every unit availability matches AvailabilityService',
    () => {
      const endDate =
        (function () {
          const parts =
            date.split('-');

          const d =
            new Date(Date.UTC(
              Number(parts[0]),
              Number(parts[1]) - 1,
              Number(parts[2])
            ));

          d.setUTCDate(
            d.getUTCDate() + 1
          );

          return [
            d.getUTCFullYear(),
            String(
              d.getUTCMonth() + 1
            ).padStart(2, '0'),
            String(
              d.getUTCDate()
            ).padStart(2, '0')
          ].join('-');
        })();

      dashboard.units
        .forEach(row => {
          const authoritative =
            AvailabilityService
              .checkAvailability(
                row.unit_id,
                date,
                endDate
              );

          assertEqual(
            authoritative.available,
            row.sellable,
            'Sellability mismatch for ' +
              row.unit_id
          );

          assertTrue(
            row.availability &&
            Array.isArray(
              row.availability
                .reasons
            ),
            'Availability detail missing for ' +
              row.unit_id
          );
        });

      return (
        'checked=' +
        dashboard.units.length
      );
    }
  );


  run(
    '6. Operational status matches OperationalStatusService',
    () => {
      dashboard.units
        .forEach(row => {
          const status =
            OperationalStatusService
              .getStatus(
                row.unit_id
              );

          const expected =
            status
              ? String(
                  status
                    .operational_status ||
                  ''
                )
                .trim()
                .toUpperCase()
              : '';

          assertEqual(
            expected,
            row.operational_status,
            'Operational status mismatch for ' +
              row.unit_id
          );
        });

      return (
        'checked=' +
        dashboard.units.length
      );
    }
  );


  run(
    '7. KPI total_units matches unit board',
    () => {
      assertEqual(
        dashboard.units.length,
        dashboard.kpis
          .total_units
      );

      return (
        'total_units=' +
        dashboard.kpis
          .total_units
      );
    }
  );


  run(
    '8. KPI sellable matches unit board',
    () => {
      const expected =
        dashboard.units
          .filter(row =>
            row.sellable === true
          )
          .length;

      assertEqual(
        expected,
        dashboard.kpis
          .sellable
      );

      return (
        'sellable=' +
        expected
      );
    }
  );


  run(
    '9. Arrivals match ReservationService',
    () => {
      const unitIds =
        new Set(
          UnitService
            .getUnitsByProperty(
              propertyId
            )
            .map(unit =>
              String(
                unit.unit_id
              ).trim()
            )
        );

      const expected =
        ReservationService
          .getArrivals(date)
          .filter(reservation =>
            unitIds.has(
              String(
                reservation.unit_id
              ).trim()
            )
          );

      assertEqual(
        expected.length,
        dashboard.arrivals.length
      );

      assertEqual(
        expected.length,
        dashboard.kpis
          .arrivals
      );

      return (
        'arrivals=' +
        expected.length
      );
    }
  );


  run(
    '10. Departures match ReservationService',
    () => {
      const unitIds =
        new Set(
          UnitService
            .getUnitsByProperty(
              propertyId
            )
            .map(unit =>
              String(
                unit.unit_id
              ).trim()
            )
        );

      const expected =
        ReservationService
          .getDepartures(date)
          .filter(reservation =>
            unitIds.has(
              String(
                reservation.unit_id
              ).trim()
            )
          );

      assertEqual(
        expected.length,
        dashboard.departures.length
      );

      assertEqual(
        expected.length,
        dashboard.kpis
          .departures
      );

      return (
        'departures=' +
        expected.length
      );
    }
  );


  run(
    '11. Operations collections are arrays',
    () => {
      assertArray(
        dashboard.housekeeping,
        'housekeeping is not an array.'
      );

      assertArray(
        dashboard.inspections,
        'inspections is not an array.'
      );

      assertArray(
        dashboard.maintenance,
        'maintenance is not an array.'
      );

      return (
        'housekeeping=' +
        dashboard.housekeeping.length +
        ', inspections=' +
        dashboard.inspections.length +
        ', maintenance=' +
        dashboard.maintenance.length
      );
    }
  );


  run(
    '12. Operations belong to requested property',
    () => {
      const unitIds =
        new Set(
          dashboard.units
            .map(row =>
              String(
                row.unit_id
              ).trim()
            )
        );

      []
        .concat(
          dashboard.housekeeping,
          dashboard.inspections,
          dashboard.maintenance
        )
        .forEach(row => {
          assertTrue(
            unitIds.has(
              String(
                row.unit_id
              ).trim()
            ),
            'Cross-property operation found for unit ' +
              row.unit_id
          );
        });

      return 'property isolation verified';
    }
  );


  run(
    '13. Alerts collection is valid',
    () => {
      assertArray(
        dashboard.alerts
      );

      dashboard.alerts
        .forEach(alert => {
          assertTrue(
            !!alert.type,
            'Alert type is required.'
          );

          assertTrue(
            !!alert.severity,
            'Alert severity is required.'
          );

          assertTrue(
            !!alert.message,
            'Alert message is required.'
          );
        });

      return (
        'alerts=' +
        dashboard.alerts.length
      );
    }
  );


  run(
    '14. Focused API getUnitBoard matches dashboard',
    () => {
      const rows =
        DashboardService
          .getUnitBoard({
            property_id:
              propertyId,
            date:
              date
          });

      assertEqual(
        dashboard.units.length,
        rows.length
      );

      return (
        'rows=' +
        rows.length
      );
    }
  );


  run(
    '15. Focused API getKpis matches dashboard',
    () => {
      const kpis =
        DashboardService
          .getKpis({
            property_id:
              propertyId,
            date:
              date
          });

      assertEqual(
        dashboard.kpis
          .total_units,
        kpis.total_units
      );

      assertEqual(
        dashboard.kpis
          .sellable,
        kpis.sellable
      );

      assertEqual(
        dashboard.kpis
          .arrivals,
        kpis.arrivals
      );

      assertEqual(
        dashboard.kpis
          .departures,
        kpis.departures
      );

      return 'KPI API consistent';
    }
  );


  run(
    '16. Invalid property is rejected',
    () => {
      let rejected = false;

      try {
        DashboardService
          .getDashboard({
            property_id:
              'PROP-999999',
            date:
              date
          });
      } catch (err) {
        rejected = true;
      }

      assertTrue(
        rejected,
        'Unknown property was not rejected.'
      );

      return 'invalid property rejected';
    }
  );


  run(
    '17. Invalid date is rejected',
    () => {
      let rejected = false;

      try {
        DashboardService
          .getDashboard({
            property_id:
              propertyId,
            date:
              '2026-99-99'
          });
      } catch (err) {
        rejected = true;
      }

      assertTrue(
        rejected,
        'Invalid date was not rejected.'
      );

      return 'invalid date rejected';
    }
  );


  run(
    '18. Dashboard service exposes only read APIs',
    () => {
      const forbidden = [
        'create',
        'update',
        'delete',
        'changeStatus',
        'checkIn',
        'checkOut',
        'startCleaning',
        'completeCleaning'
      ];

      forbidden.forEach(name => {
        assertTrue(
          typeof DashboardService[name] ===
            'undefined',
          'DashboardService unexpectedly exposes write API: ' +
            name
        );
      });

      return 'read-only contract verified';
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
    '===== PHASE 6.1 DASHBOARD SERVICE TEST SUMMARY ====='
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
    '===== PHASE 6.1 DASHBOARD SERVICE TEST END ====='
  );


  if (failed > 0) {
    throw new Error(
      'Phase 6.1 DashboardService acceptance failed. FAILED=' +
      failed
    );
  }


  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    property_id: propertyId,
    date: date
  };
}
