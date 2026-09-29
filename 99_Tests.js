/**
 * ============================================================
 * 99_Tests.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Non-destructive acceptance and diagnostic test suite.
 *
 * PHASE 1
 * - Configuration
 * - Required sheets
 * - Repository
 * - Reference data
 * - ID service
 * - Properties
 * - Units
 * - Customers
 * - Staff
 * - Operational status
 * - Audit
 * - Integrity
 *
 * PHASE 2
 * - External calendar service
 * - iCal parser
 * - Availability service
 * - OTA/Admin blocks
 * - Calendar conflicts
 * - Calendar sync configuration
 * - Phase 2 integrity
 *
 * * PHASE 3 - RESERVATION ACCEPTANCE TESTS
 *
 * Test strategy:
 *
 * 1. Verify required Phase 3 APIs
 * 2. Verify current database integrity
 * 3. Verify ReservationGuest schema/model
 * 4. Verify OTA block model
 * 5. Verify reservation lifecycle rules
 * 6. Run a controlled DIRECT-booking workflow test when
 *    suitable test data is available
 * 7. Run final integrity gate
 *
 * IMPORTANT:
 * ============================================================
 *
 * Default tests are READ-ONLY / NON-DESTRUCTIVE.
 *
 * No real OTA calendar synchronization is performed by the
 * acceptance gate.
 *
 * No reservations, external events, OTA blocks, customers,
 * properties, units or staff records are created/deleted.
 *
 * Phase 3 workflow tests may create temporary reservation,
 * guest-assignment, OTA-block and audit records.
 *
 * The reservation is cancelled at the end rather than deleted,
 * preserving the audit trail.
 * 
 * ============================================================
 */


/**
 * ============================================================
 * TEST FRAMEWORK
 * ============================================================
 */

const TestService = (() => {

  function createSuite(name) {

    return {
      name: name,
      passed: true,
      tests: [],
      started_at: new Date(),
      finished_at: null,
      duration_ms: 0
    };

  }


  function addResult(
    suite,
    name,
    passed,
    message,
    data
  ) {

    const result = {
      name: name,
      passed: Boolean(passed),
      message: message || '',
      data:
        data === undefined
          ? null
          : data
    };


    suite.tests.push(
      result
    );


    if (!result.passed) {

      suite.passed = false;

    }


    return result;

  }


  function pass(
    suite,
    name,
    message,
    data
  ) {

    return addResult(
      suite,
      name,
      true,
      message,
      data
    );

  }


  function fail(
    suite,
    name,
    message,
    data
  ) {

    return addResult(
      suite,
      name,
      false,
      message,
      data
    );

  }


  function assertTrue(
    suite,
    name,
    condition,
    message,
    data
  ) {

    if (condition) {

      return pass(
        suite,
        name,
        message || 'Passed.',
        data
      );

    }


    return fail(
      suite,
      name,
      message || 'Assertion failed.',
      data
    );

  }


  function assertEqual(
    suite,
    name,
    actual,
    expected,
    message
  ) {

    const passed =
      actual === expected;


    return addResult(
      suite,
      name,
      passed,
      message ||
        (
          passed
            ? 'Values match.'
            : (
              'Expected "' +
              expected +
              '" but got "' +
              actual +
              '".'
            )
        ),
      {
        actual: actual,
        expected: expected
      }
    );

  }


  function assertArray(
    suite,
    name,
    value,
    message
  ) {

    return assertTrue(
      suite,
      name,
      Array.isArray(value),
      message ||
        'Expected an array.',
      value
    );

  }


function runTest(
  suite,
  name,
  callback
) {

  try {

    const result =
      callback();


    /*
     * IMPORTANT:
     *
     * A boolean false can be a perfectly valid successful
     * result.
     *
     * Examples:
     *
     * isReservationBlocking(CANCELLED) === false
     * isOTABlockBlocking(CANCELLED) === false
     * rangesOverlap(adjacent ranges) === false
     *
     * Therefore only an exception represents test failure.
     */

    pass(
      suite,
      name,
      'Passed.',
      result
    );


    return true;

  } catch (err) {

    fail(
      suite,
      name,
      err.message || String(err),
      {
        stack:
          err.stack || ''
      }
    );


    return false;

  }

}


  function finish(
    suite
  ) {

    suite.finished_at =
      new Date();


    suite.duration_ms =
      suite.finished_at.getTime() -
      suite.started_at.getTime();


    suite.total =
      suite.tests.length;


    suite.passed_count =
      suite.tests.filter(
        test => test.passed
      ).length;


    suite.failed_count =
      suite.tests.filter(
        test => !test.passed
      ).length;


    suite.passed =
      suite.failed_count === 0;


    return suite;

  }


  function printSuite(
    suite
  ) {

    Logger.log(
      '=============================================='
    );

    Logger.log(
      suite.name
    );

    Logger.log(
      '=============================================='
    );


    suite.tests.forEach(
      test => {

        Logger.log(
          (
            test.passed
              ? 'PASS'
              : 'FAIL'
          ) +
          ' | ' +
          test.name +
          (
            test.message
              ? ' | ' +
                test.message
              : ''
          )
        );

      }
    );


    Logger.log(
      '----------------------------------------------'
    );

    Logger.log(
      'PASSED: ' +
        suite.passed
    );


    Logger.log(
      'TOTAL: ' +
        suite.total
    );


    Logger.log(
      'PASS: ' +
        suite.passed_count
    );


    Logger.log(
      'FAIL: ' +
        suite.failed_count
    );


    Logger.log(
      'DURATION: ' +
        suite.duration_ms +
        ' ms'
    );


    Logger.log(
      '=============================================='
    );


    return suite;

  }


  return {

    createSuite,

    addResult,

    pass,

    fail,

    assertTrue,

    assertEqual,

    assertArray,

    runTest,

    finish,

    printSuite

  };

})();


/**
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

function testIsBlank(
  value
) {

  return (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  );

}


function testNormalize(
  value
) {

  if (
    testIsBlank(value)
  ) {

    return '';

  }


  return String(value)
    .trim()
    .toUpperCase();

}


function testGetFirstRecord(
  sheetName
) {

  const records =
    BaseRepository.findAll(
      sheetName
    );


  return (
    records.length > 0
      ? records[0]
      : null
  );

}


/**
 * ============================================================
 * PHASE 1 - CONFIGURATION
 * ============================================================
 */

