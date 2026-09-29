/**
 * ============================================================================
 * testAdminFinanceService.gs
 * PHASE 6.4 - ADMIN FINANCE FACADE ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 * No expense, utility, bill or internet records are created/updated.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testAdminFinanceService() {

  Logger.log('===== PHASE 6.4 ADMIN FINANCE SERVICE TEST START =====');

  const results = [];

  function pass(name, detail) {
    results.push({name:name, passed:true, detail:detail || ''});
    Logger.log('PASS: ' + name + (detail ? ' | ' + detail : ''));
  }

  function fail(name, err) {
    const msg = err && err.message ? err.message : String(err);
    results.push({name:name, passed:false, detail:msg});
    Logger.log('FAIL: ' + name + ' | ' + msg);
  }

  function assertTrue(v, msg) {
    if (!v) throw new Error(msg || 'Assertion failed.');
  }

  function assertEqual(expected, actual, msg) {
    if (String(expected) !== String(actual)) {
      throw new Error(
        (msg ? msg + ' | ' : '') +
        'Expected=' + expected + ', Actual=' + actual
      );
    }
  }

  function run(name, fn) {
    try { pass(name, fn() || ''); }
    catch (err) { fail(name, err); }
  }

  const properties = PropertyService.getAllProperties();
  assertTrue(properties.length > 0, 'No properties found.');

  const property = properties[0];
  const propertyId = property.property_id;
  const units = UnitService.getUnitsByProperty(propertyId);
  assertTrue(units.length > 0, 'No units found.');
  const unit = units[0];

  const startDate = '2026-01-01';
  const endDate = '2026-12-31';
  const asOfDate = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    CONFIG.DATE_FORMATS.DATE
  );

  Logger.log('Property: ' + propertyId);
  Logger.log('Unit: ' + unit.unit_id);
  Logger.log('Range: ' + startDate + ' -> ' + endDate);

  run('1. Public facade methods exist', () => {
    const methods = [
      'getFinanceOverview',
      'getUnitFinance',
      'listExpenses',
      'createExpense',
      'updateExpense',
      'listUtilities',
      'listUtilityBills',
      'getOverdueUtilityBills',
      'createUtility',
      'updateUtility',
      'changeUtilityStatus',
      'createUtilityBill',
      'updateUtilityBill',
      'markUtilityBillPaid',
      'markUtilityBillPending',
      'markUtilityBillRefunded',
      'listInternetServices',
      'getExpiringInternetContracts',
      'createInternetService',
      'updateInternetService',
      'activateInternetService',
      'deactivateInternetService'
    ];

    methods.forEach(name => assertTrue(
      typeof AdminFinanceService[name] === 'function',
      'Missing method: ' + name
    ));

    return methods.length + ' methods';
  });

  let overview;

  run('2. Finance overview loads', () => {
    overview = AdminFinanceService.getFinanceOverview(
      propertyId,
      startDate,
      endDate,
      asOfDate
    );

    assertEqual(propertyId, overview.property.property_id);
    assertTrue(Array.isArray(overview.expenses.rows));
    assertTrue(Array.isArray(overview.utilities.services));
    assertTrue(Array.isArray(overview.utilities.bills));
    assertTrue(Array.isArray(overview.internet.services));

    return 'expenses=' + overview.expenses.rows.length +
      ', utilities=' + overview.utilities.services.length +
      ', bills=' + overview.utilities.bills.length +
      ', internet=' + overview.internet.services.length;
  });

  run('3. Expense rows match ExpenseService', () => {
    const expected = ExpenseService.getByPropertyAndDateRange(
      propertyId,
      startDate,
      endDate
    );

    assertEqual(expected.length, overview.expenses.rows.length);
    return 'expenses=' + expected.length;
  });

  run('4. Expense currency totals match authoritative service', () => {
    const expected = ExpenseService.summarizeByCurrency(
      overview.expenses.rows
    );

    assertEqual(
      JSON.stringify(expected),
      JSON.stringify(overview.expenses.totals_by_currency)
    );

    return JSON.stringify(expected);
  });

  run('5. Expense category totals match authoritative service', () => {
    const expected = ExpenseService.getTotalsByCategory(
      propertyId,
      startDate,
      endDate
    );

    assertEqual(
      JSON.stringify(expected),
      JSON.stringify(overview.expenses.totals_by_category)
    );

    return 'groups=' + expected.length;
  });

  run('6. Utility bills match property/date filter', () => {
    const expected = UtilityService.getBillsByProperty(propertyId)
      .filter(row => {
        const d = String(row.bill_date).trim();
        return d >= startDate && d <= endDate;
      });

    assertEqual(expected.length, overview.utilities.bills.length);
    return 'bills=' + expected.length;
  });

  run('7. Utility currency totals match authoritative service', () => {
    const expected = UtilityService.summarizeByCurrency(
      overview.utilities.bills
    );

    assertEqual(
      JSON.stringify(expected),
      JSON.stringify(overview.utilities.totals_by_currency)
    );

    return JSON.stringify(expected);
  });

  run('8. Internet fee summary matches authoritative service', () => {
    const expected = InternetService.getFeeSummaryByProperty(
      propertyId,
      false
    );

    assertEqual(
      JSON.stringify(expected),
      JSON.stringify(overview.internet.fee_summary)
    );

    return JSON.stringify(expected);
  });

  run('9. Accounting boundaries are explicit', () => {
    assertEqual(
      false,
      overview.accounting_boundary.utility_bills_are_operating_expenses
    );
    assertEqual(
      false,
      overview.accounting_boundary.internet_services_are_operating_expenses
    );
    assertEqual(
      false,
      overview.accounting_boundary.combined_grand_total_provided
    );

    assertTrue(
      !Object.prototype.hasOwnProperty.call(overview, 'grand_total'),
      'Unsafe grand_total exposed.'
    );

    return 'no double-counting / false grand total';
  });

  run('10. Unit finance is property isolated', () => {
    const result = AdminFinanceService.getUnitFinance(
      propertyId,
      unit.unit_id,
      startDate,
      endDate
    );

    assertEqual(unit.unit_id, result.unit.unit_id);

    result.expenses.rows.forEach(row =>
      assertEqual(unit.unit_id, row.unit_id)
    );

    result.utilities.services.forEach(row =>
      assertEqual(unit.unit_id, row.unit_id)
    );

    result.internet.services.forEach(row =>
      assertEqual(unit.unit_id, row.unit_id)
    );

    return unit.unit_id;
  });

  run('11. Expense list matches property filter', () => {
    const actual = AdminFinanceService.listExpenses({
      property_id: propertyId
    });
    const expected = ExpenseService.getByProperty(propertyId);

    assertEqual(expected.length, actual.length);
    return 'expenses=' + actual.length;
  });

  run('12. Utility list matches UtilityService', () => {
    const actual = AdminFinanceService.listUtilities(propertyId);
    const expected = UtilityService.getUtilitiesByProperty(propertyId);

    assertEqual(expected.length, actual.length);
    return 'utilities=' + actual.length;
  });

  run('13. Internet list matches InternetService', () => {
    const actual = AdminFinanceService.listInternetServices(
      propertyId,
      false
    );
    const expected = InternetService.getByProperty(propertyId);

    assertEqual(expected.length, actual.length);
    return 'services=' + actual.length;
  });

  run('14. Active internet filtering works', () => {
    const actual = AdminFinanceService.listInternetServices(
      propertyId,
      true
    );

    actual.forEach(row =>
      assertEqual('ACTIVE', String(row.status).toUpperCase())
    );

    return 'active=' + actual.length;
  });

  run('15. Invalid property is rejected', () => {
    let rejected = false;
    try {
      AdminFinanceService.getFinanceOverview(
        'PROP-999999',
        startDate,
        endDate,
        asOfDate
      );
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Invalid property was not rejected.');
    return 'rejected';
  });

  run('16. Property/unit mismatch is rejected', () => {
    let rejected = false;
    try {
      AdminFinanceService.getUnitFinance(
        'PROP-999999',
        unit.unit_id,
        startDate,
        endDate
      );
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Invalid property/unit context not rejected.');
    return 'rejected';
  });

  run('17. Partial expense date range is rejected', () => {
    let rejected = false;
    try {
      AdminFinanceService.listExpenses({
        property_id: propertyId,
        start_date: startDate
      });
    } catch (err) {
      rejected = true;
    }

    assertTrue(rejected, 'Partial date range was not rejected.');
    return 'rejected';
  });

  run('18. Expense dependency contract exists', () => {
    [
      'createExpense',
      'updateExpense',
      'getByPropertyAndDateRange',
      'getByUnitAndDateRange',
      'summarizeByCurrency',
      'getTotalsByCategory',
      'getTotalsByUnit',
      'validateDateRange'
    ].forEach(name => assertTrue(
      typeof ExpenseService[name] === 'function',
      'Missing ExpenseService.' + name
    ));

    return 'contract verified';
  });

  run('19. Utility dependency contract exists', () => {
    [
      'createUtility',
      'updateUtility',
      'changeUtilityStatus',
      'createBill',
      'updateBill',
      'markBillPaid',
      'markBillPending',
      'markBillRefunded',
      'getUtilitiesByProperty',
      'getBillsByProperty',
      'getOverdueBills',
      'summarizeByCurrency'
    ].forEach(name => assertTrue(
      typeof UtilityService[name] === 'function',
      'Missing UtilityService.' + name
    ));

    return 'contract verified';
  });

  run('20. Internet dependency contract exists', () => {
    [
      'createInternetService',
      'updateInternetService',
      'activate',
      'deactivate',
      'getByProperty',
      'getByUnit',
      'getContractsExpiringWithin',
      'getFeeSummaryByProperty',
      'getFeeSummaryByUnit'
    ].forEach(name => assertTrue(
      typeof InternetService[name] === 'function',
      'Missing InternetService.' + name
    ));

    return 'contract verified';
  });

  run('21. Facade does not expose combined finance total', () => {
    [
      'getGrandTotal',
      'getCombinedTotal',
      'syncUtilityBillToExpense',
      'syncInternetToExpense'
    ].forEach(name => assertTrue(
      typeof AdminFinanceService[name] === 'undefined',
      'Unsafe method exposed: ' + name
    ));

    return 'accounting boundary verified';
  });

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  Logger.log('===== PHASE 6.4 ADMIN FINANCE SERVICE TEST SUMMARY =====');
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log(JSON.stringify(results, null, 2));
  Logger.log('===== PHASE 6.4 ADMIN FINANCE SERVICE TEST END =====');

  if (failed > 0) {
    throw new Error(
      'Phase 6.4 AdminFinanceService acceptance failed. FAILED=' + failed
    );
  }

  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    property_id: propertyId
  };
}

