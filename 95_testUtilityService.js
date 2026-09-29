/**
 * 95_testUtilityService.gs
 *
 * Acceptance / regression test for 61_UtilityService.gs.
 *
 * Expected prerequisites:
 *   CONFIG.SHEETS.UTILITIES       = '24_Utilities'
 *   CONFIG.SHEETS.UTILITY_BILLS   = '25_UtilityBills'
 *
 *   CONFIG.ID_PREFIXES.UTILITY      = 'UTL'
 *   CONFIG.ID_PREFIXES.UTILITY_BILL = 'BILL'
 *
 *   IdService managed entities:
 *     { type:'UTILITY', sheet:CONFIG.SHEETS.UTILITIES, field:'utility_id' }
 *     { type:'UTILITY_BILL', sheet:CONFIG.SHEETS.UTILITY_BILLS, field:'bill_id' }
 *
 * Reference data uses:
 *   category | code | name | description | active
 *
 * This test is intentionally non-destructive toward existing production/sample rows.
 * It creates one isolated utility and one isolated utility bill and leaves them in place
 * as acceptance-test history.
 */

function testUtilityService() {

  const ACTOR = 'SYSTEM';

  let passed = 0;
  let failed = 0;

  let property = null;
  let unit = null;
  let createdUtility = null;
  let createdBill = null;

  let utilityType = '';
  let frequency = '';
  let currency = '';

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  function isBlank(value) {
    return value === null ||
      value === undefined ||
      String(value).trim() === '';
  }

  function normalize(value) {
    return isBlank(value) ? '' : String(value).trim();
  }

  function upper(value) {
    return normalize(value).toUpperCase();
  }

  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed.');
    }
  }

  function assertEqual(actual, expected, message) {
    if (String(actual) !== String(expected)) {
      throw new Error(
        (message || 'Values are not equal.') +
        ' Expected=[' + expected + '] Actual=[' + actual + ']'
      );
    }
  }

  function assertNumber(value, message) {
    if (!Number.isFinite(Number(value))) {
      throw new Error(message || ('Expected numeric value, got: ' + value));
    }
  }

  function assertThrows(fn, messageContains) {
    let threw = false;
    let errorMessage = '';

    try {
      fn();
    } catch (error) {
      threw = true;
      errorMessage = error && error.message
        ? String(error.message)
        : String(error);
    }

    if (!threw) {
      throw new Error('Expected function to throw an error.');
    }

    if (
      !isBlank(messageContains) &&
      errorMessage.toLowerCase().indexOf(
        String(messageContains).toLowerCase()
      ) === -1
    ) {
      throw new Error(
        'Expected error containing "' +
        messageContains +
        '", received "' +
        errorMessage +
        '".'
      );
    }

    return errorMessage;
  }

  function pass(name, detail) {
    passed++;
    Logger.log(
      'PASSED | ' +
      name +
      (isBlank(detail) ? '' : ' | ' + detail)
    );
  }

  function fail(name, error) {
    failed++;

    const message =
      error && error.message
        ? error.message
        : String(error);

    Logger.log(
      'FAILED | ' +
      name +
      ' | ' +
      message
    );
  }

  function test(name, fn) {
    try {
      const detail = fn();
      pass(name, detail);
    } catch (error) {
      fail(name, error);
    }
  }

  function todayString() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE || Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  function addDays(dateText, days) {
    const parts = String(dateText).split('-').map(Number);

    const d = new Date(
      Date.UTC(
        parts[0],
        parts[1] - 1,
        parts[2]
      )
    );

    d.setUTCDate(
      d.getUTCDate() + Number(days)
    );

    return Utilities.formatDate(
      d,
      'UTC',
      'yyyy-MM-dd'
    );
  }

  function findReferenceValues(category) {
    return BaseRepository
      .findAll(
        CONFIG.SHEETS.REFERENCE_DATA
      )
      .filter(
        row =>
          upper(row.category) ===
            upper(category) &&
          upper(row.active) !== 'FALSE'
      )
      .map(
        row => upper(row.code)
      )
      .filter(Boolean);
  }

  function preferredReference(
    category,
    preferredValues
  ) {
    const values =
      findReferenceValues(category);

    for (
      let i = 0;
      i < preferredValues.length;
      i++
    ) {
      const preferred =
        upper(preferredValues[i]);

      if (
        values.indexOf(preferred) !== -1
      ) {
        return preferred;
      }
    }

    return values.length
      ? values[0]
      : '';
  }

  function containsId(
    rows,
    field,
    id
  ) {
    return (rows || []).some(
      row =>
        normalize(row[field]) ===
        normalize(id)
    );
  }

  function chooseFixtureUnit() {
    const properties =
      BaseRepository.findAll(
        CONFIG.SHEETS.PROPERTIES
      );

    const units =
      BaseRepository.findAll(
        CONFIG.SHEETS.UNITS
      );

    for (
      let i = 0;
      i < units.length;
      i++
    ) {
      const candidateUnit = units[i];

      const candidateProperty =
        properties.find(
          p =>
            normalize(p.property_id) ===
            normalize(
              candidateUnit.property_id
            )
        );

      if (candidateProperty) {
        return {
          property: candidateProperty,
          unit: candidateUnit
        };
      }
    }

    throw new Error(
      'No valid property/unit fixture found.'
    );
  }

  function chooseSecondUnitForMismatch() {
    const units =
      BaseRepository.findAll(
        CONFIG.SHEETS.UNITS
      );

    return units.find(
      candidate =>
        normalize(candidate.property_id) !==
        normalize(property.property_id)
    ) || null;
  }

  function sequenceDetail(entityType) {
    const status =
      IdService.getSequenceStatus(
        entityType
      );

    assertTrue(
      status &&
      status.valid === true,
      entityType +
      ' ID sequence is not valid.'
    );

    assertTrue(
      Number(status.stored_sequence) >=
      Number(status.sheet_max_sequence),
      entityType +
      ' stored sequence is behind sheet maximum.'
    );

    return (
      entityType +
      ' stored=' +
      status.stored_sequence +
      ' sheetMax=' +
      status.sheet_max_sequence
    );
  }

  Logger.log(
    '============================================================'
  );
  Logger.log(
    'UTILITY SERVICE TEST'
  );
  Logger.log(
    '============================================================'
  );

  // ---------------------------------------------------------------------------
  // 1. Public API
  // ---------------------------------------------------------------------------

  test(
    'Public API',
    function () {

      const requiredFunctions = [

        'createUtility',
        'updateUtility',
        'changeUtilityStatus',
        'getAllUtilities',
        'getUtilityById',
        'requireUtility',
        'utilityExists',
        'getUtilitiesByProperty',
        'getUtilitiesByUnit',
        'getUtilitiesByType',
        'getActiveUtilities',
        'getInactiveUtilities',

        'createBill',
        'updateBill',
        'changePaymentStatus',
        'markBillPaid',
        'markBillPending',
        'markBillRefunded',
        'getAllBills',
        'getBillById',
        'requireBill',
        'billExists',
        'getBillsByUtility',
        'getBillsByUnit',
        'getBillsByProperty',
        'getBillsByPaymentStatus',
        'getBillsByDateRange',
        'getBillsByBillingPeriod',
        'getPendingBills',
        'getOverdueBills',
        'getUpcomingDueBills',

        'summarizeByCurrency',
        'getSingleCurrencyTotal',
        'getUtilityCostByProperty',
        'getUtilityCostByUnit',
        'getUtilityCostByType',
        'getMonthlyUtilitySummary',

        'findOrphanUtilityPropertyLinks',
        'findOrphanUtilityUnitLinks',
        'findUtilityPropertyUnitMismatches',
        'findInvalidUtilityTypes',
        'findInvalidUtilityFrequencies',
        'findInvalidUtilityCurrencies',
        'findInvalidUtilityStatuses',
        'findDuplicateUtilityIds',
        'findDuplicateUtilityAccountsOrMeters',

        'findOrphanBillUtilityLinks',
        'findInvalidBillingPeriods',
        'findDuplicateBillPeriods',
        'findInvalidBillAmounts',
        'findInvalidPaymentStatuses',
        'findInvalidBillDates',
        'findPaymentDateInconsistencies',
        'findDuplicateBillIds'

      ];

      requiredFunctions.forEach(
        name => {
          assertTrue(
            typeof UtilityService[name] ===
              'function',
            'Missing UtilityService.' +
              name +
              '().'
          );
        }
      );

      assertEqual(
        UtilityService.UTILITY_ENTITY_TYPE,
        'UTILITY',
        'Unexpected utility entity type.'
      );

      assertEqual(
        UtilityService.BILL_ENTITY_TYPE,
        'UTILITY_BILL',
        'Unexpected bill entity type.'
      );

      return (
        requiredFunctions.length +
        ' functions available'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 2. Existing utility data
  // ---------------------------------------------------------------------------

  test(
    'Existing utility data is readable',
    function () {

      const utilities =
        UtilityService.getAllUtilities();

      assertTrue(
        utilities.length >= 4,
        'Expected at least 4 existing utilities.'
      );

      [
        'UTL-000001',
        'UTL-000002',
        'UTL-000003',
        'UTL-000004'
      ].forEach(
        id => {
          assertTrue(
            UtilityService.getUtilityById(id),
            'Expected existing utility ' +
              id +
              '.'
          );
        }
      );

      return (
        utilities.length +
        ' existing utility record(s)'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Existing bill data
  // ---------------------------------------------------------------------------

  test(
    'Existing utility bill data is readable',
    function () {

      const bills =
        UtilityService.getAllBills();

      assertTrue(
        bills.length >= 3,
        'Expected at least 3 existing utility bills.'
      );

      [
        'BILL-000001',
        'BILL-000002',
        'BILL-000003'
      ].forEach(
        id => {
          assertTrue(
            UtilityService.getBillById(id),
            'Expected existing bill ' +
              id +
              '.'
          );
        }
      );

      return (
        bills.length +
        ' existing bill record(s)'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 4. Fixture selection
  // ---------------------------------------------------------------------------

  test(
    'Select property and unit fixture',
    function () {

      const fixture =
        chooseFixtureUnit();

      property =
        fixture.property;

      unit =
        fixture.unit;

      assertTrue(
        property &&
        unit,
        'Fixture selection failed.'
      );

      return (
        property.property_id +
        ' | ' +
        unit.unit_id
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 5. Reference data
  // ---------------------------------------------------------------------------

  test(
    'Required utility reference data exists',
    function () {

      utilityType =
        preferredReference(
          'UTILITY_TYPE',
          [
            'ELECTRICITY',
            'WATER'
          ]
        );

      frequency =
        preferredReference(
          'FREQUENCY',
          [
            'MONTHLY'
          ]
        );

      currency =
        preferredReference(
          'CURRENCY',
          [
            'EGP'
          ]
        );

      const paymentStatuses =
        findReferenceValues(
          'PAYMENT_STATUS'
        );

      assertTrue(
        !isBlank(utilityType),
        'UTILITY_TYPE has no active values.'
      );

      assertTrue(
        !isBlank(frequency),
        'FREQUENCY has no active values.'
      );

      assertTrue(
        !isBlank(currency),
        'CURRENCY has no active values.'
      );

      assertTrue(
        paymentStatuses.indexOf(
          'PENDING'
        ) !== -1,
        'PAYMENT_STATUS PENDING is required.'
      );

      assertTrue(
        paymentStatuses.indexOf(
          'PAID'
        ) !== -1,
        'PAYMENT_STATUS PAID is required.'
      );

      return (
        utilityType +
        ' | ' +
        frequency +
        ' | ' +
        currency
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 6. Create utility
  // ---------------------------------------------------------------------------

  test(
    'Create isolated utility',
    function () {

      const suffix =
        String(new Date().getTime())
          .slice(-8);

      createdUtility =
        UtilityService.createUtility(
          {
            property_id:
              property.property_id,

            unit_id:
              unit.unit_id,

            utility_type:
              utilityType,

            provider:
              'Utility Test Provider',

            account_number:
              'TEST-ACC-' +
              suffix,

            meter_number:
              'TEST-MTR-' +
              suffix,

            billing_frequency:
              frequency,

            currency:
              currency,

            status:
              'ACTIVE'
          },
          ACTOR
        );

      assertTrue(
        createdUtility,
        'Utility was not created.'
      );

      assertTrue(
        /^UTL-\d+$/.test(
          normalize(
            createdUtility.utility_id
          )
        ),
        'Unexpected utility ID: ' +
          createdUtility.utility_id
      );

      return createdUtility.utility_id;
    }
  );

  // ---------------------------------------------------------------------------
  // 7. Utility read/query API
  // ---------------------------------------------------------------------------

  test(
    'Read and query created utility',
    function () {

      const id =
        createdUtility.utility_id;

      assertTrue(
        UtilityService.utilityExists(id),
        'utilityExists returned false.'
      );

      assertTrue(
        UtilityService.getUtilityById(id),
        'getUtilityById returned null.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getUtilitiesByProperty(
              property.property_id
            ),
          'utility_id',
          id
        ),
        'Property query did not return utility.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getUtilitiesByUnit(
              unit.unit_id
            ),
          'utility_id',
          id
        ),
        'Unit query did not return utility.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getUtilitiesByType(
              utilityType
            ),
          'utility_id',
          id
        ),
        'Type query did not return utility.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getActiveUtilities(),
          'utility_id',
          id
        ),
        'Active query did not return utility.'
      );

      return 'Read/query API verified';
    }
  );

  // ---------------------------------------------------------------------------
  // 8. Update utility + status lifecycle
  // ---------------------------------------------------------------------------

  test(
    'Update utility and status lifecycle',
    function () {

      const id =
        createdUtility.utility_id;

      let updated =
        UtilityService.updateUtility(
          id,
          {
            provider:
              'Utility Test Provider Updated'
          },
          ACTOR
        );

      assertEqual(
        updated.provider,
        'Utility Test Provider Updated',
        'Provider was not updated.'
      );

      updated =
        UtilityService.changeUtilityStatus(
          id,
          'INACTIVE',
          ACTOR
        );

      assertEqual(
        upper(updated.status),
        'INACTIVE',
        'Utility did not become INACTIVE.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getInactiveUtilities(),
          'utility_id',
          id
        ),
        'Inactive query did not return utility.'
      );

      updated =
        UtilityService.changeUtilityStatus(
          id,
          'ACTIVE',
          ACTOR
        );

      assertEqual(
        upper(updated.status),
        'ACTIVE',
        'Utility did not return to ACTIVE.'
      );

      createdUtility = updated;

      return (
        id +
        ' | ACTIVE'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 9. Utility validation
  // ---------------------------------------------------------------------------

  test(
    'Reject invalid utility mutations and references',
    function () {

      assertThrows(
        function () {
          UtilityService.updateUtility(
            createdUtility.utility_id,
            {
              utility_id:
                'UTL-999999'
            },
            ACTOR
          );
        },
        'immutable'
      );

      assertThrows(
        function () {
          UtilityService.updateUtility(
            createdUtility.utility_id,
            {
              utility_type:
                'NOT_A_UTILITY_TYPE'
            },
            ACTOR
          );
        }
      );

      assertThrows(
        function () {
          UtilityService.updateUtility(
            createdUtility.utility_id,
            {
              billing_frequency:
                'NOT_A_FREQUENCY'
            },
            ACTOR
          );
        }
      );

      assertThrows(
        function () {
          UtilityService.updateUtility(
            createdUtility.utility_id,
            {
              currency:
                'NOT_A_CURRENCY'
            },
            ACTOR
          );
        }
      );

      return 'Immutable ID and references protected';
    }
  );

  // ---------------------------------------------------------------------------
  // 10. Property/unit relationship validation
  // ---------------------------------------------------------------------------

  test(
    'Reject property/unit mismatch when dataset supports it',
    function () {

      const otherUnit =
        chooseSecondUnitForMismatch();

      if (!otherUnit) {
        return (
          'SKIPPED - no cross-property unit fixture available'
        );
      }

      assertThrows(
        function () {
          UtilityService.createUtility(
            {
              property_id:
                property.property_id,

              unit_id:
                otherUnit.unit_id,

              utility_type:
                utilityType,

              provider:
                'Invalid Relationship Test',

              account_number:
                'BAD-REL-ACC',

              meter_number:
                'BAD-REL-MTR',

              billing_frequency:
                frequency,

              currency:
                currency,

              status:
                'ACTIVE'
            },
            ACTOR
          );
        },
        'does not belong'
      );

      return 'Mismatch rejected';
    }
  );

  // ---------------------------------------------------------------------------
  // 11. Duplicate utility protection
  // ---------------------------------------------------------------------------

  test(
    'Reject duplicate utility account or meter',
    function () {

      assertThrows(
        function () {
          UtilityService.createUtility(
            {
              property_id:
                property.property_id,

              unit_id:
                unit.unit_id,

              utility_type:
                utilityType,

              provider:
                'Duplicate Test',

              account_number:
                createdUtility.account_number,

              meter_number:
                'UNIQUE-METER-' +
                new Date().getTime(),

              billing_frequency:
                frequency,

              currency:
                currency,

              status:
                'ACTIVE'
            },
            ACTOR
          );
        },
        'Duplicate utility'
      );

      return 'Duplicate account/meter protected';
    }
  );

  // ---------------------------------------------------------------------------
  // 12. Create utility bill
  // ---------------------------------------------------------------------------

  test(
    'Create isolated utility bill',
    function () {

      const periodStart =
        '2026-09-01';

      const periodEnd =
        '2026-09-30';

      const billDate =
        todayString();

      const dueDate =
        addDays(
          billDate,
          15
        );

      createdBill =
        UtilityService.createBill(
          {
            utility_id:
              createdUtility.utility_id,

            billing_period_start:
              periodStart,

            billing_period_end:
              periodEnd,

            bill_date:
              billDate,

            due_date:
              dueDate,

            amount:
              100,

            tax_amount:
              14,

            total_amount:
              114,

            payment_status:
              'PENDING',

            paid_date:
              '',

            notes:
              'UtilityService acceptance test'
          },
          ACTOR
        );

      assertTrue(
        createdBill,
        'Utility bill was not created.'
      );

      assertTrue(
        /^BILL-\d+$/.test(
          normalize(
            createdBill.bill_id
          )
        ),
        'Unexpected bill ID: ' +
          createdBill.bill_id
      );

      assertEqual(
        Number(
          createdBill.total_amount
        ),
        114,
        'Unexpected total amount.'
      );

      return createdBill.bill_id;
    }
  );

  // ---------------------------------------------------------------------------
  // 13. Bill read/query API
  // ---------------------------------------------------------------------------

  test(
    'Read and query created utility bill',
    function () {

      const id =
        createdBill.bill_id;

      assertTrue(
        UtilityService.billExists(id),
        'billExists returned false.'
      );

      assertTrue(
        UtilityService.getBillById(id),
        'getBillById returned null.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByUtility(
              createdUtility.utility_id
            ),
          'bill_id',
          id
        ),
        'Utility bill query did not return bill.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByUnit(
              unit.unit_id
            ),
          'bill_id',
          id
        ),
        'Unit bill query did not return bill.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByProperty(
              property.property_id
            ),
          'bill_id',
          id
        ),
        'Property bill query did not return bill.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByPaymentStatus(
              'PENDING'
            ),
          'bill_id',
          id
        ),
        'Payment-status query did not return bill.'
      );

      return 'Read/query API verified';
    }
  );

  // ---------------------------------------------------------------------------
  // 14. Bill financial validation
  // ---------------------------------------------------------------------------

  test(
    'Enforce bill amount, tax, and total equation',
    function () {

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              total_amount:
                999
            },
            ACTOR
          );
        },
        'total_amount'
      );

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              amount:
                -1
            },
            ACTOR
          );
        }
      );

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              tax_amount:
                -1
            },
            ACTOR
          );
        }
      );

      return 'amount + tax = total enforced';
    }
  );

  // ---------------------------------------------------------------------------
  // 15. Duplicate billing period
  // ---------------------------------------------------------------------------

  test(
    'Reject duplicate utility billing period',
    function () {

      assertThrows(
        function () {
          UtilityService.createBill(
            {
              utility_id:
                createdUtility.utility_id,

              billing_period_start:
                createdBill.billing_period_start,

              billing_period_end:
                createdBill.billing_period_end,

              bill_date:
                createdBill.bill_date,

              due_date:
                createdBill.due_date,

              amount:
                100,

              tax_amount:
                14,

              total_amount:
                114,

              payment_status:
                'PENDING',

              paid_date:
                '',

              notes:
                'Duplicate period test'
            },
            ACTOR
          );
        },
        'Duplicate utility billing period'
      );

      return 'Duplicate period protected';
    }
  );

  // ---------------------------------------------------------------------------
  // 16. Date validation
  // ---------------------------------------------------------------------------

  test(
    'Validate bill dates and date-range queries',
    function () {

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              billing_period_start:
                '2026-10-31',

              billing_period_end:
                '2026-10-01'
            },
            ACTOR
          );
        }
      );

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              bill_date:
                '2026-02-30'
            },
            ACTOR
          );
        }
      );

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              due_date:
                addDays(
                  createdBill.bill_date,
                  -1
                )
            },
            ACTOR
          );
        }
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByDateRange(
              createdBill.bill_date,
              createdBill.bill_date
            ),
          'bill_id',
          createdBill.bill_id
        ),
        'Date-range query did not return bill.'
      );

      assertTrue(
        containsId(
          UtilityService
            .getBillsByBillingPeriod(
              createdBill.billing_period_start,
              createdBill.billing_period_end
            ),
          'bill_id',
          createdBill.bill_id
        ),
        'Billing-period query did not return bill.'
      );

      return createdBill.bill_date;
    }
  );

  // ---------------------------------------------------------------------------
  // 17. Payment lifecycle
  // ---------------------------------------------------------------------------

  test(
    'Utility bill payment lifecycle',
    function () {

      let paid =
        UtilityService.markBillPaid(
          createdBill.bill_id,
          todayString(),
          ACTOR
        );

      assertEqual(
        upper(paid.payment_status),
        'PAID',
        'Bill did not become PAID.'
      );

      assertTrue(
        !isBlank(
          paid.paid_date
        ),
        'PAID bill has no paid_date.'
      );

      let pending =
        UtilityService.markBillPending(
          createdBill.bill_id,
          ACTOR
        );

      assertEqual(
        upper(
          pending.payment_status
        ),
        'PENDING',
        'Bill did not return to PENDING.'
      );

      assertTrue(
        isBlank(
          pending.paid_date
        ),
        'PENDING bill retained paid_date.'
      );

      assertThrows(
        function () {
          UtilityService.updateBill(
            createdBill.bill_id,
            {
              payment_status:
                'PAID',

              paid_date:
                ''
            },
            ACTOR
          );
        },
        'paid_date'
      );

      createdBill = pending;

      return 'PAID -> PENDING verified';
    }
  );

  // ---------------------------------------------------------------------------
  // 18. Pending / overdue / upcoming
  // ---------------------------------------------------------------------------

  test(
    'Pending, overdue, and upcoming bill queries',
    function () {

      assertTrue(
        containsId(
          UtilityService
            .getPendingBills(),
          'bill_id',
          createdBill.bill_id
        ),
        'Pending query did not return test bill.'
      );

      const beforeDue =
        addDays(
          createdBill.due_date,
          -1
        );

      assertTrue(
        containsId(
          UtilityService
            .getUpcomingDueBills(
              2,
              beforeDue
            ),
          'bill_id',
          createdBill.bill_id
        ),
        'Upcoming-due query did not return test bill.'
      );

      const afterDue =
        addDays(
          createdBill.due_date,
          1
        );

      assertTrue(
        containsId(
          UtilityService
            .getOverdueBills(
              afterDue
            ),
          'bill_id',
          createdBill.bill_id
        ),
        'Overdue query did not return test bill.'
      );

      return 'Pending/upcoming/overdue verified';
    }
  );

  // ---------------------------------------------------------------------------
  // 19. Currency-safe reporting
  // ---------------------------------------------------------------------------

  test(
    'Currency-safe utility reporting',
    function () {

      const byUnit =
        UtilityService
          .getUtilityCostByUnit(
            unit.unit_id,
            createdBill.bill_date,
            createdBill.bill_date
          );

      assertTrue(
        !isBlank(
          byUnit.currency
        ),
        'Unit cost did not return currency.'
      );

      assertNumber(
        byUnit.total,
        'Unit cost total is not numeric.'
      );

      const byProperty =
        UtilityService
          .getUtilityCostByProperty(
            property.property_id,
            createdBill.bill_date,
            createdBill.bill_date
          );

      assertTrue(
        !isBlank(
          byProperty.currency
        ),
        'Property cost did not return currency.'
      );

      assertNumber(
        byProperty.total,
        'Property cost total is not numeric.'
      );

      const byType =
        UtilityService
          .getUtilityCostByType(
            utilityType,
            createdBill.bill_date,
            createdBill.bill_date
          );

      assertTrue(
        byType.some(
          row =>
            upper(row.currency) ===
            upper(currency)
        ),
        'Utility-type aggregation did not include ' +
          currency +
          '.'
      );

      return (
        byUnit.currency +
        ' ' +
        byUnit.total
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 20. Monthly summary
  // ---------------------------------------------------------------------------

  test(
    'Monthly utility summary',
    function () {

      const parts =
        createdBill.bill_date
          .split('-')
          .map(Number);

      const summary =
        UtilityService
          .getMonthlyUtilitySummary(
            parts[0],
            parts[1],
            property.property_id
          );

      assertTrue(
        summary.some(
          row =>
            upper(
              row.utility_type
            ) ===
              upper(
                utilityType
              ) &&
            upper(
              row.currency
            ) ===
              upper(
                currency
              )
        ),
        'Monthly summary did not include test utility.'
      );

      return (
        parts[0] +
        '-' +
        String(parts[1])
          .padStart(
            2,
            '0'
          )
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 21. Existing bill financial behavior
  // ---------------------------------------------------------------------------

  test(
    'Existing utility bill totals remain consistent',
    function () {

      const bill1 =
        UtilityService.getBillById(
          'BILL-000001'
        );

      const bill2 =
        UtilityService.getBillById(
          'BILL-000002'
        );

      assertTrue(
        bill1 &&
        bill2,
        'Existing paid bill fixtures are missing.'
      );

      assertEqual(
        Number(
          bill1.amount
        ) +
        Number(
          bill1.tax_amount
        ),
        Number(
          bill1.total_amount
        ),
        'BILL-000001 total is inconsistent.'
      );

      assertEqual(
        Number(
          bill2.amount
        ) +
        Number(
          bill2.tax_amount
        ),
        Number(
          bill2.total_amount
        ),
        'BILL-000002 total is inconsistent.'
      );

      assertEqual(
        Number(
          bill1.total_amount
        ),
        1425,
        'Unexpected BILL-000001 total.'
      );

      assertEqual(
        Number(
          bill2.total_amount
        ),
        399,
        'Unexpected BILL-000002 total.'
      );

      return 'BILL-000001=1425 | BILL-000002=399';
    }
  );

  // ---------------------------------------------------------------------------
  // 22. No automatic expense creation
  // ---------------------------------------------------------------------------

  test(
    'Utility service does not expose automatic expense synchronization',
    function () {

      assertTrue(
        typeof UtilityService
          .createExpense !==
          'function',
        'UtilityService should not expose createExpense().'
      );

      assertTrue(
        typeof UtilityService
          .syncExpense !==
          'function',
        'UtilityService should not expose syncExpense().'
      );

      assertTrue(
        typeof UtilityService
          .createExpenseForBill !==
          'function',
        'UtilityService should not automatically create expenses.'
      );

      return 'Bill and expense domains remain separated';
    }
  );

  // ---------------------------------------------------------------------------
  // 23. No hard delete API
  // ---------------------------------------------------------------------------

  test(
    'No hard-delete utility or bill API',
    function () {

      assertTrue(
        typeof UtilityService
          .deleteUtility !==
          'function',
        'deleteUtility() must not exist.'
      );

      assertTrue(
        typeof UtilityService
          .removeUtility !==
          'function',
        'removeUtility() must not exist.'
      );

      assertTrue(
        typeof UtilityService
          .deleteBill !==
          'function',
        'deleteBill() must not exist.'
      );

      assertTrue(
        typeof UtilityService
          .removeBill !==
          'function',
        'removeBill() must not exist.'
      );

      return 'Operational/financial history protected';
    }
  );

  // ---------------------------------------------------------------------------
  // 24. Integrity helpers
  // ---------------------------------------------------------------------------

  test(
    'Integrity helpers do not flag test records',
    function () {

      const utilityId =
        createdUtility.utility_id;

      const billId =
        createdBill.bill_id;

      const utilityChecks = [
        [
          'findOrphanUtilityPropertyLinks',
          'utility_id'
        ],
        [
          'findOrphanUtilityUnitLinks',
          'utility_id'
        ],
        [
          'findUtilityPropertyUnitMismatches',
          'utility_id'
        ],
        [
          'findInvalidUtilityTypes',
          'utility_id'
        ],
        [
          'findInvalidUtilityFrequencies',
          'utility_id'
        ],
        [
          'findInvalidUtilityCurrencies',
          'utility_id'
        ],
        [
          'findInvalidUtilityStatuses',
          'utility_id'
        ],
        [
          'findDuplicateUtilityIds',
          'utility_id'
        ],
        [
          'findDuplicateUtilityAccountsOrMeters',
          'utility_id'
        ]
      ];

      utilityChecks.forEach(
        item => {
          const method = item[0];
          const field = item[1];

          const rows =
            UtilityService[method]();

          assertTrue(
            !containsId(
              rows,
              field,
              utilityId
            ),
            method +
            ' flagged test utility.'
          );
        }
      );

      const billChecks = [
        [
          'findOrphanBillUtilityLinks',
          'bill_id'
        ],
        [
          'findInvalidBillingPeriods',
          'bill_id'
        ],
        [
          'findDuplicateBillPeriods',
          'bill_id'
        ],
        [
          'findInvalidBillAmounts',
          'bill_id'
        ],
        [
          'findInvalidPaymentStatuses',
          'bill_id'
        ],
        [
          'findInvalidBillDates',
          'bill_id'
        ],
        [
          'findPaymentDateInconsistencies',
          'bill_id'
        ],
        [
          'findDuplicateBillIds',
          'bill_id'
        ]
      ];

      billChecks.forEach(
        item => {
          const method = item[0];
          const field = item[1];

          const rows =
            UtilityService[method]();

          assertTrue(
            !containsId(
              rows,
              field,
              billId
            ),
            method +
            ' flagged test bill.'
          );
        }
      );

      return (
        utilityChecks.length +
        billChecks.length +
        ' integrity helpers verified'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // 25. ID sequences
  // ---------------------------------------------------------------------------

  test(
    'Utility and bill ID sequences are synchronized',
    function () {

      const utilityStatus =
        IdService.getSequenceStatus(
          'UTILITY'
        );

      const billStatus =
        IdService.getSequenceStatus(
          'UTILITY_BILL'
        );

      assertTrue(
        utilityStatus &&
        utilityStatus.valid === true,
        'UTILITY ID sequence is not valid.'
      );

      assertTrue(
        billStatus &&
        billStatus.valid === true,
        'UTILITY_BILL ID sequence is not valid.'
      );

      assertTrue(
        Number(
          utilityStatus.stored_sequence
        ) >=
        Number(
          utilityStatus.sheet_max_sequence
        ),
        'UTILITY sequence is behind sheet maximum.'
      );

      assertTrue(
        Number(
          billStatus.stored_sequence
        ) >=
        Number(
          billStatus.sheet_max_sequence
        ),
        'UTILITY_BILL sequence is behind sheet maximum.'
      );

      return (
        'UTILITY stored=' +
        utilityStatus.stored_sequence +
        ' sheetMax=' +
        utilityStatus.sheet_max_sequence +
        ' | UTILITY_BILL stored=' +
        billStatus.stored_sequence +
        ' sheetMax=' +
        billStatus.sheet_max_sequence
      );
    }
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  Logger.log(
    '============================================================'
  );
  Logger.log(
    'UTILITY SERVICE TEST SUMMARY'
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

  if (createdUtility) {
    Logger.log(
      'TEST UTILITY: ' +
        createdUtility.utility_id
    );
    Logger.log(
      'PROPERTY: ' +
        createdUtility.property_id
    );
    Logger.log(
      'UNIT: ' +
        createdUtility.unit_id
    );
    Logger.log(
      'TYPE: ' +
        createdUtility.utility_type
    );
  }

  if (createdBill) {
    Logger.log(
      'TEST BILL: ' +
        createdBill.bill_id
    );
    Logger.log(
      'BILL TOTAL: ' +
        createdBill.total_amount +
        ' ' +
        currency
    );
    Logger.log(
      'PAYMENT STATUS: ' +
        createdBill.payment_status
    );
  }

  Logger.log(
    '============================================================'
  );

  if (failed > 0) {
    throw new Error(
      'UTILITY SERVICE TEST FAILED. ' +
      failed +
      ' test(s) failed.'
    );
  }

  return {
    passed: passed,
    failed: failed,
    total: passed + failed,
    utility_id:
      createdUtility
        ? createdUtility.utility_id
        : '',
    bill_id:
      createdBill
        ? createdBill.bill_id
        : ''
  };
}
