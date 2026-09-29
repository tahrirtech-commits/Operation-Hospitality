/**
 * testUtilityService_resume_safe.gs
 *
 * Resume-safe acceptance/regression test after the first UtilityService run.
 *
 * Reuses:
 *   UTL-000005  - acceptance utility
 *   BILL-000004 - acceptance bill
 *
 * Recognizes:
 *   BILL-000005 - accidental duplicate created by the pre-patch test.
 *
 * This test creates NO new utility or bill records.
 */
function testUtilityServiceResumeSafe() {

  const ACTOR = 'SYSTEM';
  const TEST_UTILITY_ID = 'UTL-000005';
  const TEST_BILL_ID = 'BILL-000004';
  const KNOWN_DUPLICATE_BILL_ID = 'BILL-000005';

  let passed = 0;
  let failed = 0;

  let utility = null;
  let bill = null;

  const blank = v =>
    v === null ||
    v === undefined ||
    String(v).trim() === '';

  const text = v =>
    blank(v) ? '' : String(v).trim();

  const upper = v =>
    text(v).toUpperCase();

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
      throw new Error(message || ('Expected numeric value: ' + value));
    }
  }

  function assertThrows(fn, contains) {
    let threw = false;
    let message = '';

    try {
      fn();
    } catch (error) {
      threw = true;
      message = error && error.message
        ? String(error.message)
        : String(error);
    }

    if (!threw) {
      throw new Error('Expected function to throw an error.');
    }

    if (
      !blank(contains) &&
      message.toLowerCase().indexOf(
        String(contains).toLowerCase()
      ) === -1
    ) {
      throw new Error(
        'Expected error containing "' +
        contains +
        '", received "' +
        message +
        '".'
      );
    }

    return message;
  }

  function containsId(rows, field, id) {
    return (rows || []).some(
      row => text(row[field]) === text(id)
    );
  }

  function dateValue(value) {
    if (
      Object.prototype.toString.call(value) === '[object Date]' &&
      !isNaN(value.getTime())
    ) {
      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE || Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
    }

    return text(value);
  }

  function addDays(dateText, days) {
    const parts = dateText.split('-').map(Number);
    const d = new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2])
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

  function pass(name, detail) {
    passed++;

    Logger.log(
      'PASSED | ' +
      name +
      (blank(detail) ? '' : ' | ' + detail)
    );
  }

  function fail(name, error) {
    failed++;

    Logger.log(
      'FAILED | ' +
      name +
      ' | ' +
      (
        error && error.message
          ? error.message
          : String(error)
      )
    );
  }

  function test(name, fn) {
    try {
      pass(name, fn());
    } catch (error) {
      fail(name, error);
    }
  }

  Logger.log('============================================================');
  Logger.log('UTILITY SERVICE RESUME-SAFE TEST');
  Logger.log('============================================================');

  // -------------------------------------------------------------------------
  // 1. Public API
  // -------------------------------------------------------------------------

  test('Public API', function () {

    const required = [
      'getUtilityById',
      'getBillById',
      'updateUtility',
      'updateBill',
      'changeUtilityStatus',
      'markBillPaid',
      'markBillPending',
      'getBillsByUtility',
      'getBillsByUnit',
      'getBillsByProperty',
      'getBillsByPaymentStatus',
      'getBillsByDateRange',
      'getBillsByBillingPeriod',
      'getPendingBills',
      'getOverdueBills',
      'getUpcomingDueBills',
      'getUtilityCostByProperty',
      'getUtilityCostByUnit',
      'getUtilityCostByType',
      'getMonthlyUtilitySummary',
      'findDuplicateBillPeriods',
      'findInvalidBillingPeriods',
      'findInvalidBillAmounts',
      'findInvalidPaymentStatuses',
      'findInvalidBillDates',
      'findPaymentDateInconsistencies'
    ];

    required.forEach(name => {
      assertTrue(
        typeof UtilityService[name] === 'function',
        'Missing UtilityService.' + name + '().'
      );
    });

    return required.length + ' required functions available';
  });

  // -------------------------------------------------------------------------
  // 2. Recover existing acceptance utility
  // -------------------------------------------------------------------------

  test('Recover UTL-000005', function () {

    utility =
      UtilityService.getUtilityById(
        TEST_UTILITY_ID
      );

    assertTrue(
      utility,
      TEST_UTILITY_ID + ' not found.'
    );

    assertEqual(
      upper(utility.status),
      'ACTIVE',
      'Acceptance utility should be ACTIVE.'
    );

    return (
      utility.utility_id +
      ' | ' +
      utility.property_id +
      ' | ' +
      utility.unit_id
    );
  });

  // -------------------------------------------------------------------------
  // 3. Recover existing acceptance bill
  // -------------------------------------------------------------------------

  test('Recover BILL-000004', function () {

    bill =
      UtilityService.getBillById(
        TEST_BILL_ID
      );

    assertTrue(
      bill,
      TEST_BILL_ID + ' not found.'
    );

    assertEqual(
      text(bill.utility_id),
      TEST_UTILITY_ID,
      'Acceptance bill belongs to unexpected utility.'
    );

    assertEqual(
      Number(bill.total_amount),
      114,
      'Acceptance bill total changed.'
    );

    return (
      bill.bill_id +
      ' | total=' +
      bill.total_amount
    );
  });

  // -------------------------------------------------------------------------
  // 4. Confirm Sheets returned date normalization scenario
  // -------------------------------------------------------------------------

  test('Canonical bill dates are recoverable', function () {

    const start =
      dateValue(
        bill.billing_period_start
      );

    const end =
      dateValue(
        bill.billing_period_end
      );

    const billDate =
      dateValue(
        bill.bill_date
      );

    const dueDate =
      dateValue(
        bill.due_date
      );

    [start, end, billDate, dueDate]
      .forEach(value => {
        assertTrue(
          /^\d{4}-\d{2}-\d{2}$/.test(value),
          'Date did not normalize: ' + value
        );
      });

    return (
      start +
      ' -> ' +
      end +
      ' | bill=' +
      billDate +
      ' | due=' +
      dueDate
    );
  });

  // -------------------------------------------------------------------------
  // 5. Duplicate billing-period protection - key patch regression
  // -------------------------------------------------------------------------

  test('Patched duplicate billing-period protection', function () {

    assertThrows(
      function () {
        UtilityService.createBill(
          {
            utility_id:
              TEST_UTILITY_ID,

            billing_period_start:
              dateValue(
                bill.billing_period_start
              ),

            billing_period_end:
              dateValue(
                bill.billing_period_end
              ),

            bill_date:
              dateValue(
                bill.bill_date
              ),

            due_date:
              dateValue(
                bill.due_date
              ),

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
              'Resume-safe duplicate protection test'
          },
          ACTOR
        );
      },
      'Duplicate utility billing period'
    );

    return 'No new duplicate bill created';
  });

  // -------------------------------------------------------------------------
  // 6. Verify sequence did NOT advance during duplicate rejection
  // -------------------------------------------------------------------------

  test('Duplicate rejection does not consume a bill ID', function () {

    const status =
      IdService.getSequenceStatus(
        'UTILITY_BILL'
      );

    assertTrue(
      status &&
      status.valid === true,
      'UTILITY_BILL sequence is invalid.'
    );

   assertTrue(
      Number(status.stored_sequence) >=
        Number(status.sheet_max_sequence),
      'UTILITY_BILL sequence is behind sheet maximum.'
   );

    return (
      'stored=' +
      status.stored_sequence +
      ' sheetMax=' +
      status.sheet_max_sequence
    );
  });

  // -------------------------------------------------------------------------
  // 7. Bill date-range query - patch regression
  // -------------------------------------------------------------------------

  test('Patched bill-date range query', function () {

    const d =
      dateValue(
        bill.bill_date
      );

    const rows =
      UtilityService.getBillsByDateRange(
        d,
        d
      );

    assertTrue(
      containsId(
        rows,
        'bill_id',
        TEST_BILL_ID
      ),
      TEST_BILL_ID +
      ' not returned by exact bill-date query.'
    );

    return d;
  });

  // -------------------------------------------------------------------------
  // 8. Billing-period query - patch regression
  // -------------------------------------------------------------------------

  test('Patched billing-period query', function () {

    const rows =
      UtilityService.getBillsByBillingPeriod(
        dateValue(
          bill.billing_period_start
        ),
        dateValue(
          bill.billing_period_end
        )
      );

    assertTrue(
      containsId(
        rows,
        'bill_id',
        TEST_BILL_ID
      ),
      TEST_BILL_ID +
      ' not returned by billing-period query.'
    );

    return (
      dateValue(
        bill.billing_period_start
      ) +
      ' -> ' +
      dateValue(
        bill.billing_period_end
      )
    );
  });

  // -------------------------------------------------------------------------
  // 9. Pending query
  // -------------------------------------------------------------------------

  test('Pending bill query', function () {

    bill =
      UtilityService.markBillPending(
        TEST_BILL_ID,
        ACTOR
      );

    const rows =
      UtilityService.getPendingBills();

    assertTrue(
      containsId(
        rows,
        'bill_id',
        TEST_BILL_ID
      ),
      TEST_BILL_ID +
      ' not returned as pending.'
    );

    return 'PENDING';
  });

  // -------------------------------------------------------------------------
  // 10. Upcoming due query - patch regression
  // -------------------------------------------------------------------------

  test('Patched upcoming-due query', function () {

    const due =
      dateValue(
        bill.due_date
      );

    const asOf =
      addDays(
        due,
        -1
      );

    const rows =
      UtilityService.getUpcomingDueBills(
        2,
        asOf
      );

    assertTrue(
      containsId(
        rows,
        'bill_id',
        TEST_BILL_ID
      ),
      TEST_BILL_ID +
      ' not returned as upcoming.'
    );

    return (
      'asOf=' +
      asOf +
      ' due=' +
      due
    );
  });

  // -------------------------------------------------------------------------
  // 11. Overdue query - patch regression
  // -------------------------------------------------------------------------

  test('Patched overdue query', function () {

    const due =
      dateValue(
        bill.due_date
      );

    const asOf =
      addDays(
        due,
        1
      );

    const rows =
      UtilityService.getOverdueBills(
        asOf
      );

    assertTrue(
      containsId(
        rows,
        'bill_id',
        TEST_BILL_ID
      ),
      TEST_BILL_ID +
      ' not returned as overdue.'
    );

    return (
      'asOf=' +
      asOf +
      ' due=' +
      due
    );
  });

  // -------------------------------------------------------------------------
  // 12. Unit reporting - patch regression
  // -------------------------------------------------------------------------

  test('Patched unit cost reporting', function () {

    const d =
      dateValue(
        bill.bill_date
      );

    const result =
      UtilityService.getUtilityCostByUnit(
        utility.unit_id,
        d,
        d
      );

    assertTrue(
      !blank(result.currency),
      'Unit cost did not return currency.'
    );

    assertNumber(
      result.total,
      'Unit cost total is not numeric.'
    );

    assertTrue(
      Number(result.total) >=
        Number(bill.total_amount),
      'Unit total does not include acceptance bill.'
    );

    return (
      result.currency +
      ' ' +
      result.total
    );
  });

  // -------------------------------------------------------------------------
  // 13. Property reporting
  // -------------------------------------------------------------------------

  test('Patched property cost reporting', function () {

    const d =
      dateValue(
        bill.bill_date
      );

    const result =
      UtilityService.getUtilityCostByProperty(
        utility.property_id,
        d,
        d
      );

    assertTrue(
      !blank(result.currency),
      'Property cost did not return currency.'
    );

    assertNumber(
      result.total,
      'Property cost total is not numeric.'
    );

    assertTrue(
      Number(result.total) >=
        Number(bill.total_amount),
      'Property total does not include acceptance bill.'
    );

    return (
      result.currency +
      ' ' +
      result.total
    );
  });

  // -------------------------------------------------------------------------
  // 14. Type reporting
  // -------------------------------------------------------------------------

  test('Patched utility-type reporting', function () {

    const d =
      dateValue(
        bill.bill_date
      );

    const rows =
      UtilityService.getUtilityCostByType(
        utility.utility_type,
        d,
        d
      );

    const currencyRow =
      rows.find(
        row =>
          upper(row.currency) ===
          upper(utility.currency)
      );

    assertTrue(
      currencyRow,
      'Utility-type report did not return ' +
      utility.currency +
      '.'
    );

    assertNumber(
      currencyRow.total,
      'Utility-type total is not numeric.'
    );

    return (
      utility.utility_type +
      ' | ' +
      currencyRow.currency +
      ' ' +
      currencyRow.total
    );
  });

  // -------------------------------------------------------------------------
  // 15. Monthly summary
  // -------------------------------------------------------------------------

  test('Monthly utility summary still works', function () {

    const d =
      dateValue(
        bill.bill_date
      );

    const parts =
      d.split('-').map(Number);

    const rows =
      UtilityService.getMonthlyUtilitySummary(
        parts[0],
        parts[1],
        utility.property_id
      );

    assertTrue(
      rows.some(
        row =>
          upper(row.utility_type) ===
            upper(utility.utility_type) &&
          upper(row.currency) ===
            upper(utility.currency)
      ),
      'Monthly summary does not include acceptance utility.'
    );

    return (
      parts[0] +
      '-' +
      String(parts[1]).padStart(2, '0')
    );
  });

  // -------------------------------------------------------------------------
  // 16. Payment lifecycle after patch
  // -------------------------------------------------------------------------

  test('Payment lifecycle remains valid', function () {

    let updated =
      UtilityService.markBillPaid(
        TEST_BILL_ID,
        dateValue(
          bill.bill_date
        ),
        ACTOR
      );

    assertEqual(
      upper(
        updated.payment_status
      ),
      'PAID',
      'Bill did not become PAID.'
    );

    assertTrue(
      !blank(
        updated.paid_date
      ),
      'Paid bill has no paid_date.'
    );

    updated =
      UtilityService.markBillPending(
        TEST_BILL_ID,
        ACTOR
      );

    assertEqual(
      upper(
        updated.payment_status
      ),
      'PENDING',
      'Bill did not return to PENDING.'
    );

    assertTrue(
      blank(
        updated.paid_date
      ),
      'Pending bill retained paid_date.'
    );

    bill = updated;

    return 'PAID -> PENDING';
  });

  // -------------------------------------------------------------------------
  // 17. Existing original bills still query correctly
  // -------------------------------------------------------------------------

  test('Original bills remain queryable by date', function () {

    const original =
      UtilityService.getBillById(
        'BILL-000001'
      );

    assertTrue(
      original,
      'BILL-000001 not found.'
    );

    const d =
      dateValue(
        original.bill_date
      );

    const rows =
      UtilityService.getBillsByDateRange(
        d,
        d
      );

    assertTrue(
      containsId(
        rows,
        'bill_id',
        'BILL-000001'
      ),
      'Original bill not returned by date query.'
    );

    return (
      'BILL-000001 | ' +
      d
    );
  });

  // -------------------------------------------------------------------------
  // 18. Known accidental duplicate is recognized
  // -------------------------------------------------------------------------

  test('Known pre-patch duplicate residue is recognized', function () {

    const duplicate =
      UtilityService.getBillById(
        KNOWN_DUPLICATE_BILL_ID
      );

    if (!duplicate) {
      return (
        KNOWN_DUPLICATE_BILL_ID +
        ' not present - no residue to recognize'
      );
    }

    assertEqual(
      text(duplicate.utility_id),
      TEST_UTILITY_ID,
      'Known duplicate belongs to unexpected utility.'
    );

    assertEqual(
      dateValue(
        duplicate.billing_period_start
      ),
      dateValue(
        bill.billing_period_start
      ),
      'Known duplicate start date differs.'
    );

    assertEqual(
      dateValue(
        duplicate.billing_period_end
      ),
      dateValue(
        bill.billing_period_end
      ),
      'Known duplicate end date differs.'
    );

    return (
      KNOWN_DUPLICATE_BILL_ID +
      ' recognized as pre-patch residue'
    );
  });

  // -------------------------------------------------------------------------
  // 19. Duplicate-period integrity detects historical residue
  // -------------------------------------------------------------------------

  test('Duplicate-period integrity detects historical residue', function () {

    const duplicate =
      UtilityService.getBillById(
        KNOWN_DUPLICATE_BILL_ID
      );

    const rows =
      UtilityService.findDuplicateBillPeriods();

    if (!duplicate) {
      assertTrue(
        !containsId(
          rows,
          'bill_id',
          TEST_BILL_ID
        ),
        'Acceptance bill unexpectedly flagged as duplicate.'
      );

      return 'No historical duplicate residue present';
    }

    assertTrue(
      containsId(
        rows,
        'bill_id',
        KNOWN_DUPLICATE_BILL_ID
      ),
      'Historical duplicate was not detected by integrity helper.'
    );

    return (
      KNOWN_DUPLICATE_BILL_ID +
      ' correctly detected'
    );
  });

  // -------------------------------------------------------------------------
  // 20. Acceptance utility integrity
  // -------------------------------------------------------------------------

  test('Acceptance utility passes integrity checks', function () {

    const checks = [
      'findOrphanUtilityPropertyLinks',
      'findOrphanUtilityUnitLinks',
      'findUtilityPropertyUnitMismatches',
      'findInvalidUtilityTypes',
      'findInvalidUtilityFrequencies',
      'findInvalidUtilityCurrencies',
      'findInvalidUtilityStatuses',
      'findDuplicateUtilityIds',
      'findDuplicateUtilityAccountsOrMeters'
    ];

    checks.forEach(method => {
      const rows =
        UtilityService[method]();

      assertTrue(
        !containsId(
          rows,
          'utility_id',
          TEST_UTILITY_ID
        ),
        method +
        ' flagged ' +
        TEST_UTILITY_ID +
        '.'
      );
    });

    return checks.length + ' utility checks clean';
  });

  // -------------------------------------------------------------------------
  // 21. Acceptance bill integrity except known duplicate-period condition
  // -------------------------------------------------------------------------

  test('Acceptance bill passes non-duplicate integrity checks', function () {

    const checks = [
      'findOrphanBillUtilityLinks',
      'findInvalidBillingPeriods',
      'findInvalidBillAmounts',
      'findInvalidPaymentStatuses',
      'findInvalidBillDates',
      'findPaymentDateInconsistencies',
      'findDuplicateBillIds'
    ];

    checks.forEach(method => {
      const rows =
        UtilityService[method]();

      assertTrue(
        !containsId(
          rows,
          'bill_id',
          TEST_BILL_ID
        ),
        method +
        ' flagged ' +
        TEST_BILL_ID +
        '.'
      );
    });

    return checks.length + ' bill checks clean';
  });

  // -------------------------------------------------------------------------
  // 22. No expense synchronization
  // -------------------------------------------------------------------------

  test('Expense synchronization remains disabled', function () {

    [
      'createExpense',
      'syncExpense',
      'createExpenseForBill'
    ].forEach(name => {
      assertTrue(
        typeof UtilityService[name] !==
          'function',
        name +
        '() should not exist.'
      );
    });

    return 'Utility and expense domains separated';
  });

  // -------------------------------------------------------------------------
  // 23. No hard-delete API
  // -------------------------------------------------------------------------

  test('No hard-delete API', function () {

    [
      'deleteUtility',
      'removeUtility',
      'deleteBill',
      'removeBill'
    ].forEach(name => {
      assertTrue(
        typeof UtilityService[name] !==
          'function',
        name +
        '() should not exist.'
      );
    });

    return 'History protected';
  });

  // -------------------------------------------------------------------------
  // 24. Utility sequence
  // -------------------------------------------------------------------------

  test('UTILITY sequence is synchronized', function () {

    const status =
      IdService.getSequenceStatus(
        'UTILITY'
      );

    assertTrue(
      status &&
      status.valid === true,
      'UTILITY sequence invalid.'
    );

    assertTrue(
      Number(status.stored_sequence) >=
      Number(status.sheet_max_sequence),
      'UTILITY sequence behind sheet maximum.'
    );

    return (
      'stored=' +
      status.stored_sequence +
      ' sheetMax=' +
      status.sheet_max_sequence
    );
  });

  // -------------------------------------------------------------------------
  // 25. Bill sequence
  // -------------------------------------------------------------------------

  test('UTILITY_BILL sequence is synchronized', function () {

    const status =
      IdService.getSequenceStatus(
        'UTILITY_BILL'
      );

    assertTrue(
      status &&
      status.valid === true,
      'UTILITY_BILL sequence invalid.'
    );

    assertTrue(
      Number(status.stored_sequence) >=
      Number(status.sheet_max_sequence),
      'UTILITY_BILL sequence behind sheet maximum.'
    );

    return (
      'stored=' +
      status.stored_sequence +
      ' sheetMax=' +
      status.sheet_max_sequence
    );
  });

  Logger.log('============================================================');
  Logger.log('UTILITY SERVICE RESUME-SAFE TEST SUMMARY');
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log('TOTAL: ' + (passed + failed));
  Logger.log('UTILITY: ' + TEST_UTILITY_ID);
  Logger.log('BILL: ' + TEST_BILL_ID);

  const duplicate =
    UtilityService.getBillById(
      KNOWN_DUPLICATE_BILL_ID
    );

  Logger.log(
    'KNOWN PRE-PATCH DUPLICATE: ' +
    (
      duplicate
        ? KNOWN_DUPLICATE_BILL_ID + ' PRESENT'
        : 'NOT PRESENT'
    )
  );

  Logger.log('============================================================');

  if (failed > 0) {
    throw new Error(
      'UTILITY SERVICE RESUME-SAFE TEST FAILED. ' +
      failed +
      ' test(s) failed.'
    );
  }

  return {
    passed,
    failed,
    total: passed + failed,
    utility_id: TEST_UTILITY_ID,
    bill_id: TEST_BILL_ID,
    known_duplicate_bill_id:
      duplicate
        ? KNOWN_DUPLICATE_BILL_ID
        : ''
  };
}
