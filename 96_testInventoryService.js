/**
 * ============================================================================
 * testInventoryService.gs
 * ============================================================================
 *
 * Integration test for:
 *   55_InventoryService.gs
 *
 * Scope:
 *   - Item master
 *   - Inventory location master
 *   - Zero-balance stock record
 *   - Stock policy
 *   - Queries / search
 *   - Low-stock logic
 *   - Validation
 *   - Integrity helpers
 *
 * IMPORTANT:
 *   This test intentionally DOES NOT simulate stock receipts/transfers/
 *   consumption by directly changing quantity_on_hand.
 *
 *   Stock movements belong to:
 *     56_InventoryTransactionService.gs
 *
 * Test records are intentionally left in place so stable IDs and audit
 * history remain consistent with the rest of the project.
 * ============================================================================
 */

function testInventoryService() {

  const ACTOR_ID = 'SYSTEM';

  const results = [];
  let passed = 0;
  let failed = 0;

  let property = null;
  let unit = null;
  let item = null;
  let location = null;
  let stock = null;


  // ==========================================================================
  // TEST HELPERS
  // ==========================================================================

  function log(message) {
    Logger.log(message);
  }


  function pass(name, details) {
    passed++;

    const result = {
      test: name,
      status: 'PASSED',
      details: details || ''
    };

    results.push(result);

    log(
      'PASSED | ' +
      name +
      (details ? ' | ' + details : '')
    );
  }


  function fail(name, error) {
    failed++;

    const message =
      error && error.message
        ? error.message
        : String(error);

    const result = {
      test: name,
      status: 'FAILED',
      details: message
    };

    results.push(result);

    log(
      'FAILED | ' +
      name +
      ' | ' +
      message
    );

    throw error;
  }


  function runTest(name, callback) {
    try {
      const details =
        callback();

      pass(
        name,
        details
      );

    } catch (error) {
      fail(
        name,
        error
      );
    }
  }


  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(
        message ||
        'Expected condition to be true.'
      );
    }
  }


  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        (message || 'Values are not equal.') +
        ' Expected=' +
        expected +
        ', Actual=' +
        actual
      );
    }
  }


  function assertThrows(callback, expectedText) {
    let thrown = false;
    let message = '';

    try {
      callback();

    } catch (error) {
      thrown = true;

      message =
        error && error.message
          ? error.message
          : String(error);
    }

    if (!thrown) {
      throw new Error(
        'Expected operation to throw an error.'
      );
    }

    if (
      expectedText &&
      message.indexOf(expectedText) === -1
    ) {
      throw new Error(
        'Operation threw an unexpected error. ' +
        'Expected text="' +
        expectedText +
        '", Actual="' +
        message +
        '"'
      );
    }

    return message;
  }


  function normalize(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    return String(value)
      .trim()
      .toUpperCase();
  }


  function toBoolean(value) {
    if (
      value === true ||
      value === false
    ) {
      return value;
    }

    return normalize(value) === 'TRUE';
  }


  // ==========================================================================
  // PRECONDITIONS
  // ==========================================================================

  log(
    '============================================================'
  );

  log(
    'STARTING testInventoryService()'
  );

  log(
    '============================================================'
  );


  property =
    BaseRepository.findAll(
      CONFIG.SHEETS.PROPERTIES
    ).find(
      row =>
        normalize(
          row.status
        ) === 'ACTIVE'
    ) ||
    BaseRepository.findAll(
      CONFIG.SHEETS.PROPERTIES
    )[0];

  if (!property) {
    throw new Error(
      'Test requires at least one property.'
    );
  }


  unit =
    BaseRepository.findAll(
      CONFIG.SHEETS.UNITS
    ).find(
      row =>
        String(
          row.property_id || ''
        ).trim() ===
          String(
            property.property_id || ''
          ).trim() &&
        normalize(
          row.status
        ) === 'ACTIVE'
    ) ||
    BaseRepository.findAll(
      CONFIG.SHEETS.UNITS
    ).find(
      row =>
        String(
          row.property_id || ''
        ).trim() ===
        String(
          property.property_id || ''
        ).trim()
    );

  if (!unit) {
    throw new Error(
      'Test requires at least one unit for property ' +
      property.property_id +
      '.'
    );
  }


  const uniqueSuffix =
    Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'yyyyMMddHHmmss'
    );

  const itemCode =
    'TEST-INV-' +
    uniqueSuffix;


  // ==========================================================================
  // TEST 1 - PUBLIC API
  // ==========================================================================

  runTest(
    'InventoryService public API is available',
    () => {

      const requiredMethods = [
        'createItem',
        'updateItem',
        'changeItemActive',
        'getAllItems',
        'getItemById',
        'getItemByCode',
        'requireItem',
        'itemExists',
        'itemCodeExists',
        'getActiveItems',
        'getItemsByCategory',
        'getItemsByType',
        'searchItems',

        'createLocation',
        'updateLocation',
        'changeLocationActive',
        'getAllLocations',
        'getLocationById',
        'requireLocation',
        'locationExists',
        'getActiveLocations',
        'getLocationsByProperty',
        'getLocationsByUnit',
        'getLocationsByType',
        'findUnitLocation',

        'createStockRecord',
        'updateStockPolicy',
        'getAllStock',
        'getStockById',
        'requireStock',
        'findStock',
        'getStockByItem',
        'getStockByLocation',
        'getStockPosition',
        'getTotalStockForItem',
        'getAvailableQuantity',
        'applyStockBalance',

        'isLowStock',
        'getLowStock',
        'getLowStockByLocation',
        'getOutOfStock',

        'findDuplicateItemCodes',
        'findItemsWithoutCode',
        'findItemsWithoutName',
        'findInvalidItemTypes',
        'findInvalidItemNumbers',
        'findOrphanPreferredVendors',

        'findOrphanLocationProperties',
        'findOrphanLocationUnits',
        'findLocationPropertyUnitMismatches',
        'findInvalidLocationTypes',
        'findInvalidUnitLocationLinks',
        'findDuplicateUnitLocations',

        'findOrphanStockItems',
        'findOrphanStockLocations',
        'findDuplicateStockRecords',
        'findInvalidStockQuantities',
        'findReservedGreaterThanOnHand',
        'findInvalidStockThresholds'
      ];

      requiredMethods.forEach(
        method => {
          assertTrue(
            typeof InventoryService[method] ===
              'function',
            'Missing InventoryService.' +
              method +
              '()'
          );
        }
      );

      return (
        requiredMethods.length +
        ' methods verified'
      );
    }
  );


  // ==========================================================================
  // TEST 2 - CREATE ITEM
  // ==========================================================================

  runTest(
    'Create inventory item',
    () => {

      item =
        InventoryService.createItem(
          {
            item_code:
              itemCode,

            name:
              'Inventory Service Test Towel',

            category:
              'TOWEL',

            unit_of_measure:
              'PIECE',

            item_type:
              'REUSABLE',

            reorder_level:
              2,

            target_stock_level:
              6,

            unit_cost:
              100,

            preferred_vendor_id:
              '',

            active:
              true,

            notes:
              'Created by testInventoryService()'
          },
          ACTOR_ID
        );

      assertTrue(
        item,
        'createItem() returned no item.'
      );

      assertTrue(
        /^ITEM-\d+$/.test(
          String(
            item.item_id || ''
          )
        ),
        'Unexpected item_id: ' +
          item.item_id
      );

      assertEqual(
        item.item_code,
        itemCode,
        'item_code mismatch.'
      );

      assertEqual(
        normalize(
          item.item_type
        ),
        'REUSABLE',
        'item_type mismatch.'
      );

      return (
        'Created ' +
        item.item_id +
        ' / ' +
        item.item_code
      );
    }
  );


  // ==========================================================================
  // TEST 3 - ITEM QUERIES
  // ==========================================================================

  runTest(
    'Inventory item queries',
    () => {

      const byId =
        InventoryService.getItemById(
          item.item_id
        );

      const byCode =
        InventoryService.getItemByCode(
          item.item_code
        );

      const search =
        InventoryService.searchItems(
          'Inventory Service Test Towel'
        );

      const byCategory =
        InventoryService.getItemsByCategory(
          'TOWEL'
        );

      const byType =
        InventoryService.getItemsByType(
          'REUSABLE'
        );

      assertTrue(
        byId &&
        byId.item_id === item.item_id,
        'getItemById() failed.'
      );

      assertTrue(
        byCode &&
        byCode.item_id === item.item_id,
        'getItemByCode() failed.'
      );

      assertTrue(
        search.some(
          row =>
            row.item_id ===
            item.item_id
        ),
        'searchItems() did not return test item.'
      );

      assertTrue(
        byCategory.some(
          row =>
            row.item_id ===
            item.item_id
        ),
        'getItemsByCategory() did not return test item.'
      );

      assertTrue(
        byType.some(
          row =>
            row.item_id ===
            item.item_id
        ),
        'getItemsByType() did not return test item.'
      );

      return 'Item queries verified';
    }
  );


  // ==========================================================================
  // TEST 4 - UPDATE ITEM
  // ==========================================================================

  runTest(
    'Update inventory item',
    () => {

      item =
        InventoryService.updateItem(
          item.item_id,
          {
            target_stock_level:
              8,

            unit_cost:
              125,

            notes:
              'Updated by testInventoryService()'
          },
          ACTOR_ID
        );

      assertEqual(
        Number(
          item.target_stock_level
        ),
        8,
        'target_stock_level was not updated.'
      );

      assertEqual(
        Number(
          item.unit_cost
        ),
        125,
        'unit_cost was not updated.'
      );

      return (
        'Updated ' +
        item.item_id
      );
    }
  );


  // ==========================================================================
  // TEST 5 - DUPLICATE ITEM CODE PROTECTION
  // ==========================================================================

  runTest(
    'Duplicate item_code is rejected',
    () => {

      const message =
        assertThrows(
          () => {
            InventoryService.createItem(
              {
                item_code:
                  item.item_code,

                name:
                  'Duplicate Test Item',

                category:
                  'TOWEL',

                unit_of_measure:
                  'PIECE',

                item_type:
                  'REUSABLE',

                reorder_level:
                  0,

                target_stock_level:
                  0,

                unit_cost:
                  0,

                active:
                  true
              },
              ACTOR_ID
            );
          },
          'already exists'
        );

      return message;
    }
  );


  // ==========================================================================
  // TEST 6 - CREATE UNIT INVENTORY LOCATION
  // ==========================================================================

  runTest(
    'Create UNIT inventory location',
    () => {

      const existing =
        InventoryService.findUnitLocation(
          unit.unit_id
        );

      if (existing) {
        /*
         * Avoid breaking existing operational data.
         * Use an OTHER location for this test if the unit already has
         * its canonical UNIT inventory location.
         */
        location =
          InventoryService.createLocation(
            {
              property_id:
                property.property_id,

              unit_id:
                '',

              name:
                'Inventory Test Store ' +
                uniqueSuffix,

              location_type:
                'OTHER',

              active:
                true,

              notes:
                'Test location because unit already has UNIT location'
            },
            ACTOR_ID
          );

        assertEqual(
          normalize(
            location.location_type
          ),
          'OTHER',
          'Fallback location_type mismatch.'
        );

        return (
          'Unit already had ' +
          existing.location_id +
          '; created safe test location ' +
          location.location_id
        );
      }

      location =
        InventoryService.createLocation(
          {
            property_id:
              property.property_id,

            unit_id:
              unit.unit_id,

            name:
              'Inventory for ' +
              unit.unit_id,

            location_type:
              'UNIT',

            active:
              true,

            notes:
              'Created by testInventoryService()'
          },
          ACTOR_ID
        );

      assertTrue(
        /^ILOC-\d+$/.test(
          String(
            location.location_id || ''
          )
        ),
        'Unexpected location_id: ' +
          location.location_id
      );

      assertEqual(
        location.unit_id,
        unit.unit_id,
        'unit_id mismatch.'
      );

      return (
        'Created ' +
        location.location_id +
        ' for ' +
        unit.unit_id
      );
    }
  );


  // ==========================================================================
  // TEST 7 - LOCATION QUERIES
  // ==========================================================================

  runTest(
    'Inventory location queries',
    () => {

      const byId =
        InventoryService.getLocationById(
          location.location_id
        );

      const byProperty =
        InventoryService.getLocationsByProperty(
          property.property_id
        );

      const byType =
        InventoryService.getLocationsByType(
          location.location_type
        );

      assertTrue(
        byId &&
        byId.location_id ===
          location.location_id,
        'getLocationById() failed.'
      );

      assertTrue(
        byProperty.some(
          row =>
            row.location_id ===
            location.location_id
        ),
        'getLocationsByProperty() did not return test location.'
      );

      assertTrue(
        byType.some(
          row =>
            row.location_id ===
            location.location_id
        ),
        'getLocationsByType() did not return test location.'
      );

      return 'Location queries verified';
    }
  );


  // ==========================================================================
  // TEST 8 - LOCATION VALIDATION
  // ==========================================================================

  runTest(
    'UNIT location requires unit_id',
    () => {

      const message =
        assertThrows(
          () => {
            InventoryService.createLocation(
              {
                property_id:
                  property.property_id,

                unit_id:
                  '',

                name:
                  'Invalid UNIT Location ' +
                  uniqueSuffix,

                location_type:
                  'UNIT',

                active:
                  true
              },
              ACTOR_ID
            );
          },
          'unit_id is required'
        );

      return message;
    }
  );


  // ==========================================================================
  // TEST 9 - CREATE ZERO STOCK RECORD
  // ==========================================================================

  runTest(
    'Create zero-balance stock record',
    () => {

      stock =
        InventoryService.createStockRecord(
          item.item_id,
          location.location_id,
          {
            minimum_quantity:
              3,

            maximum_quantity:
              20
          },
          ACTOR_ID
        );

      assertTrue(
        /^STK-\d+$/.test(
          String(
            stock.stock_id || ''
          )
        ),
        'Unexpected stock_id: ' +
          stock.stock_id
      );

      assertEqual(
        Number(
          stock.quantity_on_hand
        ),
        0,
        'New stock quantity_on_hand must be zero.'
      );

      assertEqual(
        Number(
          stock.reserved_quantity
        ),
        0,
        'New stock reserved_quantity must be zero.'
      );

      assertEqual(
        Number(
          stock.minimum_quantity
        ),
        3,
        'minimum_quantity mismatch.'
      );

      return (
        'Created ' +
        stock.stock_id +
        ' at zero balance'
      );
    }
  );


  // ==========================================================================
  // TEST 10 - DUPLICATE STOCK RECORD PROTECTION
  // ==========================================================================

  runTest(
    'Duplicate item/location stock record is rejected',
    () => {

      const message =
        assertThrows(
          () => {
            InventoryService.createStockRecord(
              item.item_id,
              location.location_id,
              {},
              ACTOR_ID
            );
          },
          'already exists'
        );

      return message;
    }
  );


  // ==========================================================================
  // TEST 11 - STOCK QUERIES
  // ==========================================================================

  runTest(
    'Inventory stock queries',
    () => {

      const byId =
        InventoryService.getStockById(
          stock.stock_id
        );

      const found =
        InventoryService.findStock(
          item.item_id,
          location.location_id
        );

      const position =
        InventoryService.getStockPosition(
          item.item_id,
          location.location_id
        );

      const total =
        InventoryService.getTotalStockForItem(
          item.item_id
        );

      assertTrue(
        byId &&
        byId.stock_id ===
          stock.stock_id,
        'getStockById() failed.'
      );

      assertTrue(
        found &&
        found.stock_id ===
          stock.stock_id,
        'findStock() failed.'
      );

      assertEqual(
        position.quantity_on_hand,
        0,
        'Stock position quantity_on_hand mismatch.'
      );

      assertEqual(
        position.available_quantity,
        0,
        'Stock position available_quantity mismatch.'
      );

      assertEqual(
        total.quantity_on_hand,
        0,
        'Total item stock should be zero.'
      );

      return 'Stock queries verified';
    }
  );


  // ==========================================================================
  // TEST 12 - UPDATE STOCK POLICY
  // ==========================================================================

  runTest(
    'Update stock policy without changing balance',
    () => {

      stock =
        InventoryService.updateStockPolicy(
          stock.stock_id,
          {
            minimum_quantity:
              4,

            maximum_quantity:
              25
          },
          ACTOR_ID
        );

      assertEqual(
        Number(
          stock.minimum_quantity
        ),
        4,
        'minimum_quantity was not updated.'
      );

      assertEqual(
        Number(
          stock.maximum_quantity
        ),
        25,
        'maximum_quantity was not updated.'
      );

      assertEqual(
        Number(
          stock.quantity_on_hand
        ),
        0,
        'Stock policy update changed quantity_on_hand.'
      );

      assertEqual(
        Number(
          stock.reserved_quantity
        ),
        0,
        'Stock policy update changed reserved_quantity.'
      );

      return 'Stock policy updated safely';
    }
  );


  // ==========================================================================
  // TEST 13 - DIRECT QUANTITY CHANGE BLOCKED
  // ==========================================================================

  runTest(
    'Stock policy API rejects direct quantity mutation',
    () => {

      const message =
        assertThrows(
          () => {
            InventoryService.updateStockPolicy(
              stock.stock_id,
              {
                quantity_on_hand:
                  100
              },
              ACTOR_ID
            );
          },
          'cannot be changed through InventoryService'
        );

      const reloaded =
        InventoryService.getStockById(
          stock.stock_id
        );

      assertEqual(
        Number(
          reloaded.quantity_on_hand
        ),
        0,
        'Rejected quantity mutation still changed stock.'
      );

      return message;
    }
  );


  // ==========================================================================
  // TEST 14 - LOW STOCK / OUT OF STOCK
  // ==========================================================================

  runTest(
    'Low-stock and out-of-stock detection',
    () => {

      const reloaded =
        InventoryService.getStockById(
          stock.stock_id
        );

      assertTrue(
        InventoryService.isLowStock(
          reloaded
        ),
        'Zero-balance stock with minimum 4 should be low stock.'
      );

      const lowStock =
        InventoryService.getLowStock();

      const lowAtLocation =
        InventoryService.getLowStockByLocation(
          location.location_id
        );

      const outOfStock =
        InventoryService.getOutOfStock();

      assertTrue(
        lowStock.some(
          entry =>
            entry.stock.stock_id ===
            stock.stock_id
        ),
        'getLowStock() did not return test stock.'
      );

      assertTrue(
        lowAtLocation.some(
          entry =>
            entry.stock.stock_id ===
            stock.stock_id
        ),
        'getLowStockByLocation() did not return test stock.'
      );

      assertTrue(
        outOfStock.some(
          row =>
            row.stock_id ===
            stock.stock_id
        ),
        'getOutOfStock() did not return zero-balance test stock.'
      );

      return 'Low/out-of-stock detection verified';
    }
  );


  // ==========================================================================
  // TEST 15 - THRESHOLD VALIDATION
  // ==========================================================================

  runTest(
    'Invalid stock thresholds are rejected',
    () => {

      const message =
        assertThrows(
          () => {
            InventoryService.updateStockPolicy(
              stock.stock_id,
              {
                minimum_quantity:
                  10,

                maximum_quantity:
                  5
              },
              ACTOR_ID
            );
          },
          'maximum_quantity cannot be lower'
        );

      return message;
    }
  );


  // ==========================================================================
  // TEST 16 - ITEM ACTIVE STATUS
  // ==========================================================================

  runTest(
    'Inventory item active status changes correctly',
    () => {

      item =
        InventoryService.changeItemActive(
          item.item_id,
          false,
          ACTOR_ID
        );

      assertTrue(
        !toBoolean(
          item.active
        ),
        'Item should be inactive.'
      );

      item =
        InventoryService.changeItemActive(
          item.item_id,
          true,
          ACTOR_ID
        );

      assertTrue(
        toBoolean(
          item.active
        ),
        'Item should be active again.'
      );

      return 'Item ACTIVE -> INACTIVE -> ACTIVE verified';
    }
  );


  // ==========================================================================
  // TEST 17 - LOCATION ACTIVE STATUS
  // ==========================================================================

  runTest(
    'Inventory location active status changes correctly',
    () => {

      location =
        InventoryService.changeLocationActive(
          location.location_id,
          false,
          ACTOR_ID
        );

      assertTrue(
        !toBoolean(
          location.active
        ),
        'Location should be inactive.'
      );

      location =
        InventoryService.changeLocationActive(
          location.location_id,
          true,
          ACTOR_ID
        );

      assertTrue(
        toBoolean(
          location.active
        ),
        'Location should be active again.'
      );

      return 'Location ACTIVE -> INACTIVE -> ACTIVE verified';
    }
  );


  // ==========================================================================
  // TEST 18 - INTEGRITY HELPERS
  // ==========================================================================

  runTest(
    'Inventory integrity helpers return no test-data violations',
    () => {

      const checks = [
        {
          name:
            'findDuplicateItemCodes',
          rows:
            InventoryService.findDuplicateItemCodes()
        },
        {
          name:
            'findItemsWithoutCode',
          rows:
            InventoryService.findItemsWithoutCode()
        },
        {
          name:
            'findItemsWithoutName',
          rows:
            InventoryService.findItemsWithoutName()
        },
        {
          name:
            'findInvalidItemTypes',
          rows:
            InventoryService.findInvalidItemTypes()
        },
        {
          name:
            'findInvalidItemNumbers',
          rows:
            InventoryService.findInvalidItemNumbers()
        },
        {
          name:
            'findOrphanPreferredVendors',
          rows:
            InventoryService.findOrphanPreferredVendors()
        },
        {
          name:
            'findOrphanLocationProperties',
          rows:
            InventoryService.findOrphanLocationProperties()
        },
        {
          name:
            'findOrphanLocationUnits',
          rows:
            InventoryService.findOrphanLocationUnits()
        },
        {
          name:
            'findLocationPropertyUnitMismatches',
          rows:
            InventoryService.findLocationPropertyUnitMismatches()
        },
        {
          name:
            'findInvalidLocationTypes',
          rows:
            InventoryService.findInvalidLocationTypes()
        },
        {
          name:
            'findInvalidUnitLocationLinks',
          rows:
            InventoryService.findInvalidUnitLocationLinks()
        },
        {
          name:
            'findDuplicateUnitLocations',
          rows:
            InventoryService.findDuplicateUnitLocations()
        },
        {
          name:
            'findOrphanStockItems',
          rows:
            InventoryService.findOrphanStockItems()
        },
        {
          name:
            'findOrphanStockLocations',
          rows:
            InventoryService.findOrphanStockLocations()
        },
        {
          name:
            'findDuplicateStockRecords',
          rows:
            InventoryService.findDuplicateStockRecords()
        },
        {
          name:
            'findInvalidStockQuantities',
          rows:
            InventoryService.findInvalidStockQuantities()
        },
        {
          name:
            'findReservedGreaterThanOnHand',
          rows:
            InventoryService.findReservedGreaterThanOnHand()
        },
        {
          name:
            'findInvalidStockThresholds',
          rows:
            InventoryService.findInvalidStockThresholds()
        }
      ];

      /*
       * We do not require the entire production inventory dataset to be
       * perfectly clean here because this is a service test, not the full
       * IntegrityCheckService gate.
       *
       * Instead, assert that none of the returned violations is one of
       * the records created by this test.
       */
      checks.forEach(
        check => {

          assertTrue(
            Array.isArray(
              check.rows
            ),
            check.name +
              '() must return an array.'
          );

          const includesTestRecord =
            check.rows.some(
              row =>
                row.item_id ===
                  item.item_id ||
                row.location_id ===
                  location.location_id ||
                row.stock_id ===
                  stock.stock_id
            );

          assertTrue(
            !includesTestRecord,
            check.name +
              '() reported a record created by this test.'
          );
        }
      );

      return (
        checks.length +
        ' integrity helpers verified'
      );
    }
  );


  // ==========================================================================
  // FINAL STATE
  // ==========================================================================

  const finalItem =
    InventoryService.getItemById(
      item.item_id
    );

  const finalLocation =
    InventoryService.getLocationById(
      location.location_id
    );

  const finalStock =
    InventoryService.getStockById(
      stock.stock_id
    );


  log(
    '============================================================'
  );

  log(
    'testInventoryService() SUMMARY'
  );

  log(
    'PASSED: ' +
    passed
  );

  log(
    'FAILED: ' +
    failed
  );

  log(
    'TOTAL: ' +
    (passed + failed)
  );

  log(
    'ITEM: ' +
    finalItem.item_id +
    ' / ' +
    finalItem.item_code
  );

  log(
    'LOCATION: ' +
    finalLocation.location_id +
    ' / ' +
    finalLocation.location_type
  );

  log(
    'STOCK: ' +
    finalStock.stock_id +
    ' | ON_HAND=' +
    finalStock.quantity_on_hand +
    ' | RESERVED=' +
    finalStock.reserved_quantity +
    ' | MIN=' +
    finalStock.minimum_quantity +
    ' | MAX=' +
    finalStock.maximum_quantity
  );

  log(
    '============================================================'
  );

  if (failed > 0) {
    throw new Error(
      'testInventoryService() FAILED. ' +
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
      passed + failed,

    item_id:
      finalItem.item_id,

    location_id:
      finalLocation.location_id,

    stock_id:
      finalStock.stock_id,

    quantity_on_hand:
      Number(
        finalStock.quantity_on_hand || 0
      ),

    reserved_quantity:
      Number(
        finalStock.reserved_quantity || 0
      )
  };
}