function testPhase1Configuration(
  suite
) {

  TestService.runTest(
    suite,
    'P1.CONFIG.APP',
    () => {

      if (
        !CONFIG ||
        !CONFIG.APP
      ) {

        throw new Error(
          'CONFIG.APP is missing.'
        );

      }


      return {
        name:
          CONFIG.APP.NAME,

        version:
          CONFIG.APP.VERSION,

        phase:
          CONFIG.APP.PHASE
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.CONFIG.TIMEZONE',
    () => {

      if (
        CONFIG.TIMEZONE !==
        'Africa/Cairo'
      ) {

        throw new Error(
          'Expected timezone Africa/Cairo, got: ' +
          CONFIG.TIMEZONE
        );

      }


      return CONFIG.TIMEZONE;

    }
  );


  TestService.runTest(
    suite,
    'P1.CONFIG.SHEETS',
    () => {

      const required = [

        'REFERENCE_DATA',
        'PROPERTIES',
        'UNITS',
        'LOCATIONS',
        'CUSTOMERS',
        'GUESTS',
        'STAFF',
        'UNIT_OPERATIONAL_STATUS',
        'AUDIT_LOG'

      ];


      required.forEach(
        key => {

          if (
            !CONFIG.SHEETS[key]
          ) {

            throw new Error(
              'Missing CONFIG.SHEETS.' +
              key
            );

          }

        }
      );


      return required;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - REQUIRED SHEETS
 * ============================================================
 */

function testPhase1RequiredSheets(
  suite
) {

  TestService.runTest(
    suite,
    'P1.REQUIRED_SHEETS',
    () => {

      const result =
        IntegrityCheckService
          .checkRequiredSheets();


      if (
        result.errors.length > 0
      ) {

        throw new Error(
          result.errors
            .map(
              item =>
                item.message
            )
            .join(' | ')
        );

      }


      return result;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - REPOSITORY
 * ============================================================
 */

function testPhase1Repository(
  suite
) {

  TestService.runTest(
    suite,
    'P1.REPOSITORY.SPREADSHEET',
    () => {

      const spreadsheet =
        BaseRepository
          .getSpreadsheet();


      if (!spreadsheet) {

        throw new Error(
          'Spreadsheet not available.'
        );

      }


      return {
        id:
          spreadsheet.getId(),

        name:
          spreadsheet.getName()
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.REPOSITORY.HEADERS',
    () => {

      const headers =
        BaseRepository
          .getHeaders(
            CONFIG.SHEETS.UNITS
          );


      if (
        !Array.isArray(headers) ||
        headers.length === 0
      ) {

        throw new Error(
          'Unit headers were not returned.'
        );

      }


      if (
        !headers.includes(
          'unit_id'
        )
      ) {

        throw new Error(
          'unit_id header missing.'
        );

      }


      return headers;

    }
  );


  TestService.runTest(
    suite,
    'P1.REPOSITORY.FIND_ALL',
    () => {

      const records =
        BaseRepository
          .findAll(
            CONFIG.SHEETS.UNITS
          );


      if (
        !Array.isArray(records)
      ) {

        throw new Error(
          'findAll() did not return an array.'
        );

      }


      return {
        count:
          records.length
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - REFERENCE DATA
 * ============================================================
 */

function testPhase1ReferenceData(
  suite
) {

  const categories = [

    'PROPERTY_TYPE',
    'UNIT_TYPE',
    'UNIT_STATUS',
    'STAFF_ROLE',
    'OPERATIONAL_STATUS'

  ];


  categories.forEach(
    category => {

      TestService.runTest(
        suite,
        'P1.REFERENCE.' +
          category,
        () => {

          const values =
            ValidationService
              .getReferenceValues(
                category
              );


          if (
            !Array.isArray(values) ||
            values.length === 0
          ) {

            throw new Error(
              'No active values for ' +
              category
            );

          }


          return values;

        }
      );

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - ID SERVICE
 * ============================================================
 */

function testPhase1IdService(
  suite
) {

  TestService.runTest(
    suite,
    'P1.ID.SEQUENCE_STATUS',
    () => {

      const statuses =
        IdService
          .getAllSequenceStatuses();


      if (
        !Array.isArray(statuses)
      ) {

        throw new Error(
          'Expected sequence status array.'
        );

      }


      const invalid =
        statuses.filter(
          status =>
            !status.valid
        );


      if (
        invalid.length > 0
      ) {

        throw new Error(
          'Invalid ID sequence(s): ' +
          invalid
            .map(
              status =>
                status.entity_type
            )
            .join(', ')
        );

      }


      return statuses;

    }
  );


  TestService.runTest(
    suite,
    'P1.ID.FORMATS',
    () => {

      const result =
        IntegrityCheckService
          .checkIdFormats();


      if (
        result.errors.length
      ) {

        throw new Error(
          result.errors
            .map(
              item =>
                item.message
            )
            .join(' | ')
        );

      }


      return result;

    }
  );


  TestService.runTest(
    suite,
    'P1.ID.DUPLICATES',
    () => {

      const result =
        IntegrityCheckService
          .checkDuplicateIds();


      if (
        result.errors.length
      ) {

        throw new Error(
          result.errors
            .map(
              item =>
                item.message
            )
            .join(' | ')
        );

      }


      return result;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - PROPERTY SERVICE
 * ============================================================
 */

function testPhase1PropertyService(
  suite
) {

  TestService.runTest(
    suite,
    'P1.PROPERTY.GET_ALL',
    () => {

      const records =
        PropertyService
          .getAllProperties();


      if (
        !Array.isArray(records)
      ) {

        throw new Error(
          'getAllProperties() did not return an array.'
        );

      }


      return {
        count:
          records.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.PROPERTY.GET_BY_ID',
    () => {

      const record =
        testGetFirstRecord(
          CONFIG.SHEETS.PROPERTIES
        );


      if (!record) {

        return {
          skipped:
            true,

          reason:
            'No property records.'
        };

      }


      const found =
        PropertyService
          .getPropertyById(
            record.property_id
          );


      if (
        !found ||
        found.property_id !==
          record.property_id
      ) {

        throw new Error(
          'Property lookup failed for ' +
          record.property_id
        );

      }


      return found;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - UNIT SERVICE
 * ============================================================
 */

function testPhase1UnitService(
  suite
) {

  TestService.runTest(
    suite,
    'P1.UNIT.GET_ALL',
    () => {

      const units =
        UnitService.getAllUnits();


      if (
        !Array.isArray(units)
      ) {

        throw new Error(
          'getAllUnits() did not return an array.'
        );

      }


      return {
        count:
          units.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.UNIT.GET_BY_ID',
    () => {

      const record =
        testGetFirstRecord(
          CONFIG.SHEETS.UNITS
        );


      if (!record) {

        return {
          skipped:
            true,

          reason:
            'No unit records.'
        };

      }


      const found =
        UnitService.getUnitById(
          record.unit_id
        );


      if (
        !found ||
        found.unit_id !==
          record.unit_id
      ) {

        throw new Error(
          'Unit lookup failed for ' +
          record.unit_id
        );

      }


      return found;

    }
  );


  TestService.runTest(
    suite,
    'P1.UNIT.ACTIVE_UNITS',
    () => {

      const units =
        UnitService
          .getActiveUnits();


      if (
        !Array.isArray(units)
      ) {

        throw new Error(
          'getActiveUnits() did not return an array.'
        );

      }


      const invalid =
        units.filter(
          unit =>
            testNormalize(
              unit.status
            ) !==
            'ACTIVE'
        );


      if (
        invalid.length
      ) {

        throw new Error(
          'getActiveUnits() returned non-ACTIVE unit(s).'
        );

      }


      return {
        count:
          units.length
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - CUSTOMER SERVICE
 * ============================================================
 */

function testPhase1CustomerService(
  suite
) {

  TestService.runTest(
    suite,
    'P1.CUSTOMER.GET_ALL',
    () => {

      const customers =
        CustomerService
          .getAllCustomers();


      if (
        !Array.isArray(customers)
      ) {

        throw new Error(
          'getAllCustomers() did not return an array.'
        );

      }


      return {
        count:
          customers.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.CUSTOMER.GET_BY_ID',
    () => {

      const record =
        testGetFirstRecord(
          CONFIG.SHEETS.CUSTOMERS
        );


      if (!record) {

        return {
          skipped:
            true,

          reason:
            'No customer records.'
        };

      }


      const found =
        CustomerService
          .getCustomerById(
            record.customer_id
          );


      if (
        !found ||
        found.customer_id !==
          record.customer_id
      ) {

        throw new Error(
          'Customer lookup failed for ' +
          record.customer_id
        );

      }


      return found;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - STAFF SERVICE
 * ============================================================
 */

function testPhase1StaffService(
  suite
) {

  TestService.runTest(
    suite,
    'P1.STAFF.GET_ALL',
    () => {

      const records =
        StaffService.getAllStaff();


      if (
        !Array.isArray(records)
      ) {

        throw new Error(
          'getAllStaff() did not return an array.'
        );

      }


      return {
        count:
          records.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.STAFF.GET_BY_ID',
    () => {

      const record =
        testGetFirstRecord(
          CONFIG.SHEETS.STAFF
        );


      if (!record) {

        return {
          skipped:
            true,

          reason:
            'No staff records.'
        };

      }


      const found =
        StaffService.getStaffById(
          record.staff_id
        );


      if (
        !found ||
        found.staff_id !==
          record.staff_id
      ) {

        throw new Error(
          'Staff lookup failed for ' +
          record.staff_id
        );

      }


      return found;

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - OPERATIONAL STATUS
 * ============================================================
 */

function testPhase1OperationalStatus(
  suite
) {

  TestService.runTest(
    suite,
    'P1.OPERATIONAL.ALL',
    () => {

      const statuses =
        OperationalStatusService
          .getAllStatuses();


      if (
        !Array.isArray(statuses)
      ) {

        throw new Error(
          'getAllStatuses() did not return an array.'
        );

      }


      return {
        count:
          statuses.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.OPERATIONAL.ONE_PER_UNIT',
    () => {

      const missing =
        OperationalStatusService
          .findUnitsWithoutStatus();


      const orphan =
        OperationalStatusService
          .findOrphanStatuses();


      const duplicate =
        OperationalStatusService
          .findDuplicateStatuses();


      const invalid =
        OperationalStatusService
          .findInvalidStatuses();


      if (
        missing.length ||
        orphan.length ||
        duplicate.length ||
        invalid.length
      ) {

        throw new Error(
          'Operational status integrity failed. ' +
          'missing=' +
          missing.length +
          ', orphan=' +
          orphan.length +
          ', duplicate=' +
          duplicate.length +
          ', invalid=' +
          invalid.length
        );

      }


      return {
        missing:
          0,

        orphan:
          0,

        duplicate:
          0,

        invalid:
          0
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - AUDIT
 * ============================================================
 */

function testPhase1Audit(
  suite
) {

  TestService.runTest(
    suite,
    'P1.AUDIT.GET_ALL',
    () => {

      const records =
        AuditService.getAll();


      if (
        !Array.isArray(records)
      ) {

        throw new Error(
          'AuditService.getAll() did not return an array.'
        );

      }


      return {
        count:
          records.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P1.AUDIT.INTEGRITY',
    () => {

      const result =
        IntegrityCheckService
          .checkAuditLog();


      if (
        result.errors.length
      ) {

        throw new Error(
          result.errors
            .map(
              item =>
                item.message
            )
            .join(' | ')
        );

      }


      return {
        errors:
          result.errors.length,

        warnings:
          result.warnings.length
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 1 - INTEGRITY
 * ============================================================
 */

function testPhase1Integrity(
  suite
) {

  TestService.runTest(
    suite,
    'P1.INTEGRITY',
    () => {

      const report =
        IntegrityCheckService
          .runAll();


      if (
        report.summary.errors > 0
      ) {

        throw new Error(
          'Integrity check contains ' +
          report.summary.errors +
          ' error(s).'
        );

      }


      return {
        passed:
          report.passed,

        errors:
          report.summary.errors,

        warnings:
          report.summary.warnings
      };

    }
  );

}


/**
 * ============================================================
 * RUN PHASE 1 ACCEPTANCE TESTS
 * ============================================================
 */

function runPhase1AcceptanceTests() {

  const suite =
    TestService.createSuite(
      'PHASE 1 ACCEPTANCE TESTS'
    );


  testPhase1Configuration(
    suite
  );


  testPhase1RequiredSheets(
    suite
  );


  testPhase1Repository(
    suite
  );


  testPhase1ReferenceData(
    suite
  );


  testPhase1IdService(
    suite
  );


  testPhase1PropertyService(
    suite
  );


  testPhase1UnitService(
    suite
  );


  testPhase1CustomerService(
    suite
  );


  testPhase1StaffService(
    suite
  );


  testPhase1OperationalStatus(
    suite
  );


  testPhase1Audit(
    suite
  );


  testPhase1Integrity(
    suite
  );


  TestService.finish(
    suite
  );


  TestService.printSuite(
    suite
  );


  return suite;

}


/**
 * ============================================================
 * PHASE 2 - CONFIGURATION
 * ============================================================
 */

function testPhase2Configuration(
  suite
) {

  TestService.runTest(
    suite,
    'P2.CONFIG.SHEETS',
    () => {

      const required = [

        'RESERVATIONS',

        'EXTERNAL_CALENDAR_EVENTS',

        'OTA_BLOCKS'

      ];


      required.forEach(
        key => {

          if (
            !CONFIG.SHEETS[key]
          ) {

            throw new Error(
              'Missing CONFIG.SHEETS.' +
              key
            );

          }

        }
      );


      return required;

    }
  );


  TestService.runTest(
    suite,
    'P2.CONFIG.ID_PREFIXES',
    () => {

      const required = [

        'RESERVATION',

        'EXTERNAL_CALENDAR_EVENT',

        'OTA_BLOCK'

      ];


      required.forEach(
        key => {

          if (
            !CONFIG.ID_PREFIXES[key]
          ) {

            throw new Error(
              'Missing CONFIG.ID_PREFIXES.' +
              key
            );

          }

        }
      );


      return required;

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - REFERENCE DATA
 * ============================================================
 */

function testPhase2ReferenceData(
  suite
) {

  [
    'RESERVATION_STATUS',
    'BOOKING_SOURCE'
  ].forEach(
    category => {

      TestService.runTest(
        suite,
        'P2.REFERENCE.' +
          category,
        () => {

          const values =
            ValidationService
              .getReferenceValues(
                category
              );


          if (
            !Array.isArray(values) ||
            values.length === 0
          ) {

            throw new Error(
              'No active values for ' +
              category
            );

          }


          return values;

        }
      );

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - EXTERNAL CALENDAR SERVICE
 * ============================================================
 */

function testPhase2ExternalCalendarService(
  suite
) {

  TestService.runTest(
    suite,
    'P2.EXTERNAL.GET_ALL',
    () => {

      const events =
        ExternalCalendarService
          .getAll();


      if (
        !Array.isArray(events)
      ) {

        throw new Error(
          'getAllEvents() did not return an array.'
        );

      }


      return {
        count:
          events.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.EXTERNAL.INTEGRITY',
    () => {

      const orphan =
        ExternalCalendarService
          .findOrphanEvents();


      const duplicate =
        ExternalCalendarService
          .findDuplicateEvents();


      const invalidRanges =
        ExternalCalendarService
          .findInvalidDateRanges();


      const invalidStatuses =
        ExternalCalendarService
          .findInvalidStatuses();


      const missingKeys =
        ExternalCalendarService
          .findMissingNaturalKeys();


      if (
        orphan.length ||
        duplicate.length ||
        invalidRanges.length ||
        invalidStatuses.length ||
        missingKeys.length
      ) {

        throw new Error(
          'External calendar integrity failed. ' +
          'orphan=' +
          orphan.length +
          ', duplicate=' +
          duplicate.length +
          ', invalidRanges=' +
          invalidRanges.length +
          ', invalidStatuses=' +
          invalidStatuses.length +
          ', missingKeys=' +
          missingKeys.length
        );

      }


      return {
        orphan:
          0,

        duplicate:
          0,

        invalid_ranges:
          0,

        invalid_statuses:
          0,

        missing_keys:
          0
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.EXTERNAL.CHECKOUT_EXCLUSIVE',
    () => {

      const overlap =
        ExternalCalendarService
          .rangesOverlap(
            '2026-10-01',
            '2026-10-05',
            '2026-10-05',
            '2026-10-10'
          );


      if (overlap) {

        throw new Error(
          'Checkout-exclusive ranges were incorrectly considered overlapping.'
        );

      }


      return {
        overlap:
          overlap
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - ICAL SERVICE
 * ============================================================
 *
 * Uses local synthetic iCal content.
 *
 * NO network call is performed.
 * ============================================================
 */

function testPhase2ICalService(
  suite
) {

  TestService.runTest(
    suite,
    'P2.ICAL.VALIDATE',
    () => {

      const content = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test-phase2-001',
        'SUMMARY:Test Reservation',
        'DTSTART;VALUE=DATE:20261020',
        'DTEND;VALUE=DATE:20261025',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');


      const result =
        ICalService
          .validateContent(
            content
          );


      if (
        result === false
      ) {

        throw new Error(
          'Valid iCal content was rejected.'
        );

      }


      return result;

    }
  );


  TestService.runTest(
    suite,
    'P2.ICAL.PARSE',
    () => {

      const content = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test-phase2-001',
        'SUMMARY:Test Reservation',
        'DTSTART;VALUE=DATE:20261020',
        'DTEND;VALUE=DATE:20261025',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');


      const events =
        ICalService.parseCalendar(
          content
        );


      if (
        !Array.isArray(events)
      ) {

        throw new Error(
          'ICalService.parse() did not return an array.'
        );

      }


      if (
        events.length !== 1
      ) {

        throw new Error(
          'Expected exactly one parsed event, got ' +
          events.length
        );

      }


      const event =
        events[0];


      if (
        event.external_uid !==
        'test-phase2-001'
      ) {

        throw new Error(
          'Unexpected UID: ' +
          event.external_uid
        );

      }


      if (
        event.start_date !==
        '2026-10-20'
      ) {

        throw new Error(
          'Unexpected start date: ' +
          event.start_date
        );

      }


      if (
        event.end_date !==
        '2026-10-25'
      ) {

        throw new Error(
          'Unexpected end date: ' +
          event.end_date
        );

      }


      return event;

    }
  );


  TestService.runTest(
    suite,
    'P2.ICAL.CANCELLED_EVENT',
    () => {

      const content = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test-phase2-cancelled',
        'SUMMARY:Cancelled Reservation',
        'STATUS:CANCELLED',
        'DTSTART;VALUE=DATE:20261020',
        'DTEND;VALUE=DATE:20261025',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');


      const events =
        ICalService.parseCalendar(
          content
        );


      if (
        events.length !== 0
      ) {

        throw new Error(
          'Cancelled iCal event should not be returned as an active event.'
        );

      }


      return {
        count:
          events.length
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - DATE / OVERLAP LOGIC
 * ============================================================
 */

function testPhase2DateLogic(
  suite
) {

  TestService.runTest(
    suite,
    'P2.DATE.VALID_RANGE',
    () => {

      const range =
        AvailabilityService
          .validateDateRange(
            '2026-10-01',
            '2026-10-05'
          );


      if (
        range.start_date !==
        '2026-10-01'
      ) {

        throw new Error(
          'Unexpected normalized start date.'
        );

      }


      if (
        range.end_date !==
        '2026-10-05'
      ) {

        throw new Error(
          'Unexpected normalized end date.'
        );

      }


      return range;

    }
  );


  TestService.runTest(
    suite,
    'P2.DATE.CHECKOUT_EXCLUSIVE',
    () => {

      const overlap =
        AvailabilityService
          .rangesOverlap(
            '2026-10-01',
            '2026-10-05',
            '2026-10-05',
            '2026-10-10'
          );


      if (overlap) {

        throw new Error(
          'Adjacent reservations must not overlap.'
        );

      }


      return {
        overlap:
          overlap
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.DATE.REAL_OVERLAP',
    () => {

      const overlap =
        AvailabilityService
          .rangesOverlap(
            '2026-10-01',
            '2026-10-05',
            '2026-10-04',
            '2026-10-10'
          );


      if (!overlap) {

        throw new Error(
          'Overlapping ranges were not detected.'
        );

      }


      return {
        overlap:
          overlap
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.DATE.INVALID_RANGE',
    () => {

      let rejected =
        false;


      try {

        AvailabilityService
          .validateDateRange(
            '2026-10-10',
            '2026-10-05'
          );

      } catch (err) {

        rejected =
          true;

      }


      if (!rejected) {

        throw new Error(
          'Invalid date range was accepted.'
        );

      }


      return {
        rejected:
          rejected
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - RESERVATION BLOCKING RULES
 * ============================================================
 */

function testPhase2ReservationStatusRules(
  suite
) {

  const blocking = [
    'PENDING',
    'CONFIRMED',
    'CHECKED_IN'
  ];


  const nonBlocking = [
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  ];


  blocking.forEach(
    status => {

      TestService.runTest(
        suite,
        'P2.RESERVATION.BLOCKING.' +
          status,
        () => {

          const result =
            AvailabilityService
              .isReservationBlocking({
                status: status
              });


          if (!result) {

            throw new Error(
              status +
              ' should block availability.'
            );

          }


          return result;

        }
      );

    }
  );


  nonBlocking.forEach(
    status => {

      TestService.runTest(
        suite,
        'P2.RESERVATION.NON_BLOCKING.' +
          status,
        () => {

          const result =
            AvailabilityService
              .isReservationBlocking({
                status: status
              });


          if (result) {

            throw new Error(
              status +
              ' should not block availability.'
            );

          }


          return result;

        }
      );

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - OTA BLOCK WORKFLOW
 * ============================================================
 */

function testPhase2OTABlockRules(
  suite
) {

  TestService.runTest(
    suite,
    'P2.OTA.PENDING_BLOCKS',
    () => {

      const result =
        AvailabilityService
          .isOTABlockBlocking({
            status:
              'PENDING'
          });


      if (!result) {

        throw new Error(
          'PENDING OTA block must protect availability.'
        );

      }


      return result;

    }
  );


  TestService.runTest(
    suite,
    'P2.OTA.BLOCKED_BLOCKS',
    () => {

      const result =
        AvailabilityService
          .isOTABlockBlocking({
            status:
              'BLOCKED'
          });


      if (!result) {

        throw new Error(
          'BLOCKED OTA block must protect availability.'
        );

      }


      return result;

    }
  );


  TestService.runTest(
    suite,
    'P2.OTA.CANCELLED_NON_BLOCKING',
    () => {

      const result =
        AvailabilityService
          .isOTABlockBlocking({
            status:
              'CANCELLED'
          });


      if (result) {

        throw new Error(
          'CANCELLED OTA block must not protect availability.'
        );

      }


      return result;

    }
  );


  TestService.runTest(
    suite,
    'P2.OTA.STATUS_SUMMARY',
    () => {

      const summary =
        AvailabilityService
          .getOTABlockStatusSummary();


      if (
        !summary ||
        summary.total ===
          undefined
      ) {

        throw new Error(
          'Invalid OTA block status summary.'
        );

      }


      if (
        summary.invalid > 0
      ) {

        throw new Error(
          'Found ' +
          summary.invalid +
          ' invalid OTA block status record(s).'
        );

      }


      return summary;

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - AVAILABILITY
 * ============================================================
 */

function testPhase2Availability(
  suite
) {

  TestService.runTest(
    suite,
    'P2.AVAILABILITY.FIRST_UNIT',
    () => {

      const unit =
        testGetFirstRecord(
          CONFIG.SHEETS.UNITS
        );


      if (!unit) {

        return {
          skipped:
            true,

          reason:
            'No unit records.'
        };

      }


      /*
       * Far-future diagnostic range.
       *
       * We are testing API shape here, not asserting that the
       * unit must be available.
       */

      const result =
        AvailabilityService
          .checkAvailability(
            unit.unit_id,
            '2035-01-10',
            '2035-01-12'
          );


      if (
        typeof result.available !==
        'boolean'
      ) {

        throw new Error(
          'Availability result missing boolean "available".'
        );

      }


      if (
        !Array.isArray(
          result.reasons
        )
      ) {

        throw new Error(
          'Availability result missing reasons array.'
        );

      }


      if (
        !result.conflicts
      ) {

        throw new Error(
          'Availability result missing conflicts object.'
        );

      }


      return {
        unit_id:
          result.unit_id,

        available:
          result.available,

        reasons:
          result.reasons
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.AVAILABILITY.AVAILABLE_UNITS_API',
    () => {

      const results =
        AvailabilityService
          .getAvailableUnits(
            '2035-01-10',
            '2035-01-12'
          );


      if (
        !Array.isArray(results)
      ) {

        throw new Error(
          'getAvailableUnits() did not return an array.'
        );

      }


      return {
        count:
          results.length
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - CONFLICT DIAGNOSTICS
 * ============================================================
 */

function testPhase2ConflictDiagnostics(
  suite
) {

  TestService.runTest(
    suite,
    'P2.CONFLICT.INTERNAL',
    () => {

      const conflicts =
        AvailabilityService
          .findReservationConflicts();


      if (
        !Array.isArray(conflicts)
      ) {

        throw new Error(
          'findReservationConflicts() did not return an array.'
        );

      }


      /*
       * Internal reservation conflicts are not acceptable.
       */

      if (
        conflicts.length > 0
      ) {

        throw new Error(
          'Found ' +
          conflicts.length +
          ' overlapping internal reservation conflict(s).'
        );

      }


      return {
        count:
          conflicts.length
      };

    }
  );


  TestService.runTest(
    suite,
    'P2.CONFLICT.EXTERNAL',
    () => {

      const conflicts =
        AvailabilityService
          .findReservationExternalConflicts();


      if (
        !Array.isArray(conflicts)
      ) {

        throw new Error(
          'findReservationExternalConflicts() did not return an array.'
        );

      }


      /*
       * IMPORTANT:
       *
       * Reservation/external-calendar overlaps are diagnostic
       * only because an OTA booking may legitimately appear in
       * both datasets.
       *
       * Therefore this test PASSES even when such overlaps
       * exist.
       */

      return {
        count:
          conflicts.length,

        informational:
          true
      };

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - CALENDAR CONFIGURATION
 * ============================================================
 */

function testPhase2CalendarConfiguration(
  suite
) {

  TestService.runTest(
    suite,
    'P2.CALENDAR.CONFIGURATION',
    () => {

      const result =
        IntegrityCheckService
          .checkCalendarFeedConfiguration();


      if (
        result.errors.length > 0
      ) {

        throw new Error(
          result.errors
            .map(
              item =>
                item.message
            )
            .join(' | ')
        );

      }


      return {
        errors:
          result.errors.length,

        warnings:
          result.warnings.length,

        infos:
          result.infos.length
      };

    }
  );


  TestService.runTest(
  suite,
  'P2.CALENDAR.SERVICE_INSPECTION',
  () => {

    if (
      typeof CalendarSyncService
        .getSyncConfiguration !==
      'function'
    ) {

      throw new Error(
        'CalendarSyncService.getSyncConfiguration() is missing.'
      );

    }


    const result =
      CalendarSyncService
        .getSyncConfiguration();


    if (
      result === undefined ||
      result === null
    ) {

      throw new Error(
        'getSyncConfiguration() returned no result.'
      );

    }


    return result;

  }
);

}


/**
 * ============================================================
 * PHASE 2 - ID SEQUENCES
 * ============================================================
 */

function testPhase2IdSequences(
  suite
) {

  TestService.runTest(
    suite,
    'P2.ID.RESERVATION',
    () => {

      const status =
        IdService
          .getSequenceStatus(
            'RESERVATION',
            CONFIG.SHEETS.RESERVATIONS,
            'reservation_id'
          );


      if (!status.valid) {

        throw new Error(
          'Reservation sequence is behind sheet data.'
        );

      }


      return status;

    }
  );


  TestService.runTest(
    suite,
    'P2.ID.EXTERNAL_EVENT',
    () => {

      const status =
        IdService
          .getSequenceStatus(
            'EXTERNAL_CALENDAR_EVENT',
            CONFIG.SHEETS
              .EXTERNAL_CALENDAR_EVENTS,
            'external_event_id'
          );


      if (!status.valid) {

        throw new Error(
          'External calendar event sequence is behind sheet data.'
        );

      }


      return status;

    }
  );


  TestService.runTest(
    suite,
    'P2.ID.OTA_BLOCK',
    () => {

      const status =
        IdService
          .getSequenceStatus(
            'OTA_BLOCK',
            CONFIG.SHEETS.OTA_BLOCKS,
            'ota_block_id'
          );


      if (!status.valid) {

        throw new Error(
          'OTA block sequence is behind sheet data.'
        );

      }


      return status;

    }
  );

}


/**
 * ============================================================
 * PHASE 2 - INTEGRITY
 * ============================================================
 */

function testPhase2Integrity(
  suite
) {

  TestService.runTest(
    suite,
    'P2.INTEGRITY.FULL',
    () => {

      const report =
        IntegrityCheckService
          .runAll();


      if (
        report.summary.errors !== 0
      ) {

        throw new Error(
          'Integrity check failed with ' +
          report.summary.errors +
          ' error(s).'
        );

      }


      return {
        passed:
          report.passed,

        errors:
          report.summary.errors,

        warnings:
          report.summary.warnings,

        infos:
          report.summary.infos
      };

    }
  );

}


/**
 * ============================================================
 * RUN PHASE 2 ACCEPTANCE TESTS
 * ============================================================
 */

function runPhase2AcceptanceTests() {

  const suite =
    TestService.createSuite(
      'PHASE 2 ACCEPTANCE TESTS'
    );


  testPhase2Configuration(
    suite
  );


  testPhase2ReferenceData(
    suite
  );


  testPhase2ExternalCalendarService(
    suite
  );


  testPhase2ICalService(
    suite
  );


  testPhase2DateLogic(
    suite
  );


  testPhase2ReservationStatusRules(
    suite
  );


  testPhase2OTABlockRules(
    suite
  );


  testPhase2Availability(
    suite
  );


  testPhase2ConflictDiagnostics(
    suite
  );


  testPhase2CalendarConfiguration(
    suite
  );


  testPhase2IdSequences(
    suite
  );


  testPhase2Integrity(
    suite
  );


  TestService.finish(
    suite
  );


  TestService.printSuite(
    suite
  );


  return suite;

}


/**
 * ============================================================
 * PHASE 1 GATE
 * ============================================================
 */

function runPhase1Gate() {

  const suite =
    runPhase1AcceptanceTests();


  const integrity =
    IntegrityCheckService
      .runAll();


  const passed =
    (
      suite.passed &&
      integrity.summary.errors === 0
    );


  const result = {

    phase:
      'PHASE_1',

    passed:
      passed,

    tests: {
      passed:
        suite.passed,

      total:
        suite.total,

      passed_count:
        suite.passed_count,

      failed_count:
        suite.failed_count
    },

    integrity: {
      passed:
        integrity.passed,

      errors:
        integrity.summary.errors,

      warnings:
        integrity.summary.warnings
    }

  };


  Logger.log(
    '=============================================='
  );

  Logger.log(
    'PHASE 1 GATE'
  );

  Logger.log(
    '=============================================='
  );

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  Logger.log(
    '=============================================='
  );


  return result;

}


/**
 * ============================================================
 * PHASE 2 GATE
 * ============================================================
 *
 * This is the formal acceptance gate before enabling automatic
 * OTA/iCal synchronization.
 *
 * PASS CONDITIONS:
 *
 * 1. Phase 1 acceptance tests pass
 * 2. Phase 2 acceptance tests pass
 * 3. Integrity errors == 0
 *
 * Integrity warnings are allowed.
 *
 * Existing reservation/external-calendar overlaps are expected
 * to remain warnings because the same OTA booking can exist in
 * both internal reservations and imported iCal events.
 *
 * ============================================================
 */

function runPhase2Gate() {

  const startedAt =
    new Date();


  Logger.log(
    '=============================================='
  );

  Logger.log(
    'PHASE 2 GATE START'
  );

  Logger.log(
    '=============================================='
  );


  const phase1 =
    runPhase1AcceptanceTests();


  const phase2 =
    runPhase2AcceptanceTests();


  const integrity =
    IntegrityCheckService
      .runAll();


  const passed =
    (
      phase1.passed &&
      phase2.passed &&
      integrity.summary.errors === 0
    );


  const finishedAt =
    new Date();


  const result = {

    phase:
      'PHASE_2',

    passed:
      passed,

    phase1: {

      passed:
        phase1.passed,

      total:
        phase1.total,

      passed_count:
        phase1.passed_count,

      failed_count:
        phase1.failed_count

    },

    phase2: {

      passed:
        phase2.passed,

      total:
        phase2.total,

      passed_count:
        phase2.passed_count,

      failed_count:
        phase2.failed_count

    },

    integrity: {

      passed:
        integrity.passed,

      errors:
        integrity.summary.errors,

      warnings:
        integrity.summary.warnings,

      infos:
        integrity.summary.infos

    },

    duration_ms:
      finishedAt.getTime() -
      startedAt.getTime()

  };


  Logger.log(
    '=============================================='
  );

  Logger.log(
    'PHASE 2 GATE RESULT'
  );

  Logger.log(
    '=============================================='
  );


  Logger.log(
    'PASSED: ' +
      result.passed
  );


  Logger.log(
    'PHASE 1 TESTS: ' +
      result.phase1.passed_count +
      '/' +
      result.phase1.total
  );


  Logger.log(
    'PHASE 2 TESTS: ' +
      result.phase2.passed_count +
      '/' +
      result.phase2.total
  );


  Logger.log(
    'INTEGRITY ERRORS: ' +
      result.integrity.errors
  );


  Logger.log(
    'INTEGRITY WARNINGS: ' +
      result.integrity.warnings
  );


  Logger.log(
    'DURATION: ' +
      result.duration_ms +
      ' ms'
  );


  Logger.log(
    '----------------------------------------------'
  );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  Logger.log(
    '=============================================='
  );


  return result;

}


/**
 * ============================================================
 * CONVENIENCE FUNCTIONS
 * ============================================================
 */


/**
 * Full integrity check wrapper.
 */
function runFullIntegrityCheck() {

  const report =
    IntegrityCheckService
      .runAll();


  IntegrityCheckService
    .printReport(
      report
    );


  Logger.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );


  return report;

}


/**
 * Show ID sequence state.
 */
function testIdSequences() {

  const statuses =
    IdService
      .getAllSequenceStatuses();


  Logger.log(
    JSON.stringify(
      statuses,
      null,
      2
    )
  );


  return statuses;

}


/**
 * Synchronize ID sequences if needed.
 */
function synchronizeIdSequences() {

  const result =
    IdService
      .synchronizeAllSequences();


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/**
 * Initialize all configured ID sequences.
 */
function initializeAllIdSequences() {

  const result =
    IdService
      .initializeAll();


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/**
 * Quick availability diagnostic.
 *
 * Edit values only when manually testing.
 */
function testAvailabilityExample() {

  const unitId =
    'UNIT-000001';


  const startDate =
    '2026-10-01';


  const endDate =
    '2026-10-10';


  const result =
    AvailabilityService
      .checkAvailability(
        unitId,
        startDate,
        endDate
      );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/**
 * Quick OTA block workflow diagnostic.
 */
function testOTABlockStatusSummary() {

  const result =
    AvailabilityService
      .getOTABlockStatusSummary();


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/**
 * Quick calendar conflict diagnostic.
 */
function testCalendarConflicts() {

  const result = {

    internal_reservation_conflicts:
      AvailabilityService
        .findReservationConflicts(),

    reservation_external_conflicts:
      AvailabilityService
        .findReservationExternalConflicts()

  };


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


function diagnosePhase2PublicAPIs() {

  const result = {

    ExternalCalendarService:
      Object.keys(
        ExternalCalendarService
      ).sort(),

    ICalService:
      Object.keys(
        ICalService
      ).sort(),

    AvailabilityService:
      Object.keys(
        AvailabilityService
      ).sort(),

    CalendarSyncService:
      Object.keys(
        CalendarSyncService
      ).sort(),

    IntegrityCheckService:
      Object.keys(
        IntegrityCheckService
      ).sort()

  };


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}

/**
 * ============================================================
 * 99_Tests.gs
 
 * ============================================================
 */


/**
 * ------------------------------------------------------------
 * PHASE 3 TEST UTILITIES
 * ------------------------------------------------------------
 */

function phase3Assert(condition, message) {

  if (!condition) {
    throw new Error(
      message || 'Assertion failed.'
    );
  }

}


function phase3AssertEquals(
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
        message ||
        'Values are not equal.'
      ) +
      ' Expected=[' +
      expected +
      '] Actual=[' +
      actual +
      ']'
    );

  }

}


function phase3AssertFunction(
  object,
  functionName,
  serviceName
) {

  phase3Assert(
    object &&
    typeof object[functionName] ===
      'function',

    (
      serviceName +
      '.' +
      functionName +
      '() is missing.'
    )
  );

}


function phase3Normalize(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value)
    .trim()
    .toUpperCase();

}


/**
 * ------------------------------------------------------------
 * API CONTRACT TESTS
 * ------------------------------------------------------------
 */

function testPhase3ReservationServiceAPI() {

  const required = [

    'createReservation',

    'getAll',

    'getById',

    'exists',

    'requireReservation',

    'updateReservation',

    'changeStatus',

    'confirmReservation',

    'checkInReservation',

    'completeReservation',

    'cancelReservation',

    'markNoShow',

    'isBlockingStatus',

    'isTerminalStatus',

    'assertAvailable'

  ];


  required.forEach(
    functionName => {

      phase3AssertFunction(
        ReservationService,
        functionName,
        'ReservationService'
      );

    }
  );


  return {
    service:
      'ReservationService',

    functions_checked:
      required.length
  };

}


/**
 * ------------------------------------------------------------
 * RESERVATION GUEST API
 * ------------------------------------------------------------
 */

function testPhase3ReservationGuestServiceAPI() {

  const required = [

    'assignGuest',

    'changeRole',

    'setPrimaryGuest',

    'removeGuest',

    'getAll',

    'getById',

    'exists',

    'requireAssignment',

    'getByReservation',

    'getByGuest',

    'findAssignment',

    'relationshipExists',

    'getPrimaryGuestAssignment',

    'getPrimaryGuest',

    'getReservationGuests',

    'getGuestReservations',

    'countGuests',

    'validateRole',

    'findOrphanReservationLinks',

    'findOrphanGuestLinks',

    'findDuplicateAssignments',

    'findInvalidRoles',

    'findReservationsWithMultiplePrimaryGuests',

    'findReservationsWithoutPrimaryGuest'

  ];


  required.forEach(
    functionName => {

      phase3AssertFunction(
        ReservationGuestService,
        functionName,
        'ReservationGuestService'
      );

    }
  );


  return {
    service:
      'ReservationGuestService',

    functions_checked:
      required.length
  };

}


/**
 * ------------------------------------------------------------
 * OTA BLOCK API
 * ------------------------------------------------------------
 */

function testPhase3OTABlockServiceAPI() {

  const required = [

    'createBlock',

    'createForReservation',

    'createForReservationSources',

    'updateBlock',

    'changeStatus',

    'markBlocked',

    'cancelBlock',

    'cancelForReservation',

    'getAll',

    'getById',

    'exists',

    'requireBlock',

    'getByUnit',

    'getByReservation',

    'getByStatus',

    'getBySource',

    'getPendingBlocks',

    'getBlockedBlocks',

    'getCancelledBlocks',

    'getOutstandingWork',

    'getOutstandingCount',

    'getConflictingBlocks',

    'getStatusSummary',

    'isBlockingStatus',

    'validateStatus',

    'validateBlock',

    'getAllowedTransitions',

    'assertTransition',

    'findExistingBlockingBlock',

    'findOrphanBlocks',

    'findInvalidStatuses',

    'findInvalidDateRanges',

    'findOrphanReservationLinks',

    'findDuplicateBlockingBlocks'

  ];


  required.forEach(
    functionName => {

      phase3AssertFunction(
        OTABlockService,
        functionName,
        'OTABlockService'
      );

    }
  );


  return {
    service:
      'OTABlockService',

    functions_checked:
      required.length
  };

}


/**
 * ------------------------------------------------------------
 * WORKFLOW API
 * ------------------------------------------------------------
 */

function testPhase3WorkflowServiceAPI() {

  const required = [

    'createReservation',

    'createDirectReservation',

    'cancelReservation',

    'confirmReservation',

    'checkIn',

    'completeStay',

    'markNoShow',

    'getReservationWorkflow',

    'validateCreateRequest',

    'normalizeOTASources'

  ];


  required.forEach(
    functionName => {

      phase3AssertFunction(
        ReservationWorkflowService,
        functionName,
        'ReservationWorkflowService'
      );

    }
  );


  return {
    service:
      'ReservationWorkflowService',

    functions_checked:
      required.length
  };

}


/**
 * ------------------------------------------------------------
 * RESERVATION GUEST DATA MODEL TEST
 * ------------------------------------------------------------
 */

function testPhase3ReservationGuestIntegrity() {

  const rows =
    ReservationGuestService.getAll();


  rows.forEach(row => {

    phase3Assert(
      row.reservation_guest_id,
      'ReservationGuest missing reservation_guest_id.'
    );


    phase3Assert(
      row.reservation_id,
      (
        row.reservation_guest_id +
        ' missing reservation_id.'
      )
    );


    phase3Assert(
      row.guest_id,
      (
        row.reservation_guest_id +
        ' missing guest_id.'
      )
    );


    phase3Assert(
      row.role,
      (
        row.reservation_guest_id +
        ' missing role.'
      )
    );


    ReservationGuestService
      .validateRole(
        row.role
      );

  });


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findOrphanReservationLinks()
      .length,

    'Orphan reservation guest reservation links detected.'
  );


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findOrphanGuestLinks()
      .length,

    'Orphan guest links detected.'
  );


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findDuplicateAssignments()
      .length,

    'Duplicate reservation/guest assignments detected.'
  );


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findInvalidRoles()
      .length,

    'Invalid reservation guest roles detected.'
  );


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findReservationsWithMultiplePrimaryGuests()
      .length,

    'Reservations with multiple PRIMARY guests detected.'
  );


  phase3AssertEquals(
    0,

    ReservationGuestService
      .findReservationsWithoutPrimaryGuest()
      .length,

    'Reservations with guests but no PRIMARY guest detected.'
  );


  return {
    relationships_checked:
      rows.length
  };

}


/**
 * ------------------------------------------------------------
 * OTA BLOCK DATA MODEL TEST
 * ------------------------------------------------------------
 */

function testPhase3OTABlockIntegrity() {

  const blocks =
    OTABlockService.getAll();


  blocks.forEach(block => {

    phase3Assert(
      block.ota_block_id,
      'OTA block missing ota_block_id.'
    );


    phase3Assert(
      block.unit_id,
      (
        block.ota_block_id +
        ' missing unit_id.'
      )
    );


    phase3Assert(
      block.source,
      (
        block.ota_block_id +
        ' missing source.'
      )
    );


    OTABlockService
      .validateStatus(
        block.status
      );

  });


  phase3AssertEquals(
    0,

    OTABlockService
      .findInvalidStatuses()
      .length,

    'Invalid OTA block statuses detected.'
  );


  phase3AssertEquals(
    0,

    OTABlockService
      .findInvalidDateRanges()
      .length,

    'Invalid OTA block date ranges detected.'
  );


  phase3AssertEquals(
    0,

    OTABlockService
      .findOrphanReservationLinks()
      .length,

    'Orphan OTA block reservation links detected.'
  );


  phase3AssertEquals(
    0,

    OTABlockService
      .findDuplicateBlockingBlocks()
      .length,

    'Duplicate blocking OTA records detected.'
  );


  return {
    blocks_checked:
      blocks.length
  };

}


/**
 * ------------------------------------------------------------
 * RESERVATION LIFECYCLE RULE TEST
 * ------------------------------------------------------------
 *
 * Non-destructive.
 * ------------------------------------------------------------
 */

function testPhase3ReservationLifecycleRules() {

  phase3Assert(
    ReservationService
      .isBlockingStatus(
        'PENDING'
      ),

    'PENDING should block inventory.'
  );


  phase3Assert(
    ReservationService
      .isBlockingStatus(
        'CONFIRMED'
      ),

    'CONFIRMED should block inventory.'
  );


  phase3Assert(
    ReservationService
      .isBlockingStatus(
        'CHECKED_IN'
      ),

    'CHECKED_IN should block inventory.'
  );


  phase3Assert(
    !ReservationService
      .isBlockingStatus(
        'COMPLETED'
      ),

    'COMPLETED should not block inventory.'
  );


  phase3Assert(
    !ReservationService
      .isBlockingStatus(
        'CANCELLED'
      ),

    'CANCELLED should not block inventory.'
  );


  phase3Assert(
    !ReservationService
      .isBlockingStatus(
        'NO_SHOW'
      ),

    'NO_SHOW should not block inventory.'
  );


  phase3Assert(
    ReservationService
      .isTerminalStatus(
        'COMPLETED'
      ),

    'COMPLETED should be terminal.'
  );


  phase3Assert(
    ReservationService
      .isTerminalStatus(
        'CANCELLED'
      ),

    'CANCELLED should be terminal.'
  );


  phase3Assert(
    ReservationService
      .isTerminalStatus(
        'NO_SHOW'
      ),

    'NO_SHOW should be terminal.'
  );


  return {
    lifecycle_rules:
      'VALID'
  };

}


/**
 * ------------------------------------------------------------
 * OTA BLOCK LIFECYCLE RULE TEST
 * ------------------------------------------------------------
 */

function testPhase3OTABlockLifecycleRules() {

  phase3Assert(
    OTABlockService
      .isBlockingStatus(
        'PENDING'
      ),

    'OTA PENDING should block internal availability.'
  );


  phase3Assert(
    OTABlockService
      .isBlockingStatus(
        'BLOCKED'
      ),

    'OTA BLOCKED should block internal availability.'
  );


  phase3Assert(
    !OTABlockService
      .isBlockingStatus(
        'CANCELLED'
      ),

    'OTA CANCELLED should not block internal availability.'
  );


  return {
    ota_lifecycle_rules:
      'VALID'
  };

}


/**
 * ------------------------------------------------------------
 * FIND SAFE TEST CANDIDATE
 * ------------------------------------------------------------
 *
 * Attempts to locate:
 *
 * - ACTIVE unit
 * - operational status READY
 * - available date window
 * - existing customer
 * - existing guest
 *
 * The test uses dates sufficiently in the future.
 * ------------------------------------------------------------
 */

function findPhase3WorkflowTestCandidate() {

  const units =
    BaseRepository.findAll(
      CONFIG.SHEETS.UNITS
    );


  const customers =
    BaseRepository.findAll(
      CONFIG.SHEETS.CUSTOMERS
    );


  const guests =
    BaseRepository.findAll(
      CONFIG.SHEETS.GUESTS
    );


  phase3Assert(
    customers.length > 0,
    'Phase 3 workflow test requires at least one customer.'
  );


  phase3Assert(
    guests.length > 0,
    'Phase 3 workflow test requires at least one guest.'
  );


  /*
   * Use a distant future window to minimize collision
   * with real operational bookings.
   */

  const today =
    new Date();


  const start =
    new Date(
      today.getFullYear() + 2,
      today.getMonth(),
      10
    );


  const end =
    new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 3
    );


  const startDate =
    Utilities.formatDate(
      start,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );


  const endDate =
    Utilities.formatDate(
      end,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );


  for (
    let i = 0;
    i < units.length;
    i++
  ) {

    const unit =
      units[i];


    if (
      phase3Normalize(
        unit.status
      ) !==
      'ACTIVE'
    ) {

      continue;

    }


    const operational =
      OperationalStatusService
        .getStatus(
          unit.unit_id
        );


    if (
      !operational ||
      phase3Normalize(
        operational
          .operational_status
      ) !==
      'READY'
    ) {

      continue;

    }


    const result =
      AvailabilityService
        .checkAvailability(
          unit.unit_id,
          startDate,
          endDate
        );


    if (
      result &&
      result.available === true
    ) {

      return {

        unit:
          unit,

        customer:
          customers[0],

        guest:
          guests[0],

        start_date:
          startDate,

        end_date:
          endDate

      };

    }

  }


  throw new Error(
    'No ACTIVE + READY + available unit could be found for the Phase 3 workflow test.'
  );

}


/**
 * ------------------------------------------------------------
 * END-TO-END DIRECT BOOKING WORKFLOW TEST
 * ------------------------------------------------------------
 *
 * This test DOES create records.
 *
 * Final state:
 *
 * Reservation -> CANCELLED
 * OTA blocks   -> CANCELLED
 *
 * Historical records and audit trail remain intentionally.
 * ------------------------------------------------------------
 */

function testPhase3DirectBookingWorkflow() {

  const candidate =
    findPhase3WorkflowTestCandidate();


  const actorId =
    CONFIG.DEFAULTS.ACTOR_ID;


  const result =
    ReservationWorkflowService
      .createDirectReservation(
        {

          unit_id:
            candidate.unit.unit_id,

          customer_id:
            candidate.customer
              .customer_id,

          check_in_date:
            candidate.start_date,

          check_out_date:
            candidate.end_date,

          status:
            'PENDING'

        },

        [

          {
            guest_id:
              candidate.guest
                .guest_id,

            role:
              'PRIMARY'
          }

        ],

        [
          'AIRBNB',
          'BOOKING_COM'
        ],

        actorId
      );


  phase3Assert(
    result &&
    result.reservation,

    'Workflow did not return reservation.'
  );


  const reservation =
    result.reservation;


  Logger.log(
    'Phase 3 test reservation: ' +
      reservation.reservation_id
  );


  /*
   * Reservation persisted.
   */

  phase3Assert(
    ReservationService.exists(
      reservation.reservation_id
    ),

    'Created reservation was not persisted.'
  );


  /*
   * Guest relationship.
   */

  const assignments =
    ReservationGuestService
      .getByReservation(
        reservation.reservation_id
      );


  phase3AssertEquals(
    1,
    assignments.length,
    'Expected one guest assignment.'
  );


  phase3AssertEquals(
    'PRIMARY',
    phase3Normalize(
      assignments[0].role
    ),
    'Guest should be PRIMARY.'
  );


  /*
   * OTA blocks.
   */

  const blocks =
    OTABlockService
      .getByReservation(
        reservation.reservation_id
      );


  phase3AssertEquals(
    2,
    blocks.length,
    'DIRECT booking should have two OTA block requests.'
  );


  blocks.forEach(block => {

    phase3AssertEquals(
      'PENDING',
      phase3Normalize(
        block.status
      ),
      'New OTA block should be PENDING.'
    );

  });


  /*
   * Reservation must now make dates unavailable.
   */

  const unavailable =
    AvailabilityService
      .checkAvailability(
        reservation.unit_id,
        reservation.check_in_date,
        reservation.check_out_date
      );


  phase3Assert(
    unavailable.available === false,
    'Created reservation should block availability.'
  );


  /*
   * Simulate admin successfully blocking one OTA.
   */

  const blocked =
    OTABlockService
      .markBlocked(
        blocks[0].ota_block_id,
        actorId
      );


  phase3AssertEquals(
    'BLOCKED',
    phase3Normalize(
      blocked.status
    ),
    'OTA block should transition to BLOCKED.'
  );


  /*
   * Cancel reservation through workflow.
   */

  const cancellation =
    ReservationWorkflowService
      .cancelReservation(
        reservation.reservation_id,
        actorId,
        'Automated Phase 3 acceptance test.'
      );


  phase3AssertEquals(
    'CANCELLED',
    phase3Normalize(
      cancellation
        .reservation
        .status
    ),
    'Reservation should be CANCELLED.'
  );


  /*
   * All linked OTA blocks must now be CANCELLED.
   */

  const finalBlocks =
    OTABlockService
      .getByReservation(
        reservation.reservation_id
      );


  phase3AssertEquals(
    2,
    finalBlocks.length,
    'Expected two linked OTA blocks after cancellation.'
  );


  finalBlocks.forEach(block => {

    phase3AssertEquals(
      'CANCELLED',
      phase3Normalize(
        block.status
      ),
      'OTA block should be CANCELLED after reservation cancellation.'
    );

  });


  /*
   * Dates should become available again provided there are
   * no unrelated calendar conflicts.
   */

  const afterCancellation =
    AvailabilityService
      .checkAvailability(
        reservation.unit_id,
        reservation.check_in_date,
        reservation.check_out_date
      );


  phase3Assert(
    afterCancellation.available === true,
    (
      'Dates should become available after cancellation. ' +
      'Reasons: ' +
      JSON.stringify(
        afterCancellation.reasons || []
      )
    )
  );


  return {

    reservation_id:
      reservation.reservation_id,

    reservation_status:
      cancellation
        .reservation
        .status,

    reservation_guest_count:
      assignments.length,

    ota_blocks:
      finalBlocks.map(
        block => ({
          ota_block_id:
            block.ota_block_id,

          source:
            block.source,

          status:
            block.status
        })
      ),

    availability_after_cancellation:
      afterCancellation.available

  };

}


/**
 * ------------------------------------------------------------
 * PHASE 3 INTEGRITY TEST
 * ------------------------------------------------------------
 */

function testPhase3FinalIntegrity() {

  const report =
    IntegrityCheckService.runAll();


  phase3AssertEquals(
    0,
    report.errors,
    (
      'Phase 3 final integrity check has errors: ' +
      JSON.stringify(
        report.findings.filter(
          finding =>
            finding.severity ===
            'ERROR'
        )
      )
    )
  );


  return {

    passed:
      report.passed,

    errors:
      report.errors,

    warnings:
      report.warnings,

    infos:
      report.infos

  };

}


/**
 * ------------------------------------------------------------
 * PHASE 3 API GATE
 * ------------------------------------------------------------
 *
 * NON-DESTRUCTIVE.
 *
 * Run this FIRST.
 * ------------------------------------------------------------
 */

function runPhase3ApiGate() {

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'PHASE 3 API GATE'
  );

  Logger.log(
    '============================================================'
  );


  const tests = [

    {
      name:
        'ReservationService API',

      fn:
        testPhase3ReservationServiceAPI
    },

    {
      name:
        'ReservationGuestService API',

      fn:
        testPhase3ReservationGuestServiceAPI
    },

    {
      name:
        'OTABlockService API',

      fn:
        testPhase3OTABlockServiceAPI
    },

    {
      name:
        'ReservationWorkflowService API',

      fn:
        testPhase3WorkflowServiceAPI
    },

    {
      name:
        'Reservation lifecycle rules',

      fn:
        testPhase3ReservationLifecycleRules
    },

    {
      name:
        'OTA block lifecycle rules',

      fn:
        testPhase3OTABlockLifecycleRules
    },

    {
      name:
        'ReservationGuest integrity',

      fn:
        testPhase3ReservationGuestIntegrity
    },

    {
      name:
        'OTA block integrity',

      fn:
        testPhase3OTABlockIntegrity
    },

    {
      name:
        'Current database integrity',

      fn:
        testPhase3FinalIntegrity
    }

  ];


  const results =
    [];


  let passed = 0;
  let failed = 0;


  tests.forEach(test => {

    try {

      const detail =
        test.fn();


      passed++;


      results.push({

        test:
          test.name,

        status:
          'PASSED',

        detail:
          detail

      });


      Logger.log(
        'PASSED: ' +
          test.name
      );

    } catch (err) {

      failed++;


      results.push({

        test:
          test.name,

        status:
          'FAILED',

        error:
          err.message

      });


      Logger.log(
        'FAILED: ' +
          test.name +
          ' -> ' +
          err.message
      );

    }

  });


  Logger.log(
    '------------------------------------------------------------'
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
    '============================================================'
  );


  return {

    passed:
      failed === 0,

    passed_tests:
      passed,

    failed_tests:
      failed,

    results:
      results

  };

}


/**
 * ------------------------------------------------------------
 * PHASE 3 FULL ACCEPTANCE GATE
 * ------------------------------------------------------------
 *
 * RUN ONLY AFTER runPhase3ApiGate() PASSES.
 *
 * This performs the end-to-end write test.
 * ------------------------------------------------------------
 */

function runPhase3Gate() {

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'PHASE 3 ACCEPTANCE GATE'
  );

  Logger.log(
    '============================================================'
  );


  /*
   * First ensure API/data baseline is healthy.
   */

  const apiGate =
    runPhase3ApiGate();


  if (
    !apiGate.passed
  ) {

    throw new Error(
      'Phase 3 API gate failed. ' +
      'End-to-end workflow test was NOT executed.'
    );

  }


  let workflowResult;


  try {

    workflowResult =
      testPhase3DirectBookingWorkflow();


    Logger.log(
      'PASSED: Direct booking workflow'
    );

  } catch (err) {

    Logger.log(
      'FAILED: Direct booking workflow -> ' +
        err.message
    );


    throw err;

  }


  /*
   * Run integrity again AFTER writes.
   */

  const integrity =
    IntegrityCheckService.runAll();


  IntegrityCheckService
    .printReport(
      integrity
    );


  if (
    integrity.errors > 0
  ) {

    throw new Error(
      'Phase 3 workflow completed but final integrity check contains ' +
        integrity.errors +
        ' error(s).'
    );

  }


  Logger.log(
    '============================================================'
  );

  Logger.log(
    'PHASE 3 GATE PASSED'
  );

  Logger.log(
    '============================================================'
  );


  return {

    passed:
      true,

    api_gate:
      apiGate,

    workflow:
      workflowResult,

    integrity: {

      errors:
        integrity.errors,

      warnings:
        integrity.warnings,

      infos:
        integrity.infos

    }

  };

}



/**
 * ============================================================
 * PHASE 4 - HOUSEKEEPING SERVICE TEST
 * ============================================================
 */

function testPhase4HousekeepingService() {

  Logger.log(
    '===== TEST PHASE 4 HOUSEKEEPING SERVICE ====='
  );

  const actorId = 'SYSTEM_TEST';


  /**
   * ----------------------------------------------------------
   * FIND ACTIVE UNIT
   * ----------------------------------------------------------
   */

  const units =
    BaseRepository.findAll(
      CONFIG.SHEETS.UNITS
    );

  const unit =
    units.find(
      row =>
        String(row.status || '')
          .trim()
          .toUpperCase() === 'ACTIVE'
    );


  if (!unit) {
    throw new Error(
      'No ACTIVE unit available for housekeeping test.'
    );
  }


  Logger.log(
    'Using unit: ' +
    unit.unit_id
  );


  /**
   * ----------------------------------------------------------
   * FIND HOUSEKEEPER / SUPERVISOR
   * ----------------------------------------------------------
   */

  const staff = StaffService.getActiveStaff();


 const housekeeper =
  staff.find(row => {

    const role =
      String(row.role || '')
        .trim()
        .toUpperCase();


    return (
      role === 'HOUSEKEEPER' ||
      role === 'SUPERVISOR'
    );

  });


  if (!housekeeper) {
    throw new Error(
      'No ACTIVE HOUSEKEEPER or SUPERVISOR available.'
    );
  }


  Logger.log(
    'Using staff: ' +
    housekeeper.staff_id
  );


  /**
   * ----------------------------------------------------------
   * FUTURE TEST DATE
   * ----------------------------------------------------------
   *
   * Use a distant future date to reduce the chance
   * of colliding with real housekeeping work.
   */
/*
  const futureDate =
    new Date();

  futureDate.setFullYear(
    futureDate.getFullYear() + 3
  );


  const scheduledDate =
    Utilities.formatDate(
      futureDate,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );
*/
/**
 * ----------------------------------------------------------
 * FIND SAFE FUTURE TEST DATE
 * ----------------------------------------------------------
 */

let scheduledDate = null;

const baseDate =
  new Date();

baseDate.setFullYear(
  baseDate.getFullYear() + 3
);


/*
 * Search up to 30 days for a date that does not already
 * contain an active DEEP_CLEAN test task for this unit.
 */

for (
  let offset = 0;
  offset < 30;
  offset++
) {

  const candidateDate =
    new Date(
      baseDate.getTime()
    );

  candidateDate.setDate(
    candidateDate.getDate() +
    offset
  );


  const candidateDateText =
    Utilities.formatDate(
      candidateDate,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );


  const duplicate =
    HousekeepingService
      .findDuplicateActiveTask(
        {
          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          scheduled_date:
            candidateDateText
        }
      );


  if (!duplicate) {

    scheduledDate =
      candidateDateText;

    break;

  }

}


if (!scheduledDate) {

  throw new Error(
    'Unable to find free housekeeping test date.'
  );

}


Logger.log(
  'Using test date: ' +
  scheduledDate
);
  /**
   * ----------------------------------------------------------
   * CREATE TASK
   * ----------------------------------------------------------
   */

  const task =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          scheduledDate,

        scheduled_start:
          '10:00',

        scheduled_end:
          '13:00',

        assigned_to:
          '',

        inspection_required:
          true,

        notes:
          'Phase 4 housekeeping service test'

      },

      actorId
    );


  if (!task) {
    throw new Error(
      'createTask returned no task.'
    );
  }


  if (!task.task_id) {
    throw new Error(
      'Created housekeeping task has no task_id.'
    );
  }


  Logger.log(
    'Created task: ' +
    task.task_id
  );


  /**
   * Expected:
   *
   * status = PENDING
   */

  if (
    String(task.status)
      .toUpperCase() !==
      'PENDING'
  ) {

    throw new Error(
      'Expected new task status PENDING. Actual=' +
      task.status
    );

  }


  /**
   * ----------------------------------------------------------
   * VERIFY READ
   * ----------------------------------------------------------
   */

  const loaded =
    HousekeepingService.getById(
      task.task_id
    );


  if (!loaded) {
    throw new Error(
      'Unable to retrieve created housekeeping task.'
    );
  }


  Logger.log(
    'Read task successfully.'
  );


  /**
   * ----------------------------------------------------------
   * ASSIGN
   * ----------------------------------------------------------
   */

  const assigned =
    HousekeepingService.assignTask(
      task.task_id,
      housekeeper.staff_id,
      actorId
    );


  if (
    String(assigned.status)
      .toUpperCase() !==
      'ASSIGNED'
  ) {

    throw new Error(
      'Expected ASSIGNED. Actual=' +
      assigned.status
    );

  }


  if (
    assigned.assigned_to !==
      housekeeper.staff_id
  ) {

    throw new Error(
      'assigned_to was not stored correctly.'
    );

  }


  Logger.log(
    'Assignment passed.'
  );


  /**
   * ----------------------------------------------------------
   * START
   * ----------------------------------------------------------
   */

  const started =
    HousekeepingService.startTask(
      task.task_id,
      actorId
    );


  if (
    String(started.status)
      .toUpperCase() !==
      'IN_PROGRESS'
  ) {

    throw new Error(
      'Expected IN_PROGRESS. Actual=' +
      started.status
    );

  }


  if (!started.started_at) {

    throw new Error(
      'started_at was not populated.'
    );

  }


  Logger.log(
    'Start passed.'
  );


  /**
   * ----------------------------------------------------------
   * COMPLETE
   * ----------------------------------------------------------
   */

  const completed =
    HousekeepingService.completeTask(
      task.task_id,
      actorId,
      'Phase 4 housekeeping test completed'
    );


  if (
    String(completed.status)
      .toUpperCase() !==
      'COMPLETED'
  ) {

    throw new Error(
      'Expected COMPLETED. Actual=' +
      completed.status
    );

  }


  if (!completed.completed_at) {

    throw new Error(
      'completed_at was not populated.'
    );

  }


  Logger.log(
    'Completion passed.'
  );


  /**
   * ----------------------------------------------------------
   * VERIFY INSPECTION REQUIREMENT
   * ----------------------------------------------------------
   */

  const finalTask =
    HousekeepingService.getById(
      task.task_id
    );


  const inspectionRequired =
    String(
      finalTask.inspection_required
    )
    .toUpperCase();


  if (
    inspectionRequired !== 'TRUE' &&
    inspectionRequired !== 'YES' &&
    inspectionRequired !== '1'
  ) {

    throw new Error(
      'inspection_required was not preserved.'
    );

  }


  Logger.log(
    'Inspection requirement passed.'
  );


  /**
   * ----------------------------------------------------------
   * FINAL RESULT
   * ----------------------------------------------------------
   */

  Logger.log(
    'Housekeeping lifecycle:'
  );

  Logger.log(
    'PENDING -> ASSIGNED -> IN_PROGRESS -> COMPLETED'
  );

  Logger.log(
    'TASK=' +
    task.task_id
  );

  Logger.log(
    '===== HOUSEKEEPING SERVICE TEST PASSED ====='
  );


  return {
    passed: true,
    task_id: task.task_id,
    unit_id: unit.unit_id,
    staff_id: housekeeper.staff_id
  };

}


/**
 * ============================================================
 * PHASE 4 - HOUSEKEEPING NEGATIVE / VALIDATION TESTS
 * ============================================================
 *
 * Expected behaviour:
 *
 * Invalid operations MUST throw an error.
 *
 * Tests:
 *
 * 1. Invalid unit
 * 2. Invalid task type
 * 3. Invalid priority
 * 4. Invalid assigned staff
 * 5. Invalid staff role
 * 6. Invalid scheduled time range
 * 7. Duplicate active task
 * 8. Start PENDING task
 * 9. Complete ASSIGNED task
 * 10. Cancel COMPLETED task
 *
 * ============================================================
 */

function testPhase4HousekeepingValidation() {

  Logger.log(
    '===== TEST HOUSEKEEPING VALIDATION ====='
  );


  const actorId =
    'SYSTEM_TEST';


  let passed = 0;
  let failed = 0;


  /**
   * ----------------------------------------------------------
   * ASSERT REJECTED
   * ----------------------------------------------------------
   */

  function expectRejected(
    testName,
    callback
  ) {

    try {

      callback();


      Logger.log(
        '❌ FAILED: ' +
        testName +
        ' - operation was accepted'
      );


      failed++;


    } catch (error) {


      Logger.log(
        '✅ PASSED: ' +
        testName
      );


      Logger.log(
        '   Rejected with: ' +
        error.message
      );


      passed++;

    }

  }


  /**
   * ----------------------------------------------------------
   * FIND ACTIVE UNIT
   * ----------------------------------------------------------
   */

  const units =
    BaseRepository.findAll(
      CONFIG.SHEETS.UNITS
    );


  const unit =
    units.find(
      row =>
        String(
          row.status || ''
        )
          .trim()
          .toUpperCase() ===
        'ACTIVE'
    );


  if (!unit) {

    throw new Error(
      'No ACTIVE unit available for housekeeping validation tests.'
    );

  }


  Logger.log(
    'Using unit: ' +
    unit.unit_id
  );


  /**
   * ----------------------------------------------------------
   * FIND ACTIVE HOUSEKEEPER
   * ----------------------------------------------------------
   */

  const housekeepers =
    StaffService
      .getActiveStaffByRole(
        'HOUSEKEEPER'
      );


  const supervisors =
    StaffService
      .getActiveStaffByRole(
        'SUPERVISOR'
      );


  const housekeeper =
    housekeepers[0] ||
    supervisors[0];


  if (!housekeeper) {

    throw new Error(
      'No ACTIVE HOUSEKEEPER or SUPERVISOR available.'
    );

  }


  Logger.log(
    'Using housekeeping staff: ' +
    housekeeper.staff_id
  );


  /**
   * ----------------------------------------------------------
   * FIND NON-HOUSEKEEPING STAFF
   * ----------------------------------------------------------
   */

  const allActiveStaff =
    StaffService.getActiveStaff();


  const invalidRoleStaff =
    allActiveStaff.find(
      staff => {

        const role =
          String(
            staff.role || ''
          )
            .trim()
            .toUpperCase();


        return (
          role !== 'HOUSEKEEPER' &&
          role !== 'SUPERVISOR'
        );

      }
    );


  /**
   * ----------------------------------------------------------
   * SAFE TEST DATE GENERATOR
   * ----------------------------------------------------------
   */

  let dateOffset = 0;


  function nextTestDate() {

    const date =
      new Date();


    date.setFullYear(
      date.getFullYear() + 4
    );


    date.setDate(
      date.getDate() +
      dateOffset
    );


    dateOffset++;


    return Utilities.formatDate(
      date,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );

  }


  /**
   * ==========================================================
   * TEST 1
   * INVALID UNIT
   * ==========================================================
   */

  expectRejected(
    'Invalid unit rejected',
    () => {

      HousekeepingService.createTask(
        {

          unit_id:
            'UNIT-999999',

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          priority:
            'NORMAL',

          scheduled_date:
            nextTestDate(),

          inspection_required:
            true

        },

        actorId
      );

    }
  );


  /**
   * ==========================================================
   * TEST 2
   * INVALID TASK TYPE
   * ==========================================================
   */

  expectRejected(
    'Invalid task type rejected',
    () => {

      HousekeepingService.createTask(
        {

          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'INVALID_TASK_TYPE',

          priority:
            'NORMAL',

          scheduled_date:
            nextTestDate(),

          inspection_required:
            true

        },

        actorId
      );

    }
  );


  /**
   * ==========================================================
   * TEST 3
   * INVALID PRIORITY
   * ==========================================================
   */

  expectRejected(
    'Invalid priority rejected',
    () => {

      HousekeepingService.createTask(
        {

          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          priority:
            'SUPER_HIGH',

          scheduled_date:
            nextTestDate(),

          inspection_required:
            true

        },

        actorId
      );

    }
  );


  /**
   * ==========================================================
   * TEST 4
   * INVALID STAFF ID
   * ==========================================================
   */

  const invalidStaffTask =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          nextTestDate(),

        inspection_required:
          true

      },

      actorId
    );


  expectRejected(
    'Invalid staff ID rejected',
    () => {

      HousekeepingService.assignTask(
        invalidStaffTask.task_id,
        'STF-999999',
        actorId
      );

    }
  );


  /*
   * Clean up the valid test task logically.
   */

  HousekeepingService.cancelTask(
    invalidStaffTask.task_id,
    actorId,
    'Validation test cleanup'
  );


  /**
   * ==========================================================
   * TEST 5
   * INVALID STAFF ROLE
   * ==========================================================
   */

  if (invalidRoleStaff) {

    const invalidRoleTask =
      HousekeepingService.createTask(
        {

          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          priority:
            'NORMAL',

          scheduled_date:
            nextTestDate(),

          inspection_required:
            true

        },

        actorId
      );


    expectRejected(
      'Non-housekeeping staff rejected',
      () => {

        HousekeepingService.assignTask(
          invalidRoleTask.task_id,
          invalidRoleStaff.staff_id,
          actorId
        );

      }
    );


    HousekeepingService.cancelTask(
      invalidRoleTask.task_id,
      actorId,
      'Validation test cleanup'
    );


  } else {

    Logger.log(
      '⚠ SKIPPED: Non-housekeeping staff test - no suitable staff record.'
    );

  }


  /**
   * ==========================================================
   * TEST 6
   * INVALID TIME RANGE
   * ==========================================================
   */

  expectRejected(
    'Invalid scheduled time range rejected',
    () => {

      HousekeepingService.createTask(
        {

          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          priority:
            'NORMAL',

          scheduled_date:
            nextTestDate(),

          scheduled_start:
            '15:00',

          scheduled_end:
            '10:00',

          inspection_required:
            true

        },

        actorId
      );

    }
  );


  /**
   * ==========================================================
   * TEST 7
   * DUPLICATE ACTIVE TASK
   * ==========================================================
   */

  const duplicateDate =
    nextTestDate();


  const originalTask =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          duplicateDate,

        inspection_required:
          true

      },

      actorId
    );


  expectRejected(
    'Duplicate active task rejected',
    () => {

      HousekeepingService.createTask(
        {

          unit_id:
            unit.unit_id,

          reservation_id:
            '',

          task_type:
            'DEEP_CLEAN',

          priority:
            'NORMAL',

          scheduled_date:
            duplicateDate,

          inspection_required:
            true

        },

        actorId
      );

    }
  );


  HousekeepingService.cancelTask(
    originalTask.task_id,
    actorId,
    'Duplicate validation test cleanup'
  );


  /**
   * ==========================================================
   * TEST 8
   * START PENDING TASK
   * ==========================================================
   */

  const pendingTask =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          nextTestDate(),

        inspection_required:
          true

      },

      actorId
    );


  expectRejected(
    'Start PENDING task rejected',
    () => {

      HousekeepingService.startTask(
        pendingTask.task_id,
        actorId
      );

    }
  );


  HousekeepingService.cancelTask(
    pendingTask.task_id,
    actorId,
    'Transition validation cleanup'
  );


  /**
   * ==========================================================
   * TEST 9
   * COMPLETE ASSIGNED TASK
   * ==========================================================
   */

  const assignedTask =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          nextTestDate(),

        inspection_required:
          true

      },

      actorId
    );


  HousekeepingService.assignTask(
    assignedTask.task_id,
    housekeeper.staff_id,
    actorId
  );


  expectRejected(
    'Complete ASSIGNED task rejected',
    () => {

      HousekeepingService.completeTask(
        assignedTask.task_id,
        actorId,
        'Should not complete'
      );

    }
  );


  HousekeepingService.cancelTask(
    assignedTask.task_id,
    actorId,
    'Transition validation cleanup'
  );


  /**
   * ==========================================================
   * TEST 10
   * CANCEL COMPLETED TASK
   * ==========================================================
   */

  const completedTask =
    HousekeepingService.createTask(
      {

        unit_id:
          unit.unit_id,

        reservation_id:
          '',

        task_type:
          'DEEP_CLEAN',

        priority:
          'NORMAL',

        scheduled_date:
          nextTestDate(),

        inspection_required:
          true

      },

      actorId
    );


  HousekeepingService.assignTask(
    completedTask.task_id,
    housekeeper.staff_id,
    actorId
  );


  HousekeepingService.startTask(
    completedTask.task_id,
    actorId
  );


  HousekeepingService.completeTask(
    completedTask.task_id,
    actorId,
    'Completed transition test'
  );


  expectRejected(
    'Cancel COMPLETED task rejected',
    () => {

      HousekeepingService.cancelTask(
        completedTask.task_id,
        actorId,
        'Should fail'
      );

    }
  );


  /**
   * ==========================================================
   * RESULTS
   * ==========================================================
   */

  Logger.log(
    '---------------------------------------'
  );


  Logger.log(
    'HOUSEKEEPING VALIDATION RESULTS'
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
    '---------------------------------------'
  );


  if (failed > 0) {

    throw new Error(
      'Housekeeping validation tests failed. ' +
      'Passed=' +
      passed +
      ', Failed=' +
      failed
    );

  }


  Logger.log(
    '===== HOUSEKEEPING VALIDATION TEST PASSED ====='
  );


  return {

    passed:
      failed === 0,

    tests_passed:
      passed,

    tests_failed:
      failed

  };

}

function testHousekeepingScheduleSequence() {

  IdService.synchronizeAllSequences();

  const status =
    IdService.getSequenceStatus(
      'HOUSEKEEPING_SCHEDULE'
    );

  Logger.log(
    JSON.stringify(
      status,
      null,
      2
    )
  );

}


/**
 * ============================================================
 * PHASE 4
 * HOUSEKEEPING SCHEDULE SERVICE TESTS
 * ============================================================
 *
 * Tests:
 *
 * 1. Existing schedules can be read
 * 2. Monthly recurrence calculation
 * 3. Monthly recurrence with fixed day_of_month
 * 4. Weekly recurrence
 * 5. Interval-days recurrence
 * 6. Due detection
 * 7. Overdue detection
 * 8. Invalid frequency rejected
 * 9. Invalid interval rejected
 * 10. Invalid staff rejected
 * 11. Duplicate active schedule rejected
 * 12. Create/update/deactivate lifecycle
 * 13. Generated task duplicate protection
 *
 * Run:
 *
 * testHousekeepingScheduleService();
 *
 * ============================================================
 */


function testHousekeepingScheduleService() {

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'HOUSEKEEPING SCHEDULE SERVICE TEST'
  );

  Logger.log(
    '============================================================'
  );


  let passed = 0;
  let failed = 0;


  function pass(name) {

    passed++;

    Logger.log(
      'PASS: ' + name
    );

  }


  function fail(
    name,
    error
  ) {

    failed++;

    Logger.log(
      'FAIL: ' +
      name +
      ' -> ' +
      (
        error &&
        error.message
          ? error.message
          : error
      )
    );

  }


  function assert(
    condition,
    message
  ) {

    if (!condition) {

      throw new Error(
        message ||
        'Assertion failed.'
      );

    }

  }


  function assertEquals(
    actual,
    expected,
    message
  ) {

    if (
      String(actual) !==
      String(expected)
    ) {

      throw new Error(
        (
          message ||
          'Values are not equal.'
        ) +
        ' Expected=' +
        expected +
        ', Actual=' +
        actual
      );

    }

  }


  function expectError(
    callback,
    expectedText
  ) {

    let error = null;


    try {

      callback();

    } catch (err) {

      error = err;

    }


    if (!error) {

      throw new Error(
        'Expected operation to fail.'
      );

    }


    if (
      expectedText &&
      !String(
        error.message
      ).includes(
        expectedText
      )
    ) {

      throw new Error(
        'Unexpected error: ' +
        error.message
      );

    }


    return error;

  }


  /*
   * ==========================================================
   * TEST 1
   * READ EXISTING SCHEDULES
   * ==========================================================
   */

  try {

    const schedules =
      HousekeepingScheduleService
        .getAll();


    assert(
      schedules.length >= 3,
      'Expected at least 3 housekeeping schedules.'
    );


    const schedule =
      HousekeepingScheduleService
        .getById(
          'HS-000001'
        );


    assert(
      schedule,
      'HS-000001 not found.'
    );


    assertEquals(
      schedule.unit_id,
      'UNIT-000001',
      'Unexpected unit for HS-000001.'
    );


    assertEquals(
      schedule.task_type,
      'DEEP_CLEAN',
      'HS-000001 must use canonical DEEP_CLEAN.'
    );


    assertEquals(
      schedule.frequency,
      'MONTHLY',
      'Unexpected frequency.'
    );


    pass(
      'Read existing housekeeping schedules'
    );

  } catch (err) {

    fail(
      'Read existing housekeeping schedules',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 2
   * MONTHLY RECURRENCE
   * ==========================================================
   */

  try {

    const nextDue =
      HousekeepingScheduleService
        .calculateNextDue(
          {
            frequency:
              'MONTHLY',

            interval_value:
              1,

            day_of_month:
              ''
          },

          '2026-09-05'
        );


    assertEquals(
      nextDue,
      '2026-10-05',
      'Monthly recurrence calculation incorrect.'
    );


    pass(
      'Monthly recurrence calculation'
    );

  } catch (err) {

    fail(
      'Monthly recurrence calculation',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 3
   * MONTHLY FIXED DAY
   * ==========================================================
   */

  try {

    const nextDue =
      HousekeepingScheduleService
        .calculateNextDue(
          {
            frequency:
              'MONTHLY',

            interval_value:
              1,

            day_of_month:
              15
          },

          '2026-09-05'
        );


    assertEquals(
      nextDue,
      '2026-10-15',
      'Fixed monthly day calculation incorrect.'
    );


    pass(
      'Monthly fixed day calculation'
    );

  } catch (err) {

    fail(
      'Monthly fixed day calculation',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 4
   * WEEKLY RECURRENCE
   * ==========================================================
   */

  try {

    const nextDue =
      HousekeepingScheduleService
        .calculateNextDue(
          {
            frequency:
              'WEEKLY',

            interval_value:
              1,

            day_of_week:
              'MONDAY'
          },

          '2026-09-01'
        );


    assertEquals(
      nextDue,
      '2026-09-07',
      'Weekly recurrence calculation incorrect.'
    );


    pass(
      'Weekly recurrence calculation'
    );

  } catch (err) {

    fail(
      'Weekly recurrence calculation',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 5
   * INTERVAL DAYS
   * ==========================================================
   */

  try {

    const nextDue =
      HousekeepingScheduleService
        .calculateNextDue(
          {
            frequency:
              'INTERVAL_DAYS',

            interval_value:
              30
          },

          '2026-09-01'
        );


    assertEquals(
      nextDue,
      '2026-10-01',
      '30-day recurrence calculation incorrect.'
    );


    pass(
      'Interval-days recurrence calculation'
    );

  } catch (err) {

    fail(
      'Interval-days recurrence calculation',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 6
   * DUE DETECTION
   * ==========================================================
   */

  try {

    const schedule =
      HousekeepingScheduleService
        .getById(
          'HS-000001'
        );


    assert(
      HousekeepingScheduleService
        .isDue(
          schedule,
          '2026-10-01'
        ),
      'HS-000001 should be due on 2026-10-01.'
    );


    assert(
      !HousekeepingScheduleService
        .isDue(
          schedule,
          '2026-09-30'
        ),
      'HS-000001 should not be due on 2026-09-30.'
    );


    pass(
      'Due-date detection'
    );

  } catch (err) {

    fail(
      'Due-date detection',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 7
   * OVERDUE DETECTION
   * ==========================================================
   */

  try {

    const schedule =
      HousekeepingScheduleService
        .getById(
          'HS-000001'
        );


    assert(
      HousekeepingScheduleService
        .isOverdue(
          schedule,
          '2026-10-02'
        ),
      'HS-000001 should be overdue on 2026-10-02.'
    );


    assert(
      !HousekeepingScheduleService
        .isOverdue(
          schedule,
          '2026-10-01'
        ),
      'Schedule is due, but not overdue, on its exact due date.'
    );


    pass(
      'Overdue detection'
    );

  } catch (err) {

    fail(
      'Overdue detection',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 8
   * INVALID FREQUENCY
   * ==========================================================
   */

  try {

    expectError(
      () => {

        HousekeepingScheduleService
          .calculateNextDue(
            {
              frequency:
                'YEARLY',

              interval_value:
                1
            },

            '2026-09-01'
          );

      },
      'Invalid housekeeping schedule frequency'
    );


    pass(
      'Invalid frequency rejected'
    );

  } catch (err) {

    fail(
      'Invalid frequency rejected',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 9
   * INVALID INTERVAL
   * ==========================================================
   */

  try {

    expectError(
      () => {

        HousekeepingScheduleService
          .calculateNextDue(
            {
              frequency:
                'MONTHLY',

              interval_value:
                0
            },

            '2026-09-01'
          );

      },
      'positive integer'
    );


    pass(
      'Invalid interval rejected'
    );

  } catch (err) {

    fail(
      'Invalid interval rejected',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 10
   * INVALID STAFF
   * ==========================================================
   */

  try {

    expectError(
      () => {

        HousekeepingScheduleService
          .createSchedule(
            {
              unit_id:
                'UNIT-000005',

              task_type:
                'TOUCH_UP',

              frequency:
                'INTERVAL_DAYS',

              interval_value:
                17,

              next_due:
                '2027-12-20',

              assigned_to:
                'STF-999999',

              active:
                true
            },

            'TEST'
          );

      },
      'Staff not found'
    );


    pass(
      'Invalid staff rejected'
    );

  } catch (err) {

    fail(
      'Invalid staff rejected',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 11
   * DUPLICATE ACTIVE SCHEDULE
   * ==========================================================
   */

  try {

    expectError(
      () => {

        HousekeepingScheduleService
          .createSchedule(
            {
              unit_id:
                'UNIT-000001',

              task_type:
                'DEEP_CLEAN',

              frequency:
                'MONTHLY',

              interval_value:
                1,

              last_completed:
                '2026-09-01',

              next_due:
                '2026-10-01',

              assigned_to:
                'STF-000001',

              active:
                true
            },

            'TEST'
          );

      },
      'already exists'
    );


    pass(
      'Duplicate active schedule rejected'
    );

  } catch (err) {

    fail(
      'Duplicate active schedule rejected',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 12
   * CREATE / UPDATE / DEACTIVATE
   * ==========================================================
   *
   * This intentionally creates one persistent test record.
   * We deactivate rather than delete it.
   * ==========================================================
   */

  let createdSchedule = null;


  try {

    /*
     * Choose an unused combination.
     *
     * UNIT-000005 + TOUCH_UP + INTERVAL_DAYS
     * should normally be free.
     */

    const existing =
      HousekeepingScheduleService
        .findDuplicateSchedule(
          {
            unit_id:
              'UNIT-000005',

            task_type:
              'TOUCH_UP',

            frequency:
              'INTERVAL_DAYS'
          }
        );


    if (existing) {

      /*
       * Makes repeated execution safe.
       */

      createdSchedule =
        existing;

    } else {

      createdSchedule =
        HousekeepingScheduleService
          .createSchedule(
            {
              unit_id:
                'UNIT-000005',

              task_type:
                'TOUCH_UP',

              frequency:
                'INTERVAL_DAYS',

              interval_value:
                17,

              last_completed:
                '2027-11-01',

              next_due:
                '2027-11-18',

              assigned_to:
                '',

              active:
                true
            },

            'TEST'
          );

    }


    assert(
      createdSchedule,
      'Schedule was not created/found.'
    );


    assert(
      /^HS-\d{6}$/.test(
        String(
          createdSchedule.schedule_id
        )
      ),
      'Unexpected schedule ID format.'
    );


    const updated =
      HousekeepingScheduleService
        .updateSchedule(
          createdSchedule.schedule_id,
          {
            interval_value:
              18
          },
          'TEST'
        );


    assertEquals(
      Number(
        updated.interval_value
      ),
      18,
      'Schedule update failed.'
    );


    const deactivated =
      HousekeepingScheduleService
        .deactivateSchedule(
          createdSchedule.schedule_id,
          'TEST'
        );


    assert(
      String(
        deactivated.active
      ).toUpperCase() ===
        'FALSE' ||
      deactivated.active === false,
      'Schedule was not deactivated.'
    );


    pass(
      'Create/update/deactivate schedule lifecycle'
    );

  } catch (err) {

    fail(
      'Create/update/deactivate schedule lifecycle',
      err
    );

  }


  /*
   * ==========================================================
   * TEST 13
   * GENERATED TASK DUPLICATE PROTECTION
   * ==========================================================
   *
   * Uses HS-000001.
   *
   * If a matching housekeeping task already exists,
   * generateTask() should return it rather than create
   * another one.
   *
   * Running this test may create ONE housekeeping task
   * for HS-000001 if none exists yet.
   * ==========================================================
   */

  try {

    const schedule =
      HousekeepingScheduleService
        .getById(
          'HS-000001'
        );


    assert(
      schedule,
      'HS-000001 not found.'
    );


    const first =
      HousekeepingScheduleService
        .generateTask(
          'HS-000001',
          'TEST'
        );


    assert(
      first &&
      first.task,
      'First generateTask call returned no task.'
    );


    const second =
      HousekeepingScheduleService
        .generateTask(
          'HS-000001',
          'TEST'
        );


    assert(
      second &&
      second.task,
      'Second generateTask call returned no task.'
    );


    assertEquals(
      first.task.task_id,
      second.task.task_id,
      'Duplicate task was created.'
    );


    assert(
      second.created === false,
      'Second call should report created=false.'
    );


    assertEquals(
      second.reason,
      'TASK_ALREADY_EXISTS',
      'Unexpected duplicate-protection reason.'
    );


    pass(
      'Generated task duplicate protection'
    );

  } catch (err) {

    fail(
      'Generated task duplicate protection',
      err
    );

  }


  /*
   * ==========================================================
   * SUMMARY
   * ==========================================================
   */

  Logger.log(
    '------------------------------------------------------------'
  );

  Logger.log(
    'HOUSEKEEPING SCHEDULE TEST SUMMARY'
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
    'TOTAL: ' +
    (
      passed +
      failed
    )
  );

  Logger.log(
    '============================================================'
  );


  if (
    failed > 0
  ) {

    throw new Error(
      'HousekeepingScheduleService tests failed: ' +
      failed
    );

  }


  return {

    passed:
      passed,

    failed:
      failed,

    total:
      passed + failed

  };

}


function testMaintenanceSequences() {

  IdService.synchronizeAllSequences();

  const entities = [
    'MAINTENANCE_ASSET',
    'MAINTENANCE_SCHEDULE',
    'MAINTENANCE_WORK_ORDER'
  ];

  entities.forEach(entityType => {

    const status =
      IdService.getSequenceStatus(
        entityType
      );

    Logger.log(
      JSON.stringify(
        status,
        null,
        2
      )
    );

  });

}


function testMaintenanceService() {

  Logger.log(
    '============================================================'
  );
  Logger.log(
    'MAINTENANCE SERVICE TEST'
  );
  Logger.log(
    '============================================================'
  );

  let passed = 0;
  let failed = 0;

  const results = [];

  let testAsset = null;
  let testSchedule = null;
  let testWorkOrder = null;
  let generatedWorkOrder = null;

  /*
   * Existing technician from your current data.
   */
  const TECHNICIAN_ID =
    'STF-000003';

  /*
   * Existing unit.
   */
  const UNIT_ID =
    'UNIT-000001';

  /*
   * Use a future test date so the test does not
   * accidentally appear as overdue operational work.
   */
  const TEST_DATE =
    '2099-06-15';


  function pass(name, details) {

    passed++;

    results.push({
      status: 'PASS',
      name: name,
      details: details || ''
    });

    Logger.log(
      'PASS: ' + name
    );

  }


  function fail(name, err) {

    failed++;

    results.push({
      status: 'FAIL',
      name: name,
      details:
        err && err.message
          ? err.message
          : String(err)
    });

    Logger.log(
      'FAIL: ' +
      name +
      ' -> ' +
      (
        err && err.message
          ? err.message
          : err
      )
    );

  }


  function runTest(
    name,
    callback
  ) {

    try {

      callback();

      pass(name);

    } catch (err) {

      fail(
        name,
        err
      );

    }

  }


  function expectError(
    name,
    callback
  ) {

    try {

      callback();

      fail(
        name,
        new Error(
          'Expected an error but no error was thrown.'
        )
      );

    } catch (err) {

      pass(
        name,
        err.message
      );

    }

  }


  /*
   * ==========================================================
   * 1. READ EXISTING DATA
   * ==========================================================
   */

  runTest(
    'Read existing maintenance data',
    function() {

      const assets =
        MaintenanceService.getAssets();

      const schedules =
        MaintenanceService.getSchedules();

      const workOrders =
        MaintenanceService.getWorkOrders();

      if (assets.length < 4) {

        throw new Error(
          'Expected at least 4 maintenance assets.'
        );

      }

      if (schedules.length < 2) {

        throw new Error(
          'Expected at least 2 maintenance schedules.'
        );

      }

      if (workOrders.length < 3) {

        throw new Error(
          'Expected at least 3 maintenance work orders.'
        );

      }

    }
  );


  /*
   * ==========================================================
   * 2. READ KNOWN ASSET
   * ==========================================================
   */

  runTest(
    'Read existing asset AST-000001',
    function() {

      const asset =
        MaintenanceService
          .getAssetById(
            'AST-000001'
          );

      if (!asset) {

        throw new Error(
          'AST-000001 was not found.'
        );

      }

      if (
        String(asset.unit_id) !==
        'UNIT-000001'
      ) {

        throw new Error(
          'Unexpected unit for AST-000001.'
        );

      }

    }
  );


  /*
   * ==========================================================
   * 3. CREATE TEST ASSET
   * ==========================================================
   */

  runTest(
    'Create maintenance asset',
    function() {

      const serial =
        'TEST-' +
        new Date().getTime();

      testAsset =
        MaintenanceService
          .createAsset(
            {
              unit_id:
                UNIT_ID,

              asset_type:
                'TEST_DEVICE',

              name:
                'Maintenance Test Device',

              brand:
                'TEST',

              model:
                'TEST-01',

              serial_number:
                serial,

              purchase_date:
                '2099-01-01',

              warranty_until:
                '2101-01-01',

              expected_life_years:
                5,

              status:
                'ACTIVE'
            },
            'SYSTEM'
          );

      if (!testAsset.asset_id) {

        throw new Error(
          'Asset ID was not generated.'
        );

      }

      if (
        String(testAsset.asset_id)
          .indexOf('AST-') !== 0
      ) {

        throw new Error(
          'Unexpected asset ID: ' +
          testAsset.asset_id
        );

      }

    }
  );


  /*
   * ==========================================================
   * 4. DUPLICATE SERIAL PROTECTION
   * ==========================================================
   */

  expectError(
    'Duplicate asset serial number rejected',
    function() {

      MaintenanceService
        .createAsset(
          {
            unit_id:
              UNIT_ID,

            asset_type:
              'TEST_DEVICE',

            name:
              'Duplicate Device',

            serial_number:
              testAsset.serial_number,

            status:
              'ACTIVE'
          },
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 5. INVALID UNIT
   * ==========================================================
   */

  expectError(
    'Invalid asset unit rejected',
    function() {

      MaintenanceService
        .createAsset(
          {
            unit_id:
              'UNIT-999999',

            asset_type:
              'TEST_DEVICE',

            name:
              'Invalid Unit Device',

            status:
              'ACTIVE'
          },
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 6. INVALID TECHNICIAN
   * ==========================================================
   */

  expectError(
    'Non-technician assignment rejected',
    function() {

      MaintenanceService
        .createWorkOrder(
          {
            unit_id:
              UNIT_ID,

            asset_id:
              testAsset.asset_id,

            source:
              'MANUAL',

            issue_type:
              'TEST',

            description:
              'Technician validation test',

            priority:
              'LOW',

            assigned_to:
              'STF-000001',

            status:
              'OPEN'
          },
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 7. RECURRENCE CALCULATION
   * ==========================================================
   */

  runTest(
    'Monthly recurrence calculation',
    function() {

      const nextDue =
        MaintenanceService
          .calculateNextDue(
            {
              frequency:
                'MONTHLY',

              interval_value:
                1
            },
            '2099-01-31'
          );

      if (
        nextDue !==
        '2099-02-28'
      ) {

        throw new Error(
          'Expected 2099-02-28 but got ' +
          nextDue
        );

      }

    }
  );


  runTest(
    'Annual recurrence calculation',
    function() {

      const nextDue =
        MaintenanceService
          .calculateNextDue(
            {
              frequency:
                'ANNUAL',

              interval_value:
                1
            },
            '2099-06-15'
          );

      if (
        nextDue !==
        '2100-06-15'
      ) {

        throw new Error(
          'Expected 2100-06-15 but got ' +
          nextDue
        );

      }

    }
  );


  /*
   * ==========================================================
   * 8. CREATE PREVENTIVE SCHEDULE
   * ==========================================================
   */

  runTest(
    'Create preventive maintenance schedule',
    function() {

      testSchedule =
        MaintenanceService
          .createSchedule(
            {
              asset_id:
                testAsset.asset_id,

              maintenance_type:
                'TEST_SERVICE',

              frequency:
                'MONTHLY',

              interval_value:
                1,

              last_completed:
                '2099-05-15',

              next_due:
                TEST_DATE,

              assigned_to:
                TECHNICIAN_ID,

              estimated_duration:
                30,

              estimated_cost:
                100,

              active:
                true
            },
            'SYSTEM'
          );

      if (!testSchedule.schedule_id) {

        throw new Error(
          'Schedule ID was not generated.'
        );

      }

      if (
        String(
          testSchedule.schedule_id
        ).indexOf('MS-') !== 0
      ) {

        throw new Error(
          'Unexpected schedule ID: ' +
          testSchedule.schedule_id
        );

      }

    }
  );


  /*
   * ==========================================================
   * 9. DUPLICATE ACTIVE SCHEDULE
   * ==========================================================
   */

  expectError(
    'Duplicate active schedule rejected',
    function() {

      MaintenanceService
        .createSchedule(
          {
            asset_id:
              testAsset.asset_id,

            maintenance_type:
              'TEST_SERVICE',

            frequency:
              'MONTHLY',

            interval_value:
              1,

            next_due:
              '2099-07-15',

            assigned_to:
              TECHNICIAN_ID,

            active:
              true
          },
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 10. CREATE MANUAL WORK ORDER
   * ==========================================================
   */

  runTest(
    'Create manual maintenance work order',
    function() {

      testWorkOrder =
        MaintenanceService
          .createWorkOrder(
            {
              unit_id:
                UNIT_ID,

              asset_id:
                testAsset.asset_id,

              reservation_id:
                '',

              source:
                'MANUAL',

              issue_type:
                'TEST_FAILURE',

              description:
                'Maintenance lifecycle test',

              priority:
                'MEDIUM',

              assigned_to:
                '',

              scheduled_date:
                '',

              status:
                'OPEN',

              started_at:
                '',

              completed_at:
                '',

              cost:
                '',

              resolution:
                ''
            },
            'SYSTEM'
          );

      if (!testWorkOrder.work_order_id) {

        throw new Error(
          'Work order ID was not generated.'
        );

      }

    }
  );


  /*
   * ==========================================================
   * 11. START UNASSIGNED ORDER MUST FAIL
   * ==========================================================
   */

  expectError(
    'Start unassigned work order rejected',
    function() {

      MaintenanceService
        .startWorkOrder(
          testWorkOrder.work_order_id,
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 12. WORK ORDER LIFECYCLE
   * ==========================================================
   */

  runTest(
    'Work order lifecycle',
    function() {

      let workOrder =
        MaintenanceService
          .assignWorkOrder(
            testWorkOrder.work_order_id,
            TECHNICIAN_ID,
            'SYSTEM'
          );


      workOrder =
        MaintenanceService
          .scheduleWorkOrder(
            workOrder.work_order_id,
            TEST_DATE,
            TECHNICIAN_ID,
            'SYSTEM'
          );


      if (
        String(workOrder.status) !==
        'SCHEDULED'
      ) {

        throw new Error(
          'Expected SCHEDULED status.'
        );

      }


      workOrder =
        MaintenanceService
          .startWorkOrder(
            workOrder.work_order_id,
            'SYSTEM'
          );


      if (
        String(workOrder.status) !==
        'IN_PROGRESS'
      ) {

        throw new Error(
          'Expected IN_PROGRESS status.'
        );

      }


      if (!workOrder.started_at) {

        throw new Error(
          'started_at was not populated.'
        );

      }


      workOrder =
        MaintenanceService
          .completeWorkOrder(
            workOrder.work_order_id,
            'Test repair completed successfully.',
            125,
            'SYSTEM'
          );


      if (
        String(workOrder.status) !==
        'COMPLETED'
      ) {

        throw new Error(
          'Expected COMPLETED status.'
        );

      }


      if (!workOrder.completed_at) {

        throw new Error(
          'completed_at was not populated.'
        );

      }


      if (!workOrder.resolution) {

        throw new Error(
          'resolution was not populated.'
        );

      }


      testWorkOrder =
        workOrder;

    }
  );


  /*
   * ==========================================================
   * 13. TERMINAL TRANSITION PROTECTION
   * ==========================================================
   */

  expectError(
    'Completed work order cannot restart',
    function() {

      MaintenanceService
        .startWorkOrder(
          testWorkOrder.work_order_id,
          'SYSTEM'
        );

    }
  );


  /*
   * ==========================================================
   * 14. GENERATE PREVENTIVE WORK ORDER
   * ==========================================================
   */

  runTest(
    'Generate preventive work order',
    function() {

      const result =
        MaintenanceService
          .generatePreventiveWorkOrder(
            testSchedule.schedule_id,
            'SYSTEM'
          );

      if (!result.created) {

        throw new Error(
          'Expected preventive work order creation.'
        );

      }

      generatedWorkOrder =
        result.work_order;


      if (
        String(
          generatedWorkOrder.source
        ) !==
        'PREVENTIVE'
      ) {

        throw new Error(
          'Generated work order source must be PREVENTIVE.'
        );

      }


      if (
        String(
          generatedWorkOrder.status
        ) !==
        'SCHEDULED'
      ) {

        throw new Error(
          'Generated work order must be SCHEDULED.'
        );

      }

    }
  );


  /*
   * ==========================================================
   * 15. PREVENTIVE DUPLICATE PROTECTION
   * ==========================================================
   */

  runTest(
    'Preventive work order duplicate protection',
    function() {

      const result =
        MaintenanceService
          .generatePreventiveWorkOrder(
            testSchedule.schedule_id,
            'SYSTEM'
          );

      if (result.created !== false) {

        throw new Error(
          'Second generation should not create another work order.'
        );

      }

      if (
        result.reason !==
        'WORK_ORDER_ALREADY_EXISTS'
      ) {

        throw new Error(
          'Unexpected duplicate reason: ' +
          result.reason
        );

      }

    }
  );


  /*
   * ==========================================================
   * 16. COMPLETE PREVENTIVE WORK ORDER
   * ==========================================================
   */

  runTest(
    'Complete preventive work order',
    function() {

      let workOrder =
        MaintenanceService
          .startWorkOrder(
            generatedWorkOrder.work_order_id,
            'SYSTEM'
          );


      workOrder =
        MaintenanceService
          .completeWorkOrder(
            workOrder.work_order_id,
            'Preventive maintenance completed.',
            100,
            'SYSTEM'
          );


      if (
        String(workOrder.status) !==
        'COMPLETED'
      ) {

        throw new Error(
          'Preventive work order did not complete.'
        );

      }


      generatedWorkOrder =
        workOrder;

    }
  );


  /*
   * ==========================================================
   * 17. RECORD PREVENTIVE COMPLETION
   * ==========================================================
   */

  runTest(
    'Advance preventive schedule after completion',
    function() {

      const before =
        MaintenanceService
          .getScheduleById(
            testSchedule.schedule_id
          );


      const updated =
        MaintenanceService
          .recordPreventiveCompletion(
            generatedWorkOrder.work_order_id,
            'SYSTEM'
          );


      if (!updated) {

        throw new Error(
          'Schedule was not updated.'
        );

      }


      if (!updated.last_completed) {

        throw new Error(
          'last_completed was not populated.'
        );

      }


      if (!updated.next_due) {

        throw new Error(
          'next_due was not populated.'
        );

      }


      if (
        String(updated.next_due) ===
        String(before.next_due)
      ) {

        throw new Error(
          'next_due was not advanced.'
        );

      }


      testSchedule =
        updated;

    }
  );


  /*
   * ==========================================================
   * 18. INTEGRITY HELPERS
   * ==========================================================
   */

  runTest(
    'Maintenance integrity helpers',
    function() {

      const checks = {

        orphanAssetUnits:
          MaintenanceService
            .findOrphanAssetUnitLinks(),

        invalidAssetStatuses:
          MaintenanceService
            .findInvalidAssetStatuses(),

        duplicateSerials:
          MaintenanceService
            .findDuplicateAssetSerialNumbers(),

        orphanScheduleAssets:
          MaintenanceService
            .findOrphanScheduleAssetLinks(),

        orphanScheduleStaff:
          MaintenanceService
            .findOrphanScheduleStaffLinks(),

        invalidScheduleStaff:
          MaintenanceService
            .findInvalidScheduleStaffAssignments(),

        invalidScheduleFrequencies:
          MaintenanceService
            .findInvalidScheduleFrequencies(),

        invalidScheduleIntervals:
          MaintenanceService
            .findInvalidScheduleIntervals(),

        invalidScheduleDates:
          MaintenanceService
            .findInvalidScheduleDates(),

        duplicateSchedules:
          MaintenanceService
            .findDuplicateActiveSchedules(),

        schedulesWithoutNextDue:
          MaintenanceService
            .findActiveSchedulesWithoutNextDue(),

        orphanWorkOrderUnits:
          MaintenanceService
            .findOrphanWorkOrderUnitLinks(),

        orphanWorkOrderAssets:
          MaintenanceService
            .findOrphanWorkOrderAssetLinks(),

        orphanWorkOrderReservations:
          MaintenanceService
            .findOrphanWorkOrderReservationLinks(),

        orphanWorkOrderStaff:
          MaintenanceService
            .findOrphanWorkOrderStaffLinks(),

        invalidWorkOrderStaff:
          MaintenanceService
            .findInvalidWorkOrderStaffAssignments(),

        assetUnitMismatches:
          MaintenanceService
            .findAssetUnitMismatches(),

        reservationUnitMismatches:
          MaintenanceService
            .findReservationUnitMismatches(),

        invalidSources:
          MaintenanceService
            .findInvalidWorkOrderSources(),

        invalidPriorities:
          MaintenanceService
            .findInvalidWorkOrderPriorities(),

        invalidStatuses:
          MaintenanceService
            .findInvalidWorkOrderStatuses(),

        scheduledWithoutDate:
          MaintenanceService
            .findScheduledWithoutDate(),

        inProgressWithoutStart:
          MaintenanceService
            .findInProgressWithoutStartedAt(),

        completedWithoutTimestamp:
          MaintenanceService
            .findCompletedWithoutTimestamp(),

        completedWithoutResolution:
          MaintenanceService
            .findCompletedWithoutResolution()

      };


      Object.keys(checks)
        .forEach(
          function(key) {

            if (
              !Array.isArray(
                checks[key]
              )
            ) {

              throw new Error(
                key +
                ' did not return an array.'
              );

            }

          }
        );

    }
  );


  /*
   * ==========================================================
   * SUMMARY
   * ==========================================================
   */

  Logger.log(
    '------------------------------------------------------------'
  );

  Logger.log(
    'PASSED: ' + passed
  );

  Logger.log(
    'FAILED: ' + failed
  );

  Logger.log(
    'TOTAL: ' +
    (passed + failed)
  );

  Logger.log(
    '------------------------------------------------------------'
  );

  Logger.log(
    JSON.stringify(
      results,
      null,
      2
    )
  );

  Logger.log(
    '============================================================'
  );

}


function testMaintenanceIdSequences() {

  IdService.synchronizeAllSequences();

  const entities = [
    'MAINTENANCE_ASSET',
    'MAINTENANCE_SCHEDULE',
    'MAINTENANCE_WORK_ORDER'
  ];

  entities.forEach(entityType => {

    const status =
      IdService.getSequenceStatus(entityType);

    Logger.log(
      entityType + ':'
    );

    Logger.log(
      JSON.stringify(
        status,
        null,
        2
      )
    );

  });

}

/**
 * ============================================================================
 * PHASE 4 - INSPECTION SERVICE TESTS
 * ============================================================================
 *
 * Tests:
 *   1. Read existing inspection data
 *   2. Read existing inspection by ID
 *   3. Read existing checklist
 *   4. Create inspection
 *   5. Invalid unit rejected
 *   6. Reservation/unit mismatch rejected
 *   7. Housekeeper rejected as inspector
 *   8. Technician rejected as inspector
 *   9. Supervisor accepted as inspector
 *  10. Invalid score rejected
 *  11. Add checklist items
 *  12. Duplicate checklist item rejected
 *  13. Start inspection
 *  14. Complete with incomplete checklist rejected
 *  15. Checklist result lifecycle
 *  16. Complete inspection
 *  17. Completed inspection cannot restart
 *  18. Completed checklist cannot be modified
 *  19. Inspection summary
 *  20. Cancellation lifecycle
 *  21. Inspection integrity helpers
 *
 * IMPORTANT:
 *   - This test creates permanent test rows.
 *   - IDs are intentionally consumed and must NOT be reset.
 *   - No unit operational status is changed.
 *   - StayOperationsService will own operational transitions later.
 * ============================================================================
 */

function testInspectionService() {

  const TEST = {
    UNIT_ID: 'UNIT-000001',

    SUPERVISOR_ID: 'STF-000004',
    ADMIN_ID: 'STF-000005',

    HOUSEKEEPER_ID: 'STF-000001',
    TECHNICIAN_ID: 'STF-000003',

    EXISTING_INSPECTION_ID: 'INSP-000001',

    TEST_DATE: '2099-07-15 13:00:00'
  };


  // ==========================================================================
  // TEST HARNESS
  // ==========================================================================

  let passed = 0;
  let failed = 0;

  const results = [];


  function logResult(
    testName,
    success,
    message
  ) {

    if (success) {
      passed++;

      Logger.log(
        `PASS - ${testName}`
      );

    } else {
      failed++;

      Logger.log(
        `FAIL - ${testName}: ${message}`
      );
    }

    results.push({
      test: testName,
      passed: success,
      message: message || ''
    });
  }


  function runTest(
    testName,
    callback
  ) {

    try {

      callback();

      logResult(
        testName,
        true,
        ''
      );

    } catch (error) {

      logResult(
        testName,
        false,
        error.message
      );
    }
  }


  function assertTrue(
    condition,
    message
  ) {

    if (!condition) {
      throw new Error(
        message || 'Assertion failed.'
      );
    }
  }


  function assertEquals(
    expected,
    actual,
    message
  ) {

    if (
      String(expected) !==
      String(actual)
    ) {

      throw new Error(
        message ||
        `Expected [${expected}] but got [${actual}]`
      );
    }
  }


  function assertThrows(
    callback,
    expectedText
  ) {

    let thrown = false;
    let errorMessage = '';

    try {

      callback();

    } catch (error) {

      thrown = true;
      errorMessage =
        error.message || String(error);
    }

    if (!thrown) {

      throw new Error(
        'Expected operation to throw an error.'
      );
    }

    if (
      expectedText &&
      errorMessage
        .toLowerCase()
        .indexOf(
          expectedText.toLowerCase()
        ) === -1
    ) {

      throw new Error(
        `Expected error containing "${expectedText}", ` +
        `but received "${errorMessage}".`
      );
    }
  }


  // ==========================================================================
  // SHARED TEST STATE
  // ==========================================================================

  let createdInspection = null;

  let cleanlinessItem = null;
  let housekeepingItem = null;
  let maintenanceItem = null;

  let cancellationInspection = null;


  // ==========================================================================
  // 1. READ EXISTING INSPECTION DATA
  // ==========================================================================

  runTest(
    'Read existing inspection data',
    () => {

      const inspections =
        InspectionService.getAll();

      assertTrue(
        Array.isArray(inspections),
        'getAll() must return an array.'
      );

      assertTrue(
        inspections.length >= 2,
        'Expected at least the existing inspection rows.'
      );
    }
  );


  // ==========================================================================
  // 2. READ EXISTING INSPECTION
  // ==========================================================================

  runTest(
    'Read existing inspection by ID',
    () => {

      const inspection =
        InspectionService.getById(
          TEST.EXISTING_INSPECTION_ID
        );

      assertTrue(
        !!inspection,
        `${TEST.EXISTING_INSPECTION_ID} was not found.`
      );

      assertEquals(
        TEST.EXISTING_INSPECTION_ID,
        inspection.inspection_id
      );

      assertEquals(
        'UNIT-000004',
        inspection.unit_id
      );

      assertEquals(
        'COMPLETED',
        inspection.status
      );

      assertEquals(
        'PASS',
        inspection.overall_result
      );
    }
  );


  // ==========================================================================
  // 3. READ EXISTING CHECKLIST
  // ==========================================================================

  runTest(
    'Read existing inspection checklist',
    () => {

      const checklist =
        InspectionService.getChecklist(
          TEST.EXISTING_INSPECTION_ID
        );

      assertTrue(
        Array.isArray(checklist),
        'getChecklist() must return an array.'
      );

      assertEquals(
        9,
        checklist.length,
        'INSP-000001 should have 9 checklist items.'
      );

      const failures =
        InspectionService
          .getFailedChecklistItems(
            TEST.EXISTING_INSPECTION_ID
          );

      assertEquals(
        0,
        failures.length
      );
    }
  );


  // ==========================================================================
  // 4. CREATE INSPECTION
  // ==========================================================================

  runTest(
    'Create inspection',
    () => {

      createdInspection =
        InspectionService.createInspection(
          {
            unit_id:
              TEST.UNIT_ID,

            inspection_type:
              'MANUAL',

            scheduled_at:
              TEST.TEST_DATE,

            inspector_id:
              TEST.SUPERVISOR_ID,

            notes:
              'Phase 4 inspection service test'
          },

          TEST.ADMIN_ID
        );

      assertTrue(
        !!createdInspection,
        'Inspection was not created.'
      );

      assertTrue(
        !!createdInspection.inspection_id,
        'inspection_id was not generated.'
      );

      assertTrue(
        createdInspection.inspection_id
          .indexOf('INSP-') === 0,
        'Inspection ID prefix is invalid.'
      );

      assertEquals(
        TEST.UNIT_ID,
        createdInspection.unit_id
      );

      assertEquals(
        'MANUAL',
        createdInspection.inspection_type
      );

      assertEquals(
        'PENDING',
        createdInspection.status
      );

      assertEquals(
        TEST.SUPERVISOR_ID,
        createdInspection.inspector_id
      );

      assertEquals(
        '',
        createdInspection.overall_result
      );

      Logger.log(
        'Created inspection: ' +
        createdInspection.inspection_id
      );
    }
  );


  // ==========================================================================
  // 5. INVALID UNIT
  // ==========================================================================

  runTest(
    'Invalid unit rejected',
    () => {

      assertThrows(
        () => {

          InspectionService.createInspection(
            {
              unit_id:
                'UNIT-999999',

              inspection_type:
                'MANUAL',

              scheduled_at:
                TEST.TEST_DATE,

              inspector_id:
                TEST.SUPERVISOR_ID
            },

            TEST.ADMIN_ID
          );
        },

        'Unit not found'
      );
    }
  );


  // ==========================================================================
  // 6. RESERVATION / UNIT MISMATCH
  // ==========================================================================

  runTest(
    'Reservation unit mismatch rejected',
    () => {

      const reservations =
        ReservationService.getAll();

      const mismatchedReservation =
        reservations.find(
          reservation =>
            reservation.unit_id !==
            TEST.UNIT_ID
        );

      assertTrue(
        !!mismatchedReservation,
        'No reservation on another unit exists for mismatch test.'
      );

      assertThrows(
        () => {

          InspectionService.createInspection(
            {
              unit_id:
                TEST.UNIT_ID,

              reservation_id:
                mismatchedReservation
                  .reservation_id,

              inspection_type:
                'PRE_CHECKIN',

              scheduled_at:
                TEST.TEST_DATE,

              inspector_id:
                TEST.SUPERVISOR_ID
            },

            TEST.ADMIN_ID
          );
        },

        'belongs to unit'
      );
    }
  );


  // ==========================================================================
  // 7. HOUSEKEEPER CANNOT INSPECT
  // ==========================================================================

  runTest(
    'Housekeeper rejected as inspector',
    () => {

      assertThrows(
        () => {

          InspectionService.createInspection(
            {
              unit_id:
                TEST.UNIT_ID,

              inspection_type:
                'MANUAL',

              scheduled_at:
                TEST.TEST_DATE,

              inspector_id:
                TEST.HOUSEKEEPER_ID
            },

            TEST.ADMIN_ID
          );
        },

        'cannot perform inspections'
      );
    }
  );


  // ==========================================================================
  // 8. TECHNICIAN CANNOT INSPECT
  // ==========================================================================

  runTest(
    'Technician rejected as inspector',
    () => {

      assertThrows(
        () => {

          InspectionService.createInspection(
            {
              unit_id:
                TEST.UNIT_ID,

              inspection_type:
                'MANUAL',

              scheduled_at:
                TEST.TEST_DATE,

              inspector_id:
                TEST.TECHNICIAN_ID
            },

            TEST.ADMIN_ID
          );
        },

        'cannot perform inspections'
      );
    }
  );


  // ==========================================================================
  // 9. SUPERVISOR IS VALID INSPECTOR
  // ==========================================================================

  runTest(
    'Supervisor accepted as inspector',
    () => {

      const staff =
        StaffService.getStaffById(
          TEST.SUPERVISOR_ID
        );

      assertTrue(
        !!staff,
        'Supervisor not found.'
      );

      assertEquals(
        'SUPERVISOR',
        staff.role
      );

      assertEquals(
        'ACTIVE',
        staff.status
      );

      assertEquals(
        TEST.SUPERVISOR_ID,
        createdInspection.inspector_id
      );
    }
  );


  // ==========================================================================
  // 10. INVALID SCORE
  // ==========================================================================

  runTest(
    'Invalid score rejected',
    () => {

      assertThrows(
        () => {

          InspectionService.updateInspection(
            createdInspection.inspection_id,
            {
              cleanliness_score: 101
            },
            TEST.ADMIN_ID
          );
        },

        'between 0 and 100'
      );

      assertThrows(
        () => {

          InspectionService.updateInspection(
            createdInspection.inspection_id,
            {
              maintenance_score: -1
            },
            TEST.ADMIN_ID
          );
        },

        'between 0 and 100'
      );
    }
  );


  // ==========================================================================
  // 11. ADD CHECKLIST ITEMS
  // ==========================================================================

  runTest(
    'Add checklist items',
    () => {

      cleanlinessItem =
        InspectionService.addChecklistItem(
          createdInspection.inspection_id,
          {
            category:
              'CLEANLINESS',

            item:
              'Test floor cleanliness'
          },
          TEST.ADMIN_ID
        );


      housekeepingItem =
        InspectionService.addChecklistItem(
          createdInspection.inspection_id,
          {
            category:
              'HOUSEKEEPING',

            item:
              'Test bed preparation'
          },
          TEST.ADMIN_ID
        );


      maintenanceItem =
        InspectionService.addChecklistItem(
          createdInspection.inspection_id,
          {
            category:
              'MAINTENANCE',

            item:
              'Test AC operation'
          },
          TEST.ADMIN_ID
        );


      assertTrue(
        !!cleanlinessItem
          .checklist_item_id,
        'Cleanliness checklist ID missing.'
      );

      assertTrue(
        cleanlinessItem
          .checklist_item_id
          .indexOf('IC-') === 0,
        'Checklist ID prefix is invalid.'
      );


      const checklist =
        InspectionService.getChecklist(
          createdInspection.inspection_id
        );

      assertEquals(
        3,
        checklist.length
      );
    }
  );


  // ==========================================================================
  // 12. DUPLICATE CHECKLIST ITEM
  // ==========================================================================

  runTest(
    'Duplicate checklist item rejected',
    () => {

      assertThrows(
        () => {

          InspectionService.addChecklistItem(
            createdInspection.inspection_id,
            {
              category:
                'CLEANLINESS',

              item:
                'Test floor cleanliness'
            },
            TEST.ADMIN_ID
          );
        },

        'Duplicate checklist item'
      );
    }
  );


  // ==========================================================================
  // 13. START INSPECTION
  // ==========================================================================

  runTest(
    'Start inspection',
    () => {

      const started =
        InspectionService.startInspection(
          createdInspection.inspection_id,
          TEST.ADMIN_ID
        );

      assertEquals(
        'IN_PROGRESS',
        started.status
      );

      createdInspection =
        started;
    }
  );


  // ==========================================================================
  // 14. CANNOT COMPLETE WITH INCOMPLETE CHECKLIST
  // ==========================================================================

  runTest(
    'Complete with incomplete checklist rejected',
    () => {

      assertThrows(
        () => {

          InspectionService.completeInspection(
            createdInspection.inspection_id,
            {
              cleanliness_score: 95,
              maintenance_score: 100,
              overall_result: 'PASS'
            },
            TEST.ADMIN_ID
          );
        },

        'incomplete checklist'
      );
    }
  );


  // ==========================================================================
  // 15. CHECKLIST RESULT LIFECYCLE
  // ==========================================================================

  runTest(
    'Checklist result lifecycle',
    () => {

      const item1 =
        InspectionService.setChecklistResult(
          cleanlinessItem.checklist_item_id,
          'PASS',
          '',
          TEST.ADMIN_ID
        );

      const item2 =
        InspectionService.setChecklistResult(
          housekeepingItem.checklist_item_id,
          'PASS',
          '',
          TEST.ADMIN_ID
        );

      const item3 =
        InspectionService.setChecklistResult(
          maintenanceItem.checklist_item_id,
          'PASS',
          '',
          TEST.ADMIN_ID
        );

      assertEquals(
        'PASS',
        item1.result
      );

      assertEquals(
        'PASS',
        item2.result
      );

      assertEquals(
        'PASS',
        item3.result
      );


      const incomplete =
        InspectionService
          .getIncompleteChecklistItems(
            createdInspection.inspection_id
          );

      assertEquals(
        0,
        incomplete.length
      );
    }
  );


  // ==========================================================================
  // 16. COMPLETE INSPECTION
  // ==========================================================================

  runTest(
    'Complete inspection',
    () => {

      const completed =
        InspectionService.completeInspection(
          createdInspection.inspection_id,
          {
            cleanliness_score: 95,
            maintenance_score: 100,
            overall_result: 'PASS',
            notes:
              'Inspection test completed successfully.'
          },
          TEST.ADMIN_ID
        );

      assertEquals(
        'COMPLETED',
        completed.status
      );

      assertEquals(
        'PASS',
        completed.overall_result
      );

      assertEquals(
        95,
        completed.cleanliness_score
      );

      assertEquals(
        100,
        completed.maintenance_score
      );

      createdInspection =
        completed;
    }
  );


  // ==========================================================================
  // 17. COMPLETED CANNOT RESTART
  // ==========================================================================

  runTest(
    'Completed inspection cannot restart',
    () => {

      assertThrows(
        () => {

          InspectionService.startInspection(
            createdInspection.inspection_id,
            TEST.ADMIN_ID
          );
        },

        'Invalid inspection status transition'
      );
    }
  );


  // ==========================================================================
  // 18. COMPLETED CHECKLIST IMMUTABLE
  // ==========================================================================

  runTest(
    'Completed checklist cannot be modified',
    () => {

      assertThrows(
        () => {

          InspectionService.setChecklistResult(
            cleanlinessItem.checklist_item_id,
            'FAIL',
            'Should not be allowed',
            TEST.ADMIN_ID
          );
        },

        'Cannot modify checklist'
      );


      assertThrows(
        () => {

          InspectionService.addChecklistItem(
            createdInspection.inspection_id,
            {
              category:
                'INVENTORY',

              item:
                'Should not be added'
            },
            TEST.ADMIN_ID
          );
        },

        'Cannot add checklist'
      );
    }
  );


  // ==========================================================================
  // 19. INSPECTION SUMMARY
  // ==========================================================================

  runTest(
    'Inspection summary',
    () => {

      const summary =
        InspectionService
          .getInspectionSummary(
            createdInspection.inspection_id
          );

      assertEquals(
        3,
        summary.checklist_count
      );

      assertEquals(
        3,
        summary.passed_count
      );

      assertEquals(
        0,
        summary.failed_count
      );

      assertEquals(
        0,
        summary.incomplete_count
      );

      assertEquals(
        false,
        summary.has_cleaning_failure
      );

      assertEquals(
        false,
        summary.has_maintenance_failure
      );
    }
  );


  // ==========================================================================
  // 20. CANCELLATION LIFECYCLE
  // ==========================================================================

  runTest(
    'Cancellation lifecycle',
    () => {

      cancellationInspection =
        InspectionService.createInspection(
          {
            unit_id:
              TEST.UNIT_ID,

            inspection_type:
              'MANUAL',

            scheduled_at:
              '2099-07-16 13:00:00',

            inspector_id:
              TEST.ADMIN_ID,

            notes:
              'Cancellation lifecycle test'
          },

          TEST.ADMIN_ID
        );


      const cancelled =
        InspectionService.cancelInspection(
          cancellationInspection
            .inspection_id,
          'Test cancellation',
          TEST.ADMIN_ID
        );


      assertEquals(
        'CANCELLED',
        cancelled.status
      );


      assertThrows(
        () => {

          InspectionService.startInspection(
            cancelled.inspection_id,
            TEST.ADMIN_ID
          );
        },

        'Invalid inspection status transition'
      );
    }
  );


  // ==========================================================================
  // 21. INTEGRITY HELPERS
  // ==========================================================================

  runTest(
    'Inspection integrity helpers',
    () => {

      const checks = [

        InspectionService
          .findOrphanUnitLinks(),

        InspectionService
          .findOrphanReservationLinks(),

        InspectionService
          .findReservationUnitMismatches(),

        InspectionService
          .findOrphanInspectorLinks(),

        InspectionService
          .findInvalidInspectorAssignments(),

        InspectionService
          .findInvalidInspectionTypes(),

        InspectionService
          .findInvalidStatuses(),

        InspectionService
          .findInvalidScores(),

        InspectionService
          .findInvalidOverallResults(),

        InspectionService
          .findIncompleteWithResult(),

        InspectionService
          .findInProgressWithoutInspector(),

        InspectionService
          .findCompletedWithoutInspector(),

        InspectionService
          .findCompletedWithoutResult(),

        InspectionService
          .findCompletedWithIncompleteChecklist(),

        InspectionService
          .findOrphanChecklistInspectionLinks(),

        InspectionService
          .findInvalidChecklistCategories(),

        InspectionService
          .findInvalidChecklistResults(),

        InspectionService
          .findChecklistItemsWithoutDescription(),

        InspectionService
          .findDuplicateChecklistItems()
      ];


      checks.forEach(
        (result, index) => {

          assertTrue(
            Array.isArray(result),
            `Integrity helper ${index + 1} did not return an array.`
          );
        }
      );
    }
  );


  // ==========================================================================
  // FINAL REPORT
  // ==========================================================================

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'INSPECTION SERVICE TEST REPORT'
  );

  Logger.log(
    '============================================================'
  );

  Logger.log(
    `PASSED: ${passed}`
  );

  Logger.log(
    `FAILED: ${failed}`
  );

  Logger.log(
    `TOTAL: ${passed + failed}`
  );


  results.forEach(
    (result, index) => {

      Logger.log(
        `${index + 1}. ` +
        `${result.passed ? 'PASS' : 'FAIL'} - ` +
        `${result.test}` +
        (
          result.message
            ? ` - ${result.message}`
            : ''
        )
      );
    }
  );


  Logger.log(
    '============================================================'
  );


  if (failed > 0) {

    throw new Error(
      `Inspection Service tests failed: ${failed} of ${passed + failed}.`
    );
  }


  return {
    passed,
    failed,
    total:
      passed + failed,
    results
  };
}


