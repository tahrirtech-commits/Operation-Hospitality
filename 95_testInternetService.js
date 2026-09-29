/**
 * testInternetService.gs
 *
 * Acceptance / regression test for 62_InternetService.gs.
 *
 * Expected prerequisites:
 *   CONFIG.SHEETS.INTERNET_SERVICES = '26_InternetServices'
 *   CONFIG.ID_PREFIXES.INTERNET_SERVICE = 'INT'
 *
 *   IdService managed entity:
 *   {
 *     type: 'INTERNET_SERVICE',
 *     sheet: CONFIG.SHEETS.INTERNET_SERVICES,
 *     field: 'internet_service_id'
 *   }
 *
 * Reference data:
 *   FREQUENCY should include MONTHLY.
 *
 * Existing baseline expected:
 *   INT-000001
 *   INT-000002
 *   INT-000003
 *
 * This test is non-destructive toward existing records.
 * It creates one permanent acceptance fixture (normally INT-000004).
 */
function testInternetService() {

  const ACTOR = 'SYSTEM';

  let passed = 0;
  let failed = 0;

  let property = null;
  let unit = null;
  let created = null;
  let frequency = '';

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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
      throw new Error(
        message ||
        ('Expected numeric value, got: ' + value)
      );
    }
  }

  function assertThrows(fn, contains) {
    let threw = false;
    let message = '';

    try {
      fn();
    } catch (error) {
      threw = true;
      message =
        error && error.message
          ? String(error.message)
          : String(error);
    }

    if (!threw) {
      throw new Error(
        'Expected function to throw an error.'
      );
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

  function containsId(rows, id) {
    return (rows || []).some(
      row =>
        text(row.internet_service_id) ===
        text(id)
    );
  }

  function pass(name, detail) {
    passed++;

    Logger.log(
      'PASSED | ' +
      name +
      (
        blank(detail)
          ? ''
          : ' | ' + detail
      )
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

  function referenceValues(category) {

    return BaseRepository
      .findAll(
        CONFIG.SHEETS.REFERENCE_DATA
      )
      .filter(
        row =>
          upper(row.category) ===
            upper(category) &&
          upper(row.active) !==
            'FALSE'
      )
      .map(
        row =>
          upper(row.code)
      )
      .filter(Boolean);
  }

  function preferredReference(
    category,
    preferred
  ) {

    const values =
      referenceValues(category);

    for (
      let i = 0;
      i < preferred.length;
      i++
    ) {
      const value =
        upper(preferred[i]);

      if (
        values.indexOf(value) !== -1
      ) {
        return value;
      }
    }

    return values.length
      ? values[0]
      : '';
  }

  function chooseFixture() {

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

      const candidateUnit =
        units[i];

      const candidateProperty =
        properties.find(
          p =>
            text(p.property_id) ===
            text(
              candidateUnit.property_id
            )
        );

      if (candidateProperty) {
        return {
          property:
            candidateProperty,
          unit:
            candidateUnit
        };
      }
    }

    throw new Error(
      'No valid property/unit fixture found.'
    );
  }

  function chooseCrossPropertyUnit() {

    const units =
      BaseRepository.findAll(
        CONFIG.SHEETS.UNITS
      );

    return units.find(
      candidate =>
        text(candidate.property_id) !==
        text(property.property_id)
    ) || null;
  }

  function dateValue(value) {

    if (
      Object.prototype.toString.call(value) ===
        '[object Date]' &&
      !isNaN(value.getTime())
    ) {
      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE ||
          Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
    }

    return text(value);
  }

  Logger.log(
    '============================================================'
  );
  Logger.log(
    'INTERNET SERVICE TEST'
  );
  Logger.log(
    '============================================================'
  );

  // -------------------------------------------------------------------------
  // 1. Public API
  // -------------------------------------------------------------------------

  test(
    'Public API',
    function () {

      const required = [

        'createInternetService',
        'updateInternetService',
        'changeStatus',
        'activate',
        'deactivate',

        'getAll',
        'getById',
        'requireInternetService',
        'exists',
        'getByProperty',
        'getByUnit',
        'getByProvider',
        'getByBillingCycle',
        'getActive',
        'getInactive',

        'getByContractStartRange',
        'getContractsEndingBetween',
        'getExpiredContracts',
        'getContractsExpiringWithin',

        'summarizeFees',
        'getFeeSummaryByProperty',
        'getFeeSummaryByUnit',
        'getFeeSummaryByProvider',
        'getMonthlyRecurringFee',

        'findOrphanPropertyLinks',
        'findOrphanUnitLinks',
        'findPropertyUnitMismatches',
        'findMissingProviders',
        'findMissingAccountNumbers',
        'findMissingPackageNames',
        'findInvalidFees',
        'findInvalidBillingCycles',
        'findInvalidStatuses',
        'findInvalidContractDates',
        'findDuplicateIds',
        'findDuplicateProviderAccounts',
        'findActiveExpiredContracts'

      ];

      required.forEach(
        name => {
          assertTrue(
            typeof InternetService[name] ===
              'function',
            'Missing InternetService.' +
              name +
              '().'
          );
        }
      );

      assertEqual(
        InternetService.ENTITY_TYPE,
        'INTERNET_SERVICE',
        'Unexpected entity type.'
      );

      return (
        required.length +
        ' functions available'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 2. Existing data
  // -------------------------------------------------------------------------

  test(
    'Existing internet services are readable',
    function () {

      const rows =
        InternetService.getAll();

      assertTrue(
        rows.length >= 3,
        'Expected at least 3 existing internet services.'
      );

      [
        'INT-000001',
        'INT-000002',
        'INT-000003'
      ].forEach(
        id => {
          assertTrue(
            InternetService.getById(id),
            'Expected existing service ' +
              id +
              '.'
          );
        }
      );

      return (
        rows.length +
        ' existing service record(s)'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 3. Existing sample data
  // -------------------------------------------------------------------------

  test(
    'Existing sample fees and contracts are readable',
    function () {

      const a =
        InternetService.getById(
          'INT-000001'
        );

      const b =
        InternetService.getById(
          'INT-000003'
        );

      assertTrue(
        a && b,
        'Expected sample records are missing.'
      );

      assertEqual(
        Number(a.monthly_fee),
        450,
        'Unexpected INT-000001 monthly fee.'
      );

      assertEqual(
        Number(b.monthly_fee),
        600,
        'Unexpected INT-000003 monthly fee.'
      );

      assertEqual(
        dateValue(
          a.contract_start
        ),
        '2026-01-01',
        'Unexpected contract start.'
      );

      assertEqual(
        dateValue(
          a.contract_end
        ),
        '2027-01-01',
        'Unexpected contract end.'
      );

      return (
        'INT-000001=450 | INT-000003=600'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 4. Fixture
  // -------------------------------------------------------------------------

  test(
    'Select property and unit fixture',
    function () {

      const fixture =
        chooseFixture();

      property =
        fixture.property;

      unit =
        fixture.unit;

      assertTrue(
        property && unit,
        'Fixture selection failed.'
      );

      return (
        property.property_id +
        ' | ' +
        unit.unit_id
      );
    }
  );

  // -------------------------------------------------------------------------
  // 5. Reference data
  // -------------------------------------------------------------------------

  test(
    'Required frequency reference exists',
    function () {

      frequency =
        preferredReference(
          'FREQUENCY',
          [
            'MONTHLY'
          ]
        );

      assertTrue(
        !blank(frequency),
        'FREQUENCY has no active values.'
      );

      assertTrue(
        referenceValues(
          'FREQUENCY'
        ).indexOf(
          'MONTHLY'
        ) !== -1,
        'MONTHLY frequency is required by existing internet data.'
      );

      return frequency;
    }
  );

  // -------------------------------------------------------------------------
  // 6. Create
  // -------------------------------------------------------------------------

  test(
    'Create isolated internet service',
    function () {

      const suffix =
        String(
          new Date().getTime()
        ).slice(-8);

      created =
        InternetService
          .createInternetService(
            {
              property_id:
                property.property_id,

              unit_id:
                unit.unit_id,

              provider:
                'Internet Test Provider',

              account_number:
                'TEST-INT-' +
                suffix,

              package_name:
                'Acceptance 250 Mbps',

              monthly_fee:
                525,

              installation_fee:
                75,

              billing_cycle:
                frequency,

              contract_start:
                '2026-10-01',

              contract_end:
                '2027-09-30',

              status:
                'ACTIVE'
            },
            ACTOR
          );

      assertTrue(
        created,
        'Internet service was not created.'
      );

      assertTrue(
        /^INT-\d+$/.test(
          text(
            created.internet_service_id
          )
        ),
        'Unexpected internet service ID: ' +
          created.internet_service_id
      );

      return (
        created.internet_service_id
      );
    }
  );

  // -------------------------------------------------------------------------
  // 7. Read/query
  // -------------------------------------------------------------------------

  test(
    'Read and query created internet service',
    function () {

      const id =
        created.internet_service_id;

      assertTrue(
        InternetService.exists(id),
        'exists returned false.'
      );

      assertTrue(
        InternetService.getById(id),
        'getById returned null.'
      );

      assertTrue(
        containsId(
          InternetService
            .getByProperty(
              property.property_id
            ),
          id
        ),
        'Property query did not return service.'
      );

      assertTrue(
        containsId(
          InternetService
            .getByUnit(
              unit.unit_id
            ),
          id
        ),
        'Unit query did not return service.'
      );

      assertTrue(
        containsId(
          InternetService
            .getByProvider(
              created.provider
            ),
          id
        ),
        'Provider query did not return service.'
      );

      assertTrue(
        containsId(
          InternetService
            .getByBillingCycle(
              frequency
            ),
          id
        ),
        'Billing-cycle query did not return service.'
      );

      assertTrue(
        containsId(
          InternetService
            .getActive(),
          id
        ),
        'Active query did not return service.'
      );

      return 'Read/query API verified';
    }
  );

  // -------------------------------------------------------------------------
  // 8. Update and lifecycle
  // -------------------------------------------------------------------------

  test(
    'Update service and status lifecycle',
    function () {

      let updated =
        InternetService
          .updateInternetService(
            created.internet_service_id,
            {
              package_name:
                'Acceptance 300 Mbps',

              monthly_fee:
                550
            },
            ACTOR
          );

      assertEqual(
        updated.package_name,
        'Acceptance 300 Mbps',
        'Package was not updated.'
      );

      assertEqual(
        Number(
          updated.monthly_fee
        ),
        550,
        'Monthly fee was not updated.'
      );

      updated =
        InternetService.deactivate(
          created.internet_service_id,
          ACTOR
        );

      assertEqual(
        upper(updated.status),
        'INACTIVE',
        'Service did not become INACTIVE.'
      );

      assertTrue(
        containsId(
          InternetService
            .getInactive(),
          created.internet_service_id
        ),
        'Inactive query did not return service.'
      );

      updated =
        InternetService.activate(
          created.internet_service_id,
          ACTOR
        );

      assertEqual(
        upper(updated.status),
        'ACTIVE',
        'Service did not return to ACTIVE.'
      );

      created = updated;

      return (
        created.internet_service_id +
        ' | ACTIVE'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 9. Immutable ID + required fields
  // -------------------------------------------------------------------------

  test(
    'Reject invalid identity and required fields',
    function () {

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                internet_service_id:
                  'INT-999999'
              },
              ACTOR
            );
        },
        'immutable'
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                provider: ''
              },
              ACTOR
            );
        },
        'provider'
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                account_number: ''
              },
              ACTOR
            );
        },
        'account_number'
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                package_name: ''
              },
              ACTOR
            );
        },
        'package_name'
      );

      return 'Identity and required fields protected';
    }
  );

  // -------------------------------------------------------------------------
  // 10. Fee validation
  // -------------------------------------------------------------------------

  test(
    'Reject invalid fees',
    function () {

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                monthly_fee:
                  -1
              },
              ACTOR
            );
        }
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                installation_fee:
                  -1
              },
              ACTOR
            );
        }
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                monthly_fee:
                  'NOT_A_NUMBER'
              },
              ACTOR
            );
        }
      );

      return 'Fee validation verified';
    }
  );

  // -------------------------------------------------------------------------
  // 11. Billing-cycle validation
  // -------------------------------------------------------------------------

  test(
    'Reject invalid billing cycle',
    function () {

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                billing_cycle:
                  'NOT_A_FREQUENCY'
              },
              ACTOR
            );
        }
      );

      return 'FREQUENCY reference enforced';
    }
  );

  // -------------------------------------------------------------------------
  // 12. Contract validation
  // -------------------------------------------------------------------------

  test(
    'Validate contract dates',
    function () {

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                contract_start:
                  '2026-02-30'
              },
              ACTOR
            );
        }
      );

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                contract_start:
                  '2027-01-01',

                contract_end:
                  '2026-12-31'
              },
              ACTOR
            );
        },
        'contract_end'
      );

      return 'Contract dates validated';
    }
  );

  // -------------------------------------------------------------------------
  // 13. Property/unit relationship
  // -------------------------------------------------------------------------

  test(
    'Reject property/unit mismatch when dataset supports it',
    function () {

      const otherUnit =
        chooseCrossPropertyUnit();

      if (!otherUnit) {
        return (
          'SKIPPED - no cross-property unit fixture available'
        );
      }

      assertThrows(
        function () {
          InternetService
            .updateInternetService(
              created.internet_service_id,
              {
                property_id:
                  property.property_id,

                unit_id:
                  otherUnit.unit_id
              },
              ACTOR
            );
        },
        'does not belong'
      );

      return 'Mismatch rejected';
    }
  );

  // -------------------------------------------------------------------------
  // 14. Duplicate provider/account
  // -------------------------------------------------------------------------

  test(
    'Reject duplicate provider/account',
    function () {

      assertThrows(
        function () {
          InternetService
            .createInternetService(
              {
                property_id:
                  property.property_id,

                unit_id:
                  unit.unit_id,

                provider:
                  created.provider,

                account_number:
                  created.account_number,

                package_name:
                  'Duplicate Account Test',

                monthly_fee:
                  100,

                installation_fee:
                  0,

                billing_cycle:
                  frequency,

                contract_start:
                  '2026-11-01',

                contract_end:
                  '2027-10-31',

                status:
                  'ACTIVE'
              },
              ACTOR
            );
        },
        'Duplicate internet provider/account'
      );

      return 'Duplicate provider/account protected';
    }
  );

  // -------------------------------------------------------------------------
  // 15. Contract-start query
  // -------------------------------------------------------------------------

  test(
    'Contract-start range query',
    function () {

      const start =
        dateValue(
          created.contract_start
        );

      const rows =
        InternetService
          .getByContractStartRange(
            start,
            start
          );

      assertTrue(
        containsId(
          rows,
          created.internet_service_id
        ),
        'Contract-start query did not return service.'
      );

      return start;
    }
  );

  // -------------------------------------------------------------------------
  // 16. Contract-end query
  // -------------------------------------------------------------------------

  test(
    'Contract-end range query',
    function () {

      const end =
        dateValue(
          created.contract_end
        );

      const rows =
        InternetService
          .getContractsEndingBetween(
            end,
            end
          );

      assertTrue(
        containsId(
          rows,
          created.internet_service_id
        ),
        'Contract-end query did not return service.'
      );

      return end;
    }
  );

  // -------------------------------------------------------------------------
  // 17. Expired and upcoming contract queries
  // -------------------------------------------------------------------------

  test(
    'Expired and upcoming contract queries',
    function () {

      const end =
        dateValue(
          created.contract_end
        );

      const parts =
        end.split('-').map(Number);

      const before =
        new Date(
          Date.UTC(
            parts[0],
            parts[1] - 1,
            parts[2]
          )
        );

      before.setUTCDate(
        before.getUTCDate() - 1
      );

      const beforeText =
        Utilities.formatDate(
          before,
          'UTC',
          'yyyy-MM-dd'
        );

      const after =
        new Date(
          Date.UTC(
            parts[0],
            parts[1] - 1,
            parts[2]
          )
        );

      after.setUTCDate(
        after.getUTCDate() + 1
      );

      const afterText =
        Utilities.formatDate(
          after,
          'UTC',
          'yyyy-MM-dd'
        );

      assertTrue(
        containsId(
          InternetService
            .getContractsExpiringWithin(
              2,
              beforeText
            ),
          created.internet_service_id
        ),
        'Upcoming-expiry query did not return service.'
      );

      assertTrue(
        containsId(
          InternetService
            .getExpiredContracts(
              afterText
            ),
          created.internet_service_id
        ),
        'Expired-contract query did not return service.'
      );

      return (
        'before=' +
        beforeText +
        ' | end=' +
        end +
        ' | after=' +
        afterText
      );
    }
  );

  // -------------------------------------------------------------------------
  // 18. Fee summary by unit
  // -------------------------------------------------------------------------

  test(
    'Fee summary by unit',
    function () {

      const summary =
        InternetService
          .getFeeSummaryByUnit(
            unit.unit_id,
            true
          );

      assertNumber(
        summary.monthly_fee_total,
        'Monthly fee total is not numeric.'
      );

      assertNumber(
        summary.installation_fee_total,
        'Installation fee total is not numeric.'
      );

      assertTrue(
        Number(
          summary.monthly_fee_total
        ) >=
          Number(
            created.monthly_fee
          ),
        'Unit summary does not include acceptance service.'
      );

      assertTrue(
        summary.service_count >= 1,
        'Unit service count is invalid.'
      );

      return (
        'monthly=' +
        summary.monthly_fee_total +
        ' | installation=' +
        summary.installation_fee_total
      );
    }
  );

  // -------------------------------------------------------------------------
  // 19. Fee summary by property/provider
  // -------------------------------------------------------------------------

  test(
    'Fee summaries by property and provider',
    function () {

      const propertySummary =
        InternetService
          .getFeeSummaryByProperty(
            property.property_id,
            true
          );

      const providerSummary =
        InternetService
          .getFeeSummaryByProvider(
            created.provider,
            true
          );

      assertTrue(
        Number(
          propertySummary.monthly_fee_total
        ) >=
          Number(
            created.monthly_fee
          ),
        'Property summary does not include acceptance service.'
      );

      assertEqual(
        Number(
          providerSummary.monthly_fee_total
        ),
        Number(
          created.monthly_fee
        ),
        'Provider summary has unexpected monthly total.'
      );

      assertEqual(
        providerSummary.service_count,
        1,
        'Test provider should have one service.'
      );

      return (
        'property=' +
        propertySummary.monthly_fee_total +
        ' | provider=' +
        providerSummary.monthly_fee_total
      );
    }
  );

  // -------------------------------------------------------------------------
  // 20. Monthly recurring fee
  // -------------------------------------------------------------------------

  test(
    'Monthly recurring fee normalization',
    function () {

      const result =
        InternetService
          .getMonthlyRecurringFee(
            [
              created
            ]
          );

      assertEqual(
        Number(
          result.monthly_recurring_fee
        ),
        Number(
          created.monthly_fee
        ),
        'MONTHLY recurring fee should equal monthly_fee.'
      );

      assertEqual(
        result.service_count,
        1,
        'Unexpected service count.'
      );

      return (
        'monthly recurring=' +
        result.monthly_recurring_fee
      );
    }
  );

  // -------------------------------------------------------------------------
  // 21. Existing recurring cost
  // -------------------------------------------------------------------------

  test(
    'Existing active internet recurring cost is readable',
    function () {

      const existing = [
        InternetService.getById(
          'INT-000001'
        ),
        InternetService.getById(
          'INT-000002'
        ),
        InternetService.getById(
          'INT-000003'
        )
      ];

      const result =
        InternetService
          .getMonthlyRecurringFee(
            existing
          );

      assertEqual(
        Number(
          result.monthly_recurring_fee
        ),
        1500,
        'Expected baseline recurring fee is 1500.'
      );

      return (
        'baseline monthly recurring=' +
        result.monthly_recurring_fee
      );
    }
  );

  // -------------------------------------------------------------------------
  // 22. Integrity helpers
  // -------------------------------------------------------------------------

  test(
    'Acceptance service passes integrity checks',
    function () {

      const checks = [

        'findOrphanPropertyLinks',
        'findOrphanUnitLinks',
        'findPropertyUnitMismatches',
        'findMissingProviders',
        'findMissingAccountNumbers',
        'findMissingPackageNames',
        'findInvalidFees',
        'findInvalidBillingCycles',
        'findInvalidStatuses',
        'findInvalidContractDates',
        'findDuplicateIds',
        'findDuplicateProviderAccounts'

      ];

      checks.forEach(
        method => {

          const rows =
            InternetService[method]();

          assertTrue(
            !containsId(
              rows,
              created.internet_service_id
            ),
            method +
            ' flagged acceptance service.'
          );
        }
      );

      return (
        checks.length +
        ' integrity helpers clean'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 23. Active-expired integrity helper
  // -------------------------------------------------------------------------

  test(
    'Active-expired contract helper executes correctly',
    function () {

      const end =
        dateValue(
          created.contract_end
        );

      const parts =
        end.split('-').map(Number);

      const after =
        new Date(
          Date.UTC(
            parts[0],
            parts[1] - 1,
            parts[2]
          )
        );

      after.setUTCDate(
        after.getUTCDate() + 1
      );

      const afterText =
        Utilities.formatDate(
          after,
          'UTC',
          'yyyy-MM-dd'
        );

      const rows =
        InternetService
          .findActiveExpiredContracts(
            afterText
          );

      assertTrue(
        containsId(
          rows,
          created.internet_service_id
        ),
        'ACTIVE service with past contract_end should be detected.'
      );

      return (
        created.internet_service_id +
        ' detected after ' +
        afterText
      );
    }
  );

  // -------------------------------------------------------------------------
  // 24. No automatic expense creation / no hard delete
  // -------------------------------------------------------------------------

  test(
    'No expense synchronization or hard-delete API',
    function () {

      [
        'createExpense',
        'syncExpense',
        'createExpenseForInternet',
        'deleteInternetService',
        'removeInternetService',
        'delete'
      ].forEach(
        name => {
          assertTrue(
            typeof InternetService[name] !==
              'function',
            name +
            '() should not exist.'
          );
        }
      );

      return (
        'Financial domain separated and history protected'
      );
    }
  );

  // -------------------------------------------------------------------------
  // 25. ID sequence
  // -------------------------------------------------------------------------

  test(
    'INTERNET_SERVICE ID sequence is synchronized',
    function () {

      const status =
        IdService.getSequenceStatus(
          'INTERNET_SERVICE'
        );

      assertTrue(
        status &&
        status.valid === true,
        'INTERNET_SERVICE sequence is invalid.'
      );

      assertTrue(
        Number(
          status.stored_sequence
        ) >=
          Number(
            status.sheet_max_sequence
          ),
        'INTERNET_SERVICE sequence is behind sheet maximum.'
      );

      assertTrue(
        Number(
          status.sheet_max_sequence
        ) >=
          4,
        'Expected acceptance fixture to advance sheet maximum.'
      );

      return (
        'stored=' +
        status.stored_sequence +
        ' sheetMax=' +
        status.sheet_max_sequence
      );
    }
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'INTERNET SERVICE TEST SUMMARY'
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
    (passed + failed)
  );

  if (created) {

    Logger.log(
      'TEST INTERNET SERVICE: ' +
      created.internet_service_id
    );

    Logger.log(
      'PROPERTY: ' +
      created.property_id
    );

    Logger.log(
      'UNIT: ' +
      created.unit_id
    );

    Logger.log(
      'PROVIDER: ' +
      created.provider
    );

    Logger.log(
      'PACKAGE: ' +
      created.package_name
    );

    Logger.log(
      'MONTHLY FEE: ' +
      created.monthly_fee
    );

    Logger.log(
      'CONTRACT: ' +
      dateValue(
        created.contract_start
      ) +
      ' -> ' +
      dateValue(
        created.contract_end
      )
    );

    Logger.log(
      'STATUS: ' +
      created.status
    );
  }

  Logger.log(
    '============================================================'
  );

  if (failed > 0) {
    throw new Error(
      'INTERNET SERVICE TEST FAILED. ' +
      failed +
      ' test(s) failed.'
    );
  }

  return {
    passed,
    failed,
    total:
      passed + failed,

    internet_service_id:
      created
        ? created.internet_service_id
        : ''
  };
}


function testInternetServiceResumeSafe() {
  const FIXTURE_ID = 'INT-000006';
  const ACTOR = 'SYSTEM';
  let passed = 0, failed = 0, service = null;

  const blank = v => v === null || v === undefined || String(v).trim() === '';
  const text = v => blank(v) ? '' : String(v).trim();
  const upper = v => text(v).toUpperCase();

  function assertTrue(c, m) { if (!c) throw new Error(m || 'Assertion failed.'); }
  function assertEqual(a, e, m) {
    if (String(a) !== String(e)) throw new Error((m || 'Values differ.') + ' Expected=[' + e + '] Actual=[' + a + ']');
  }
  function assertThrows(fn, contains) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = e && e.message ? String(e.message) : String(e); }
    if (!threw) throw new Error('Expected function to throw.');
    if (contains && msg.toLowerCase().indexOf(String(contains).toLowerCase()) === -1)
      throw new Error('Expected error containing "' + contains + '", received "' + msg + '".');
  }
  function containsId(rows, id) {
    return (rows || []).some(r => text(r.internet_service_id) === text(id));
  }
  function dateValue(v) {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()))
      return Utilities.formatDate(v, CONFIG.TIMEZONE || Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return text(v);
  }
  function shiftDate(s, days) {
    const p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1]-1, p[2]));
    d.setUTCDate(d.getUTCDate() + days);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  function test(name, fn) {
    try { const d = fn(); passed++; Logger.log('PASSED | ' + name + (blank(d) ? '' : ' | ' + d)); }
    catch (e) { failed++; Logger.log('FAILED | ' + name + ' | ' + (e.message || e)); }
  }

  Logger.log('============================================================');
  Logger.log('INTERNET SERVICE RESUME-SAFE TEST');
  Logger.log('============================================================');

  test('Public API', () => {
    const required = [
      'createInternetService','updateInternetService','changeStatus','activate','deactivate',
      'getAll','getById','requireInternetService','exists','getByProperty','getByUnit',
      'getByProvider','getByBillingCycle','getActive','getInactive','getByContractStartRange',
      'getContractsEndingBetween','getExpiredContracts','getContractsExpiringWithin',
      'summarizeFees','getFeeSummaryByProperty','getFeeSummaryByUnit','getFeeSummaryByProvider',
      'getMonthlyRecurringFee','findOrphanPropertyLinks','findOrphanUnitLinks',
      'findPropertyUnitMismatches','findMissingProviders','findMissingAccountNumbers',
      'findMissingPackageNames','findInvalidFees','findInvalidBillingCycles','findInvalidStatuses',
      'findInvalidContractDates','findDuplicateIds','findDuplicateProviderAccounts',
      'findActiveExpiredContracts'
    ];
    required.forEach(n => assertTrue(typeof InternetService[n] === 'function', 'Missing ' + n));
    return required.length + ' required functions available';
  });

  test('Recover INT-000006', () => {
    service = InternetService.getById(FIXTURE_ID);
    assertTrue(service, FIXTURE_ID + ' not found.');
    return service.internet_service_id + ' | ' + service.property_id + ' | ' + service.unit_id;
  });

  test('Acceptance fixture core values', () => {
    assertEqual(service.provider, 'Internet Test Provider', 'Unexpected provider.');
    assertEqual(service.package_name, 'Acceptance 300 Mbps', 'Unexpected package.');
    assertEqual(Number(service.monthly_fee), 550, 'Unexpected monthly fee.');
    assertEqual(upper(service.status), 'ACTIVE', 'Fixture should be ACTIVE.');
    return service.provider + ' | ' + service.package_name + ' | 550';
  });

  test('Canonical contract dates are recoverable', () => {
    const s = dateValue(service.contract_start), e = dateValue(service.contract_end);
    assertEqual(s, '2026-10-01'); assertEqual(e, '2027-09-30');
    return s + ' -> ' + e;
  });

  test('Duplicate provider/account protection', () => {
    assertThrows(() => InternetService.createInternetService({
      property_id: service.property_id, unit_id: service.unit_id,
      provider: service.provider, account_number: service.account_number,
      package_name: 'Resume Safe Duplicate', monthly_fee: 100, installation_fee: 0,
      billing_cycle: service.billing_cycle, contract_start: '2026-11-01',
      contract_end: '2027-10-31', status: 'ACTIVE'
    }, ACTOR), 'Duplicate internet provider/account');
    return 'No duplicate created';
  });

  test('Duplicate rejection does not consume an ID', () => {
    const s = IdService.getSequenceStatus('INTERNET_SERVICE');
    assertTrue(s && s.valid === true, 'Invalid sequence.');
    assertEqual(Number(s.stored_sequence), 6, 'Duplicate rejection advanced sequence.');
    assertEqual(Number(s.sheet_max_sequence), 6, 'Unexpected sheet maximum.');
    return 'stored=' + s.stored_sequence + ' sheetMax=' + s.sheet_max_sequence;
  });

  test('Property query', () => {
    assertTrue(containsId(InternetService.getByProperty(service.property_id), FIXTURE_ID));
    return service.property_id;
  });
  test('Unit query', () => {
    assertTrue(containsId(InternetService.getByUnit(service.unit_id), FIXTURE_ID));
    return service.unit_id;
  });
  test('Provider query tolerates previous fixtures', () => {
    const rows = InternetService.getByProvider(service.provider);
    assertTrue(containsId(rows, FIXTURE_ID));
    return rows.length + ' matching provider record(s)';
  });
  test('Billing-cycle query', () => {
    assertTrue(containsId(InternetService.getByBillingCycle(service.billing_cycle), FIXTURE_ID));
    return upper(service.billing_cycle);
  });
  test('Active query', () => {
    assertTrue(containsId(InternetService.getActive(), FIXTURE_ID));
    return 'ACTIVE';
  });

  test('Status lifecycle remains valid', () => {
    let r = InternetService.deactivate(FIXTURE_ID, ACTOR);
    assertEqual(upper(r.status), 'INACTIVE');
    assertTrue(containsId(InternetService.getInactive(), FIXTURE_ID));
    r = InternetService.activate(FIXTURE_ID, ACTOR);
    assertEqual(upper(r.status), 'ACTIVE');
    service = r;
    return 'INACTIVE -> ACTIVE';
  });

  test('Contract-start range query', () => {
    const d = dateValue(service.contract_start);
    assertTrue(containsId(InternetService.getByContractStartRange(d, d), FIXTURE_ID));
    return d;
  });
  test('Contract-end range query', () => {
    const d = dateValue(service.contract_end);
    assertTrue(containsId(InternetService.getContractsEndingBetween(d, d), FIXTURE_ID));
    return d;
  });
  test('Upcoming contract query', () => {
    const e = dateValue(service.contract_end), before = shiftDate(e, -1);
    assertTrue(containsId(InternetService.getContractsExpiringWithin(2, before), FIXTURE_ID));
    return 'asOf=' + before + ' end=' + e;
  });
  test('Expired contract query', () => {
    const e = dateValue(service.contract_end), after = shiftDate(e, 1);
    assertTrue(containsId(InternetService.getExpiredContracts(after), FIXTURE_ID));
    return 'asOf=' + after + ' end=' + e;
  });

  test('Unit fee reporting', () => {
    const s = InternetService.getFeeSummaryByUnit(service.unit_id, true);
    assertTrue(Number(s.monthly_fee_total) >= Number(service.monthly_fee));
    return 'monthly=' + s.monthly_fee_total + ' | services=' + s.service_count;
  });
  test('Property fee reporting', () => {
    const s = InternetService.getFeeSummaryByProperty(service.property_id, true);
    assertTrue(Number(s.monthly_fee_total) >= Number(service.monthly_fee));
    return 'monthly=' + s.monthly_fee_total + ' | services=' + s.service_count;
  });

  test('Provider fee reporting tolerates previous fixtures', () => {
    const rows = InternetService.getByProvider(service.provider).filter(r => upper(r.status) === 'ACTIVE');
    const monthly = Math.round((rows.reduce((a,r) => a + Number(r.monthly_fee || 0), 0) + Number.EPSILON) * 100) / 100;
    const install = Math.round((rows.reduce((a,r) => a + Number(r.installation_fee || 0), 0) + Number.EPSILON) * 100) / 100;
    const s = InternetService.getFeeSummaryByProvider(service.provider, true);
    assertEqual(Number(s.monthly_fee_total), monthly, 'Provider monthly total mismatch.');
    assertEqual(Number(s.installation_fee_total), install, 'Provider installation total mismatch.');
    assertEqual(Number(s.service_count), rows.length, 'Provider count mismatch.');
    assertTrue(containsId(rows, FIXTURE_ID));
    return 'monthly=' + s.monthly_fee_total + ' | services=' + s.service_count;
  });

  test('Monthly recurring fee normalization', () => {
    const r = InternetService.getMonthlyRecurringFee([service]);
    assertEqual(Number(r.monthly_recurring_fee), Number(service.monthly_fee));
    assertEqual(Number(r.service_count), 1);
    return 'monthly recurring=' + r.monthly_recurring_fee;
  });

  test('Original baseline services remain readable', () => {
    const ids = ['INT-000001','INT-000002','INT-000003'];
    const rows = ids.map(id => {
      const r = InternetService.getById(id);
      assertTrue(r, 'Missing ' + id);
      return r;
    });
    const x = InternetService.getMonthlyRecurringFee(rows);
    assertEqual(Number(x.monthly_recurring_fee), 1500, 'Baseline recurring fee changed.');
    return 'INT-000001..003 | monthly recurring=1500';
  });

  test('Acceptance fixture passes integrity checks', () => {
    const checks = [
      'findOrphanPropertyLinks','findOrphanUnitLinks','findPropertyUnitMismatches',
      'findMissingProviders','findMissingAccountNumbers','findMissingPackageNames',
      'findInvalidFees','findInvalidBillingCycles','findInvalidStatuses',
      'findInvalidContractDates','findDuplicateIds','findDuplicateProviderAccounts'
    ];
    checks.forEach(m => assertTrue(!containsId(InternetService[m](), FIXTURE_ID), m + ' flagged fixture.'));
    return checks.length + ' integrity helpers clean';
  });

  test('Active-expired contract helper works', () => {
    const after = shiftDate(dateValue(service.contract_end), 1);
    assertTrue(containsId(InternetService.findActiveExpiredContracts(after), FIXTURE_ID));
    return FIXTURE_ID + ' detected as of ' + after;
  });

  test('Expense sync remains disabled and no hard delete exists', () => {
    ['createExpense','syncExpense','createExpenseForInternet','deleteInternetService','removeInternetService','delete']
      .forEach(n => assertTrue(typeof InternetService[n] !== 'function', n + ' should not exist.'));
    return 'Domains separated; history protected';
  });

  test('INTERNET_SERVICE sequence remains valid', () => {
    const s = IdService.getSequenceStatus('INTERNET_SERVICE');
    assertTrue(s && s.valid === true, 'Invalid sequence.');
    assertTrue(Number(s.stored_sequence) >= Number(s.sheet_max_sequence), 'Sequence behind sheet maximum.');
    assertEqual(Number(s.stored_sequence), 6, 'Unexpected stored sequence.');
    assertEqual(Number(s.sheet_max_sequence), 6, 'Unexpected sheet maximum.');
    return 'stored=' + s.stored_sequence + ' sheetMax=' + s.sheet_max_sequence;
  });

  Logger.log('============================================================');
  Logger.log('INTERNET SERVICE RESUME-SAFE TEST SUMMARY');
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log('TOTAL: ' + (passed + failed));
  Logger.log('INTERNET SERVICE: ' + FIXTURE_ID);
  Logger.log('============================================================');

  if (failed > 0)
    throw new Error('INTERNET SERVICE RESUME-SAFE TEST FAILED. ' + failed + ' test(s) failed.');

  return { passed, failed, total: passed + failed, internet_service_id: FIXTURE_ID };
}
