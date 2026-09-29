/**
 * ============================================================
 * testExpenseService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 5 - EXPENSE SERVICE ACCEPTANCE TEST
 * ============================================================
 *
 * Tests the frozen contract proposed for:
 *
 *   60_ExpenseService.gs
 *
 * IMPORTANT:
 *
 * - Test records are intentionally left in place.
 * - Stable ID sequences are never reset.
 * - Existing historical expenses are not modified.
 * - The test creates its own isolated expense fixture.
 * - Unknown free-text vendors are valid in the MVP.
 *
 * Expected prerequisites:
 *
 * CONFIG.SHEETS.OPERATING_EXPENSES = '27_OperatingExpenses'
 * CONFIG.ID_PREFIXES.OPERATING_EXPENSE = 'EXP'
 *
 * IdService managed entity:
 *
 * {
 *   type: 'OPERATING_EXPENSE',
 *   sheet: CONFIG.SHEETS.OPERATING_EXPENSES,
 *   field: 'expense_id'
 * }
 *
 * Reference data:
 *
 * EXPENSE_CATEGORY
 * CURRENCY
 * PAYMENT_METHOD
 * ============================================================
 */

function testExpenseService() {

  const ACTOR =
    'SYSTEM';

  let passed =
    0;

  let failed =
    0;

  let property =
    null;

  let unit =
    null;

  let customerReservation =
    null;

  let createdExpense =
    null;


  // ==========================================================
  // HELPERS
  // ==========================================================

  function isBlank(value) {

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );

  }


  function normalize(value) {

    if (isBlank(value)) {
      return '';
    }

    return String(value)
      .trim()
      .toUpperCase();

  }


  function text(value) {

    if (isBlank(value)) {
      return '';
    }

    return String(value).trim();

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
    actual,
    expected,
    message
  ) {

    if (
      actual !==
      expected
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


  function assertNumber(
    actual,
    expected,
    message
  ) {

    if (
      Number(actual) !==
      Number(expected)
    ) {

      throw new Error(
        (
          message ||
          'Numeric values are not equal.'
        ) +
        ' Expected=' +
        Number(expected) +
        ', Actual=' +
        Number(actual)
      );

    }

  }


  function assertThrows(
    callback,
    message
  ) {

    let threw =
      false;


    try {

      callback();

    } catch (err) {

      threw =
        true;

    }


    if (!threw) {

      throw new Error(
        message ||
        'Expected operation to throw an error.'
      );

    }

  }


  function pass(
    name,
    detail
  ) {

    passed++;

    Logger.log(
      'PASSED | ' +
      name +
      (
        detail
          ? ' | ' + detail
          : ''
      )
    );

  }


  function fail(
    name,
    error
  ) {

    failed++;

    Logger.log(
      'FAILED | ' +
      name +
      ' | ' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      )
    );

  }


  function test(
    name,
    callback
  ) {

    try {

      const detail =
        callback();

      pass(
        name,
        detail
      );

    } catch (error) {

      fail(
        name,
        error
      );

    }

  }


  function todayString() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );

  }


  function findReferenceValues(
    category
  ) {

    const rows =
      BaseRepository.findAll(
        CONFIG.SHEETS.REFERENCE_DATA
      );


    return rows
      .filter(
        row =>
          normalize(
            row.category
          ) ===
          normalize(
            category
          ) &&
          normalize(
            row.active
          ) !==
          'FALSE'
      )
      .map(
        row =>
          normalize(
            row.code
          )
      )
      .filter(Boolean);

  }


  function firstReferenceValue(
    category,
    preferredValues
  ) {

    const available =
      findReferenceValues(
        category
      );


    const preferred =
      (
        preferredValues ||
        []
      )
        .map(normalize)
        .find(
          value =>
            available.indexOf(
              value
            ) >= 0
        );


    return (
      preferred ||
      available[0] ||
      ''
    );

  }


  function containsExpense(
    rows,
    expenseId
  ) {

    return rows.some(
      row =>
        text(
          row.expense_id
        ) ===
        text(
          expenseId
        )
    );

  }


  // ==========================================================
  // START
  // ==========================================================

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'EXPENSE SERVICE TEST'
  );

  Logger.log(
    '============================================================'
  );


  // ==========================================================
  // 1. PUBLIC API
  // ==========================================================

  test(
    'Public API',
    () => {

      const requiredFunctions = [

        'createExpense',
        'updateExpense',

        'getAll',
        'getById',
        'requireExpense',
        'exists',

        'getByProperty',
        'getByUnit',
        'getByReservation',
        'getByCategory',
        'getByVendor',
        'getByCurrency',
        'getByPaymentMethod',
        'getByDateRange',
        'getByPropertyAndDateRange',
        'getByUnitAndDateRange',

        'getTotalByProperty',
        'getTotalByUnit',
        'getTotalByReservation',
        'getTotalsByCurrency',
        'getTotalsByCategory',
        'getTotalsByUnit',
        'summarizeByCurrency',

        'validateExpense',
        'validateCategory',
        'validateCurrency',
        'validatePaymentMethod',
        'validateDateRange',

        'getKnownVendors',
        'findVendorByName',
        'getVendorResolution',
        'findUnknownVendorNames',
        'findInactiveKnownVendors',

        'findOrphanPropertyLinks',
        'findOrphanUnitLinks',
        'findPropertyUnitMismatches',
        'findOrphanReservationLinks',
        'findReservationUnitMismatches',
        'findInvalidCategories',
        'findInvalidAmounts',
        'findInvalidCurrencies',
        'findInvalidPaymentMethods',
        'findInvalidDates',
        'findMissingDescriptions',
        'findDuplicateExpenseIds'

      ];


      requiredFunctions.forEach(
        name => {

          assertTrue(
            typeof ExpenseService[name] ===
            'function',
            'Missing ExpenseService.' +
            name +
            '()'
          );

        }
      );


      assertTrue(
        typeof ExpenseService
          .ENTITY_TYPE ===
        'string',
        'ExpenseService.ENTITY_TYPE is missing.'
      );


      return (
        requiredFunctions.length +
        ' functions available'
      );

    }
  );


  // ==========================================================
  // 2. EXISTING DATA BASELINE
  // ==========================================================

  test(
    'Existing operating expense data is readable',
    () => {

      const rows =
        ExpenseService.getAll();


      assertTrue(
        rows.length >= 5,
        'Expected at least the five existing expense records.'
      );


      [
        'EXP-000001',
        'EXP-000002',
        'EXP-000003',
        'EXP-000004',
        'EXP-000005'
      ]
        .forEach(
          expenseId => {

            assertTrue(
              ExpenseService.exists(
                expenseId
              ),
              'Expected existing expense ' +
              expenseId
            );

          }
        );


      return (
        rows.length +
        ' existing expense(s)'
      );

    }
  );


  // ==========================================================
  // 3. SELECT SAFE FIXTURE CONTEXT
  // ==========================================================

  test(
    'Select property, unit, and optional reservation fixture',
    () => {

      const properties =
        BaseRepository.findAll(
          CONFIG.SHEETS.PROPERTIES
        );


      property =
        properties.find(
          row =>
            normalize(
              row.status
            ) ===
            'ACTIVE'
        ) ||
        properties[0];


      assertTrue(
        property,
        'At least one property is required.'
      );


      const units =
        BaseRepository.findAll(
          CONFIG.SHEETS.UNITS
        );


      unit =
        units.find(
          row =>
            text(
              row.property_id
            ) ===
            text(
              property.property_id
            ) &&
            normalize(
              row.status
            ) ===
            'ACTIVE'
        ) ||
        units.find(
          row =>
            text(
              row.property_id
            ) ===
            text(
              property.property_id
            )
        );


      assertTrue(
        unit,
        'At least one unit is required for property ' +
        property.property_id
      );


      const reservations =
        BaseRepository.findAll(
          CONFIG.SHEETS.RESERVATIONS
        );


      customerReservation =
        reservations.find(
          row =>
            text(
              row.unit_id
            ) ===
            text(
              unit.unit_id
            )
        ) ||
        null;


      return (
        property.property_id +
        ' | ' +
        unit.unit_id +
        (
          customerReservation
            ? ' | ' +
              customerReservation.reservation_id
            : ' | no matching reservation required'
        )
      );

    }
  );


  // ==========================================================
  // 4. REFERENCE DATA
  // ==========================================================

  let category =
    '';

  let currency =
    '';

  let paymentMethod =
    '';


  test(
    'Required expense reference data exists',
    () => {

      category =
        firstReferenceValue(
          'EXPENSE_CATEGORY',
          [
            'AMENITIES',
            'MAINTENANCE',
            'ELECTRICITY'
          ]
        );


      currency =
        firstReferenceValue(
          'CURRENCY',
          [
            'EGP'
          ]
        );


      paymentMethod =
        firstReferenceValue(
          'PAYMENT_METHOD',
          [
            'CASH',
            'BANK_TRANSFER'
          ]
        );


      assertTrue(
        category,
        'EXPENSE_CATEGORY has no active values.'
      );


      assertTrue(
        currency,
        'CURRENCY has no active values.'
      );


      assertTrue(
        paymentMethod,
        'PAYMENT_METHOD has no active values.'
      );


      ExpenseService.validateCategory(
        category
      );

      ExpenseService.validateCurrency(
        currency
      );

      ExpenseService.validatePaymentMethod(
        paymentMethod
      );


      return (
        category +
        ' | ' +
        currency +
        ' | ' +
        paymentMethod
      );

    }
  );


  // ==========================================================
  // 5. CREATE EXPENSE
  // ==========================================================

  test(
    'Create isolated operating expense',
    () => {

      createdExpense =
        ExpenseService.createExpense(
          {
            property_id:
              property.property_id,

            unit_id:
              unit.unit_id,

            reservation_id:
              '',

            expense_date:
              todayString(),

            category:
              category,

            description:
              'ExpenseService acceptance test',

            amount:
              123.45,

            currency:
              currency,

            payment_method:
              paymentMethod,

            vendor:
              'Expense Test Vendor',

            receipt_url:
              '',

            notes:
              'Created by testExpenseService'
          },
          ACTOR
        );


      assertTrue(
        createdExpense &&
        createdExpense.expense_id,
        'Expense was not created.'
      );


      assertTrue(
        /^EXP-\d+$/.test(
          text(
            createdExpense.expense_id
          )
        ),
        'Unexpected expense ID: ' +
        createdExpense.expense_id
      );


      assertEqual(
        text(
          createdExpense.property_id
        ),
        text(
          property.property_id
        ),
        'Created expense property mismatch.'
      );


      assertEqual(
        text(
          createdExpense.unit_id
        ),
        text(
          unit.unit_id
        ),
        'Created expense unit mismatch.'
      );


      assertNumber(
        createdExpense.amount,
        123.45,
        'Created expense amount mismatch.'
      );


      return createdExpense.expense_id;

    }
  );


  // ==========================================================
  // 6. READ / BASIC QUERIES
  // ==========================================================

  test(
    'Read and query created expense',
    () => {

      const byId =
        ExpenseService.getById(
          createdExpense.expense_id
        );


      assertTrue(
        byId,
        'getById() did not return created expense.'
      );


      assertTrue(
        ExpenseService.exists(
          createdExpense.expense_id
        ),
        'exists() should return true.'
      );


      assertEqual(
        ExpenseService.requireExpense(
          createdExpense.expense_id
        ).expense_id,
        createdExpense.expense_id,
        'requireExpense() returned wrong record.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByProperty(
            property.property_id
          ),
          createdExpense.expense_id
        ),
        'getByProperty() did not include created expense.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByUnit(
            unit.unit_id
          ),
          createdExpense.expense_id
        ),
        'getByUnit() did not include created expense.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByCategory(
            category
          ),
          createdExpense.expense_id
        ),
        'getByCategory() did not include created expense.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByVendor(
            'expense test vendor'
          ),
          createdExpense.expense_id
        ),
        'getByVendor() should be case-insensitive.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByCurrency(
            currency
          ),
          createdExpense.expense_id
        ),
        'getByCurrency() did not include created expense.'
      );


      assertTrue(
        containsExpense(
          ExpenseService.getByPaymentMethod(
            paymentMethod
          ),
          createdExpense.expense_id
        ),
        'getByPaymentMethod() did not include created expense.'
      );


      return 'Read/query API verified';

    }
  );


  // ==========================================================
  // 7. UPDATE
  // ==========================================================

  test(
    'Update operating expense',
    () => {

      const updated =
        ExpenseService.updateExpense(
          createdExpense.expense_id,
          {
            description:
              'ExpenseService acceptance test updated',

            amount:
              150.75,

            notes:
              'Updated by testExpenseService'
          },
          ACTOR
        );


      assertEqual(
        updated.expense_id,
        createdExpense.expense_id,
        'Update changed expense_id.'
      );


      assertEqual(
        updated.description,
        'ExpenseService acceptance test updated',
        'Description was not updated.'
      );


      assertNumber(
        updated.amount,
        150.75,
        'Amount was not updated.'
      );


      createdExpense =
        updated;


      return (
        createdExpense.expense_id +
        ' | amount=150.75'
      );

    }
  );


  // ==========================================================
  // 8. IMMUTABLE ID
  // ==========================================================

  test(
    'Reject expense_id mutation',
    () => {

      assertThrows(
        () => {

          ExpenseService.updateExpense(
            createdExpense.expense_id,
            {
              expense_id:
                'EXP-999999'
            },
            ACTOR
          );

        },
        'expense_id mutation should be rejected.'
      );


      return 'Immutable ID protected';

    }
  );


  // ==========================================================
  // 9. AMOUNT VALIDATION
  // ==========================================================

  test(
    'Reject zero and negative expense amounts',
    () => {

      assertThrows(
        () => {

          ExpenseService.createExpense(
            {
              property_id:
                property.property_id,

              unit_id:
                unit.unit_id,

              reservation_id:
                '',

              expense_date:
                todayString(),

              category:
                category,

              description:
                'Invalid zero amount',

              amount:
                0,

              currency:
                currency,

              payment_method:
                paymentMethod,

              vendor:
                '',

              receipt_url:
                '',

              notes:
                ''
            },
            ACTOR
          );

        },
        'Zero amount should be rejected.'
      );


      assertThrows(
        () => {

          ExpenseService.updateExpense(
            createdExpense.expense_id,
            {
              amount:
                -1
            },
            ACTOR
          );

        },
        'Negative amount should be rejected.'
      );


      return 'Invalid amounts rejected';

    }
  );


  // ==========================================================
  // 10. PROPERTY / UNIT RELATIONSHIP
  // ==========================================================

  test(
    'Reject property/unit mismatch',
    () => {

      const properties =
        BaseRepository.findAll(
          CONFIG.SHEETS.PROPERTIES
        );


      const units =
        BaseRepository.findAll(
          CONFIG.SHEETS.UNITS
        );


      const mismatch =
        properties
          .map(
            p => {

              const otherUnit =
                units.find(
                  u =>
                    text(
                      u.property_id
                    ) !==
                    text(
                      p.property_id
                    )
                );


              return otherUnit
                ? {
                    property:
                      p,

                    unit:
                      otherUnit
                  }
                : null;

            }
          )
          .find(Boolean);


      if (!mismatch) {

        return (
          'SKIPPED - dataset has no cross-property unit pair'
        );

      }


      assertThrows(
        () => {

          ExpenseService.createExpense(
            {
              property_id:
                mismatch.property.property_id,

              unit_id:
                mismatch.unit.unit_id,

              reservation_id:
                '',

              expense_date:
                todayString(),

              category:
                category,

              description:
                'Invalid property/unit relationship',

              amount:
                1,

              currency:
                currency,

              payment_method:
                paymentMethod,

              vendor:
                '',

              receipt_url:
                '',

              notes:
                ''
            },
            ACTOR
          );

        },
        'Property/unit mismatch should be rejected.'
      );


      return 'Mismatch rejected';

    }
  );


  // ==========================================================
  // 11. RESERVATION RELATIONSHIP
  // ==========================================================

  test(
    'Validate reservation relationship when linked',
    () => {

      if (!customerReservation) {

        return (
          'SKIPPED - no reservation for selected unit'
        );

      }


      const validated =
        ExpenseService.validateExpense(
          {
            property_id:
              property.property_id,

            unit_id:
              unit.unit_id,

            reservation_id:
              customerReservation.reservation_id,

            expense_date:
              todayString(),

            category:
              category,

            description:
              'Reservation-linked validation test',

            amount:
              10,

            currency:
              currency,

            payment_method:
              paymentMethod,

            vendor:
              '',

            receipt_url:
              '',

            notes:
              ''
          }
        );


      assertEqual(
        validated.reservation_id,
        customerReservation.reservation_id,
        'Reservation relationship was not preserved.'
      );


      return customerReservation.reservation_id;

    }
  );


  // ==========================================================
  // 12. INVALID REFERENCE VALUES
  // ==========================================================

  test(
    'Reject invalid reference values',
    () => {

      assertThrows(
        () => {

          ExpenseService.validateCategory(
            '__INVALID_EXPENSE_CATEGORY__'
          );

        },
        'Invalid expense category should be rejected.'
      );


      assertThrows(
        () => {

          ExpenseService.validateCurrency(
            '__INVALID_CURRENCY__'
          );

        },
        'Invalid currency should be rejected.'
      );


      assertThrows(
        () => {

          ExpenseService.validatePaymentMethod(
            '__INVALID_PAYMENT_METHOD__'
          );

        },
        'Invalid payment method should be rejected.'
      );


      return 'Reference validation enforced';

    }
  );


  // ==========================================================
  // 13. DATE VALIDATION + DATE RANGE
  // ==========================================================

  test(
    'Date validation and date-range query',
    () => {

      assertThrows(
        () => {

          ExpenseService.validateDateRange(
            '2026-10-10',
            '2026-10-01'
          );

        },
        'Reverse date range should be rejected.'
      );


      assertThrows(
        () => {

          ExpenseService.validateExpense(
            {
              property_id:
                property.property_id,

              unit_id:
                unit.unit_id,

              reservation_id:
                '',

              expense_date:
                '2026-02-30',

              category:
                category,

              description:
                'Invalid date test',

              amount:
                1,

              currency:
                currency,

              payment_method:
                paymentMethod,

              vendor:
                '',

              receipt_url:
                '',

              notes:
                ''
            }
          );

        },
        'Invalid calendar date should be rejected.'
      );


      const day =
        todayString();


      const byDate =
        ExpenseService.getByDateRange(
          day,
          day
        );


      assertTrue(
        containsExpense(
          byDate,
          createdExpense.expense_id
        ),
        'Date-range query did not include test expense.'
      );


      const byPropertyDate =
        ExpenseService
          .getByPropertyAndDateRange(
            property.property_id,
            day,
            day
          );


      assertTrue(
        containsExpense(
          byPropertyDate,
          createdExpense.expense_id
        ),
        'Property/date query did not include test expense.'
      );


      const byUnitDate =
        ExpenseService
          .getByUnitAndDateRange(
            unit.unit_id,
            day,
            day
          );


      assertTrue(
        containsExpense(
          byUnitDate,
          createdExpense.expense_id
        ),
        'Unit/date query did not include test expense.'
      );


      return day;

    }
  );


  // ==========================================================
  // 14. VENDOR MODEL
  // ==========================================================

  test(
    'Vendor model supports known and free-text vendors',
    () => {

      const known =
        ExpenseService.findVendorByName(
          'EEHC'
        );


      assertTrue(
        known,
        'Expected EEHC in 28_Vendors.'
      );


      assertEqual(
        normalize(
          known.vendor_name
        ),
        'EEHC',
        'Known vendor lookup mismatch.'
      );


      const knownResolution =
        ExpenseService.getVendorResolution(
          'EEHC'
        );


      assertTrue(
        knownResolution.matched ===
        true,
        'EEHC should resolve to a vendor record.'
      );


      const freeTextResolution =
        ExpenseService.getVendorResolution(
          'Expense Test Vendor'
        );


      assertTrue(
        freeTextResolution.matched ===
        false,
        'Free-text test vendor should remain unmatched.'
      );


      const unknown =
        ExpenseService
          .findUnknownVendorNames();


      assertTrue(
        containsExpense(
          unknown,
          createdExpense.expense_id
        ),
        'Unknown vendor analysis should include free-text test vendor.'
      );


      return (
        'Known vendor + free-text vendor verified'
      );

    }
  );


  // ==========================================================
  // 15. CURRENCY-SAFE AGGREGATION
  // ==========================================================

  test(
    'Currency-safe financial aggregation',
    () => {

      const day =
        todayString();


      const currencyTotals =
        ExpenseService.getTotalsByCurrency(
          property.property_id,
          day,
          day
        );


      const currencyRow =
        currencyTotals.find(
          row =>
            normalize(
              row.currency
            ) ===
            normalize(
              currency
            )
        );


      assertTrue(
        currencyRow,
        'Currency aggregation did not return ' +
        currency
      );


      assertTrue(
        Number(
          currencyRow.total
        ) >=
        Number(
          createdExpense.amount
        ),
        'Currency total should include created expense.'
      );


      const propertyTotal =
        ExpenseService.getTotalByProperty(
          property.property_id,
          day,
          day
        );


      /*
       * If the selected property has one currency for the day,
       * the single-currency total is valid. If historical data
       * introduces multiple currencies this method is expected
       * to throw instead of silently combining them.
       */

      assertTrue(
        propertyTotal &&
        typeof propertyTotal.total ===
        'number',
        'Property total result is invalid.'
      );


      assertEqual(
        normalize(
          propertyTotal.currency
        ),
        normalize(
          currency
        ),
        'Unexpected property total currency.'
      );


      return (
        propertyTotal.currency +
        ' ' +
        propertyTotal.total
      );

    }
  );


  // ==========================================================
  // 16. CATEGORY + UNIT AGGREGATION
  // ==========================================================

  test(
    'Category and unit aggregations',
    () => {

      const day =
        todayString();


      const categoryTotals =
        ExpenseService.getTotalsByCategory(
          property.property_id,
          day,
          day
        );


      const categoryRow =
        categoryTotals.find(
          row =>
            normalize(
              row.category
            ) ===
            normalize(
              category
            ) &&
            normalize(
              row.currency
            ) ===
            normalize(
              currency
            )
        );


      assertTrue(
        categoryRow,
        'Category aggregation did not include test expense.'
      );


      const unitTotals =
        ExpenseService.getTotalsByUnit(
          property.property_id,
          day,
          day
        );


      const unitRow =
        unitTotals.find(
          row =>
            text(
              row.unit_id
            ) ===
            text(
              unit.unit_id
            ) &&
            normalize(
              row.currency
            ) ===
            normalize(
              currency
            )
        );


      assertTrue(
        unitRow,
        'Unit aggregation did not include test expense.'
      );


      return (
        category +
        ' / ' +
        unit.unit_id
      );

    }
  );


  // ==========================================================
  // 17. RESERVATION TOTAL
  // ==========================================================

  test(
    'Reservation expense total supports existing linked expenses',
    () => {

      const existing =
        ExpenseService.getById(
          'EXP-000004'
        );


      if (
        !existing ||
        isBlank(
          existing.reservation_id
        )
      ) {

        return (
          'SKIPPED - EXP-000004 is not reservation-linked'
        );

      }


      const total =
        ExpenseService.getTotalByReservation(
          existing.reservation_id
        );


      assertTrue(
        total &&
        typeof total.total ===
        'number',
        'Reservation total result is invalid.'
      );


      assertTrue(
        total.total >=
        Number(
          existing.amount
        ),
        'Reservation total should include EXP-000004.'
      );


      return (
        existing.reservation_id +
        ' | ' +
        total.currency +
        ' ' +
        total.total
      );

    }
  );


  // ==========================================================
  // 18. NO HARD DELETE
  // ==========================================================

  test(
    'No hard-delete expense API',
    () => {

      assertTrue(
        typeof ExpenseService
          .deleteExpense ===
        'undefined',
        'ExpenseService must not expose deleteExpense().'
      );


      assertTrue(
        typeof ExpenseService
          .removeExpense ===
        'undefined',
        'ExpenseService must not expose removeExpense().'
      );


      return 'Financial history protected';

    }
  );


  // ==========================================================
  // 19. INTEGRITY HELPERS
  // ==========================================================

  test(
    'Integrity helpers do not flag test expense',
    () => {

      const checks = [

        {
          name:
            'findOrphanPropertyLinks',
          rows:
            ExpenseService
              .findOrphanPropertyLinks()
        },

        {
          name:
            'findOrphanUnitLinks',
          rows:
            ExpenseService
              .findOrphanUnitLinks()
        },

        {
          name:
            'findPropertyUnitMismatches',
          rows:
            ExpenseService
              .findPropertyUnitMismatches()
        },

        {
          name:
            'findOrphanReservationLinks',
          rows:
            ExpenseService
              .findOrphanReservationLinks()
        },

        {
          name:
            'findReservationUnitMismatches',
          rows:
            ExpenseService
              .findReservationUnitMismatches()
        },

        {
          name:
            'findInvalidCategories',
          rows:
            ExpenseService
              .findInvalidCategories()
        },

        {
          name:
            'findInvalidAmounts',
          rows:
            ExpenseService
              .findInvalidAmounts()
        },

        {
          name:
            'findInvalidCurrencies',
          rows:
            ExpenseService
              .findInvalidCurrencies()
        },

        {
          name:
            'findInvalidPaymentMethods',
          rows:
            ExpenseService
              .findInvalidPaymentMethods()
        },

        {
          name:
            'findInvalidDates',
          rows:
            ExpenseService
              .findInvalidDates()
        },

        {
          name:
            'findMissingDescriptions',
          rows:
            ExpenseService
              .findMissingDescriptions()
        },

        {
          name:
            'findDuplicateExpenseIds',
          rows:
            ExpenseService
              .findDuplicateExpenseIds()
        }

      ];


      checks.forEach(
        check => {

          assertTrue(
            !containsExpense(
              check.rows,
              createdExpense.expense_id
            ),
            check.name +
            ' incorrectly flagged ' +
            createdExpense.expense_id
          );

        }
      );


      return (
        checks.length +
        ' integrity helpers verified'
      );

    }
  );


  // ==========================================================
  // 20. ID SEQUENCE STATUS
  // ==========================================================

  test(
    'Operating expense ID sequence is synchronized',
    () => {

      const status =
        IdService.getSequenceStatus(
          'OPERATING_EXPENSE'
        );


      assertTrue(
        status,
        'No OPERATING_EXPENSE sequence status returned.'
      );


      assertTrue(
        status.valid ===
        true,
        'OPERATING_EXPENSE ID sequence is not valid.'
      );


      assertTrue(
        Number(
          status.stored_sequence
        ) >=
        Number(
          status.sheet_max_sequence
        ),
        'Stored expense sequence is behind sheet maximum.'
      );


      return (
        'stored=' +
        status.stored_sequence +
        ' | sheetMax=' +
        status.sheet_max_sequence
      );

    }
  );


  // ==========================================================
  // FINAL
  // ==========================================================

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'EXPENSE SERVICE TEST SUMMARY'
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


  if (createdExpense) {

    Logger.log(
      'TEST EXPENSE: ' +
      createdExpense.expense_id
    );

    Logger.log(
      'PROPERTY: ' +
      createdExpense.property_id
    );

    Logger.log(
      'UNIT: ' +
      createdExpense.unit_id
    );

    Logger.log(
      'CATEGORY: ' +
      createdExpense.category
    );

    Logger.log(
      'AMOUNT: ' +
      createdExpense.amount +
      ' ' +
      createdExpense.currency
    );

  }


  Logger.log(
    '============================================================'
  );


  if (
    failed >
    0
  ) {

    throw new Error(
      'EXPENSE SERVICE TEST FAILED. ' +
      failed +
      ' test(s) failed.'
    );

  }


  return {

    passed:
      passed,

    failed:
      failed,

    total:
      passed +
      failed,

    expense_id:
      createdExpense
        ? createdExpense.expense_id
        : '',

    property_id:
      createdExpense
        ? createdExpense.property_id
        : '',

    unit_id:
      createdExpense
        ? createdExpense.unit_id
        : '',

    amount:
      createdExpense
        ? Number(
            createdExpense.amount
          )
        : 0,

    currency:
      createdExpense
        ? createdExpense.currency
        : ''

  };

}
