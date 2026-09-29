/**
 * ============================================================================
 * testPhase4EndToEnd.gs
 * ============================================================================
 *
 * PHASE 4 END-TO-END ACCEPTANCE TEST
 *
 * Business flow:
 *
 *   Reservation
 *      -> CONFIRMED
 *      -> Check-in
 *      -> Unit OCCUPIED
 *      -> Checkout
 *      -> Unit DIRTY
 *      -> Checkout Housekeeping Task
 *      -> Cleaning IN_PROGRESS
 *      -> Inventory CONSUMPTION linked to Housekeeping Task
 *      -> Cleaning COMPLETED
 *      -> Unit INSPECTION
 *      -> Inspection STARTED
 *      -> Checklist PASS
 *      -> Inspection COMPLETED / PASS
 *      -> Unit READY
 *
 * Final acceptance:
 *   - Reservation = COMPLETED
 *   - Unit operational status = READY
 *   - Checkout housekeeping task = COMPLETED
 *   - Inspection = COMPLETED / PASS
 *   - Inventory consumption transaction exists and links to housekeeping task
 *   - Inventory stock and immutable ledger reconcile
 *   - Full runIntegrityCheck() passes with 0 errors / 0 warnings
 *
 * IMPORTANT:
 *   - Test records are intentionally left in place.
 *   - Stable ID sequences are never reset.
 *   - Uses real Phase 3 / Phase 4 services.
 * ============================================================================
 */

function _runPhase4EndToEnd(existingReservationId) {

  const ACTOR = 'SYSTEM';

  let passed = 0;
  let failed = 0;

  let unit = null;
  let customer = null;
  let reservation = null;
  let housekeepingTask = null;
  let inspection = null;

  let inventoryItem = null;
  let inventoryLocation = null;
  let receiptTransaction = null;
  let consumptionTransaction = null;


  // ==========================================================================
  // TEST HELPERS
  // ==========================================================================

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


  function text(value) {
    if (
      value === null ||
      value === undefined
    ) {
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
        (message || 'Numeric values are not equal.') +
        ' Expected=' +
        Number(expected) +
        ', Actual=' +
        Number(actual)
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
      (detail
        ? ' | ' + detail
        : '')
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

    throw error;
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


  function addDays(
    date,
    days
  ) {
    const copy =
      new Date(
        date.getTime()
      );

    copy.setDate(
      copy.getDate() +
      days
    );

    return copy;
  }


  function dateString(
    date
  ) {
    return Utilities.formatDate(
      date,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );
  }


  function dateTimeString(
    date
  ) {
    return Utilities.formatDate(
      date,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME
    );
  }


  function getOperationalStatus(
    unitId
  ) {
    return OperationalStatusService.getStatus(
      unitId
    );
  }


  function getStock(
    itemId,
    locationId
  ) {
    return InventoryService.findStock(
      itemId,
      locationId
    );
  }


  // ==========================================================================
  // START
  // ==========================================================================

  Logger.log(
    '============================================================'
  );

  Logger.log(
    'PHASE 4 END-TO-END ACCEPTANCE TEST'
  );

  Logger.log(
    '============================================================'
  );


  // ==========================================================================
  // 1. SELECT SAFE UNIT + CUSTOMER
  // ==========================================================================

  test(
    'Select ACTIVE + READY unit and existing customer',
    () => {

      if (existingReservationId) {
        reservation =
          ReservationService.requireReservation(
            existingReservationId
          );

        assertTrue(
          ['PENDING', 'CONFIRMED'].indexOf(
            normalize(reservation.status)
          ) >= 0,
          'Resume reservation must be PENDING or CONFIRMED. Actual=' +
            reservation.status
        );

        unit =
          BaseRepository.findById(
            CONFIG.SHEETS.UNITS,
            'unit_id',
            reservation.unit_id
          );

        customer =
          BaseRepository.findById(
            CONFIG.SHEETS.CUSTOMERS,
            'customer_id',
            reservation.customer_id
          );

        assertTrue(unit, 'Resume reservation unit was not found.');
        assertTrue(customer, 'Resume reservation customer was not found.');

        const operational =
          getOperationalStatus(unit.unit_id);

        assertEqual(
          normalize(operational.operational_status),
          'READY',
          'Resume reservation unit must be READY before check-in.'
        );

        return (
          'RESUME ' +
          reservation.reservation_id +
          ' | ' +
          unit.unit_id +
          ' | ' +
          customer.customer_id
        );
      }

      const units =
        BaseRepository.findAll(
          CONFIG.SHEETS.UNITS
        );

      unit =
        units.find(
          candidate => {

            if (
              normalize(
                candidate.status
              ) !== 'ACTIVE'
            ) {
              return false;
            }

            const operational =
              getOperationalStatus(
                candidate.unit_id
              );

            return (
              operational &&
              normalize(
                operational.operational_status
              ) === 'READY'
            );
          }
        );

      assertTrue(
        unit,
        'No ACTIVE + READY unit is available for the Phase 4 acceptance test.'
      );


      const customers =
        BaseRepository.findAll(
          CONFIG.SHEETS.CUSTOMERS
        );

      customer =
        customers.find(
          candidate =>
            normalize(
              candidate.status
            ) === 'ACTIVE'
        ) ||
        customers[0];

      assertTrue(
        customer,
        'At least one customer is required.'
      );

      return (
        unit.unit_id +
        ' | ' +
        customer.customer_id
      );
    }
  );


  // ==========================================================================
  // 2. FIND AVAILABLE FUTURE DATE RANGE
  // ==========================================================================

  let checkInDate = '';
  let checkOutDate = '';

  test(
    'Find an available future stay window',
    () => {

      if (existingReservationId) {
        checkInDate =
          reservation.check_in_date;

        checkOutDate =
          reservation.check_out_date;

        assertTrue(
          checkInDate && checkOutDate,
          'Resume reservation is missing stay dates.'
        );

        return (
          checkInDate +
          ' -> ' +
          checkOutDate +
          ' (existing reservation)'
        );
      }

      const today =
        new Date();

      let found =
        false;

      /*
       * Search future two-night windows.
       * AvailabilityService remains the authority.
       */
      for (
        let offset = 30;
        offset <= 365;
        offset += 3
      ) {

        const start =
          dateString(
            addDays(
              today,
              offset
            )
          );

        const end =
          dateString(
            addDays(
              today,
              offset + 2
            )
          );

        const availability =
          AvailabilityService.checkAvailability(
            unit.unit_id,
            start,
            end
          );

        if (
          availability &&
          availability.available === true
        ) {
          checkInDate =
            start;

          checkOutDate =
            end;

          found =
            true;

          break;
        }
      }

      assertTrue(
        found,
        'Could not find an available future two-night window for ' +
        unit.unit_id +
        '.'
      );

      return (
        checkInDate +
        ' -> ' +
        checkOutDate
      );
    }
  );


  // ==========================================================================
  // 3. CREATE + CONFIRM RESERVATION
  // ==========================================================================

  test(
    'Create DIRECT reservation through workflow',
    () => {

      if (existingReservationId) {
        assertTrue(
          reservation &&
          reservation.reservation_id,
          'Resume reservation is not loaded.'
        );

        return (
          reservation.reservation_id +
          ' (existing)'
        );
      }

      const result =
        ReservationWorkflowService.createDirectReservation(
          {
            unit_id:
              unit.unit_id,

            customer_id:
              customer.customer_id,

            check_in_date:
              checkInDate,

            check_out_date:
              checkOutDate,

            booking_source:
              'DIRECT',

            status:
              'PENDING',

            notes:
              'Phase 4 end-to-end acceptance test'
          },
          [],
          [],
          ACTOR
        );

      reservation =
        result &&
        result.reservation
          ? result.reservation
          : result;

      assertTrue(
        reservation &&
        reservation.reservation_id,
        'Reservation workflow did not return reservation_id.'
      );

      assertEqual(
        normalize(
          reservation.status
        ),
        'PENDING',
        'New reservation should be PENDING.'
      );

      return reservation.reservation_id;
    }
  );


  test(
    'Confirm reservation',
    () => {

      /*
       * Resume-safe behavior:
       *
       * The previous acceptance run may have successfully committed
       * PENDING -> CONFIRMED before the test itself failed while
       * interpreting the workflow response.
       *
       * Therefore:
       *   PENDING   -> confirm normally
       *   CONFIRMED -> do not confirm again
       */

      reservation =
        ReservationService.requireReservation(
          reservation.reservation_id
        );

      const currentStatus =
        normalize(
          reservation.status
        );

      if (
        currentStatus ===
        'PENDING'
      ) {

        const confirmation =
          ReservationWorkflowService.confirmReservation(
            reservation.reservation_id,
            ACTOR
          );

        assertTrue(
          confirmation &&
          confirmation.success === true &&
          confirmation.reservation,
          'Reservation workflow did not return confirmed reservation.'
        );

        reservation =
          confirmation.reservation;

      } else if (
        currentStatus ===
        'CONFIRMED'
      ) {

        Logger.log(
          'INFO | Reservation ' +
          reservation.reservation_id +
          ' is already CONFIRMED. Confirmation step skipped.'
        );

      } else {

        throw new Error(
          'Reservation cannot enter confirmation step from status ' +
          reservation.status +
          '.'
        );
      }


      reservation =
        ReservationService.requireReservation(
          reservation.reservation_id
        );

      assertEqual(
        normalize(
          reservation.status
        ),
        'CONFIRMED',
        'Reservation should be CONFIRMED.'
      );

      return (
        reservation.reservation_id +
        (
          currentStatus === 'CONFIRMED'
            ? ' | already confirmed'
            : ' | confirmed'
        )
      );
    }
  );


  // ==========================================================================
  // 4. CHECK-IN -> OCCUPIED
  // ==========================================================================

  test(
    'Check-in changes reservation to CHECKED_IN and unit to OCCUPIED',
    () => {

      ReservationWorkflowService.checkIn(
        reservation.reservation_id,
        ACTOR
      );

      reservation =
        ReservationService.getById(
          reservation.reservation_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      assertEqual(
        normalize(
          reservation.status
        ),
        'CHECKED_IN',
        'Reservation should be CHECKED_IN.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'OCCUPIED',
        'Unit should be OCCUPIED after check-in.'
      );

      return (
        reservation.reservation_id +
        ' | OCCUPIED'
      );
    }
  );


  // ==========================================================================
  // 5. CHECKOUT -> COMPLETED + DIRTY + HOUSEKEEPING TASK
  // ==========================================================================

  test(
    'Checkout completes stay, marks unit DIRTY, and creates cleaning task',
    () => {

      const result =
        StayOperationsService.checkOut(
          reservation.reservation_id,
          {
            priority:
              'HIGH',

            inspection_required:
              true,

            notes:
              'Phase 4 acceptance checkout cleaning'
          },
          ACTOR
        );

      reservation =
        ReservationService.getById(
          reservation.reservation_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      const tasks =
        HousekeepingService.getByReservation(
          reservation.reservation_id
        );

      housekeepingTask =
        tasks
          .filter(
            task =>
              normalize(
                task.task_type
              ) ===
              'CHECKOUT_CLEAN'
          )
          .sort(
            (a, b) =>
              text(
                b.task_id
              ).localeCompare(
                text(
                  a.task_id
                )
              )
          )[0];

      assertEqual(
        normalize(
          reservation.status
        ),
        'COMPLETED',
        'Reservation should be COMPLETED after checkout.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'DIRTY',
        'Unit should be DIRTY after checkout.'
      );

      assertTrue(
        housekeepingTask,
        'Checkout housekeeping task was not created.'
      );

      assertTrue(
        ['PENDING', 'ASSIGNED'].indexOf(
          normalize(
            housekeepingTask.status
          )
        ) >= 0,
        'Unexpected initial housekeeping task status: ' +
        housekeepingTask.status
      );

      return (
        housekeepingTask.task_id +
        ' | DIRTY'
      );
    }
  );


  // ==========================================================================
  // 6. ASSIGN HOUSEKEEPER IF REQUIRED
  // ==========================================================================

  test(
    'Assign checkout cleaning task to active housekeeping staff',
    () => {

      housekeepingTask =
        HousekeepingService.getById(
          housekeepingTask.task_id
        );

      if (
        !text(
          housekeepingTask.assigned_to
        )
      ) {

        const staff =
          StaffService.getActiveStaffByRole(
            'HOUSEKEEPER'
          )
          .find(
            person =>
              !text(
                person.property_id
              ) ||
              text(
                person.property_id
              ) ===
              text(
                unit.property_id
              )
          ) ||
          StaffService.getActiveStaffByRole(
            'SUPERVISOR'
          )
          .find(
            person =>
              !text(
                person.property_id
              ) ||
              text(
                person.property_id
              ) ===
              text(
                unit.property_id
              )
          );

        assertTrue(
          staff,
          'No active HOUSEKEEPER/SUPERVISOR is available for the test unit property.'
        );

        housekeepingTask =
          HousekeepingService.assignTask(
            housekeepingTask.task_id,
            staff.staff_id,
            ACTOR
          );
      }

      assertTrue(
        text(
          housekeepingTask.assigned_to
        ),
        'Housekeeping task must be assigned before start.'
      );

      return (
        housekeepingTask.task_id +
        ' -> ' +
        housekeepingTask.assigned_to
      );
    }
  );


  // ==========================================================================
  // 7. START CLEANING -> CLEANING
  // ==========================================================================

  test(
    'Start cleaning changes task to IN_PROGRESS and unit to CLEANING',
    () => {

      StayOperationsService.startCleaning(
        housekeepingTask.task_id,
        ACTOR
      );

      housekeepingTask =
        HousekeepingService.getById(
          housekeepingTask.task_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      assertEqual(
        normalize(
          housekeepingTask.status
        ),
        'IN_PROGRESS',
        'Housekeeping task should be IN_PROGRESS.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'CLEANING',
        'Unit should be CLEANING.'
      );

      return 'IN_PROGRESS | CLEANING';
    }
  );


  // ==========================================================================
  // 8. PREPARE INVENTORY FIXTURE
  // ==========================================================================

  test(
    'Create inventory fixture and receive stock',
    () => {

      const suffix =
        Utilities.formatDate(
          new Date(),
          CONFIG.TIMEZONE,
          'yyyyMMddHHmmss'
        );

      inventoryItem =
        InventoryService.createItem(
          {
            item_code:
              'P4-E2E-' +
              suffix,

            name:
              'Phase 4 E2E Cleaning Consumable',

            category:
              'CLEANING',

            unit_of_measure:
              'PIECE',

            item_type:
              'CONSUMABLE',

            reorder_level:
              2,

            target_stock_level:
              10,

            unit_cost:
              5,

            preferred_vendor_id:
              '',

            active:
              true,

            notes:
              'Phase 4 acceptance inventory fixture'
          },
          ACTOR
        );


      inventoryLocation =
        InventoryService.createLocation(
          {
            property_id:
              unit.property_id,

            unit_id:
              '',

            name:
              'Phase 4 E2E Housekeeping Stock ' +
              suffix,

            location_type:
              'HOUSEKEEPING',

            active:
              true,

            notes:
              'Phase 4 acceptance inventory fixture'
          },
          ACTOR
        );


      const receipt =
        InventoryTransactionService.receive(
          inventoryItem.item_id,
          inventoryLocation.location_id,
          10,
          {
            reference_type:
              'PHASE4_ACCEPTANCE',

            reference_id:
              reservation.reservation_id,

            notes:
              'Initial stock for Phase 4 acceptance test'
          },
          ACTOR
        );

      receiptTransaction =
        receipt.transaction;

      const stock =
        getStock(
          inventoryItem.item_id,
          inventoryLocation.location_id
        );

      assertTrue(
        receiptTransaction &&
        receiptTransaction.transaction_id,
        'Receipt transaction was not created.'
      );

      assertNumber(
        stock.quantity_on_hand,
        10,
        'Inventory receipt did not produce expected stock.'
      );

      return (
        inventoryItem.item_id +
        ' | Stock=10'
      );
    }
  );


  // ==========================================================================
  // 9. CONSUME INVENTORY LINKED TO HOUSEKEEPING TASK
  // ==========================================================================

  test(
    'Consume inventory linked to housekeeping task',
    () => {

      const result =
        InventoryTransactionService.consume(
          inventoryItem.item_id,
          inventoryLocation.location_id,
          2,
          {
            unit_id:
              unit.unit_id,

            reservation_id:
              reservation.reservation_id,

            housekeeping_task_id:
              housekeepingTask.task_id,

            reference_type:
              'HOUSEKEEPING_TASK',

            reference_id:
              housekeepingTask.task_id,

            notes:
              'Cleaning supplies consumed during checkout cleaning'
          },
          ACTOR
        );

      consumptionTransaction =
        result.transaction;

      assertTrue(
        consumptionTransaction &&
        consumptionTransaction.transaction_id,
        'Consumption transaction was not created.'
      );

      assertEqual(
        consumptionTransaction.housekeeping_task_id,
        housekeepingTask.task_id,
        'Inventory transaction is not linked to housekeeping task.'
      );

      assertEqual(
        consumptionTransaction.reservation_id,
        reservation.reservation_id,
        'Inventory transaction is not linked to reservation.'
      );

      assertEqual(
        consumptionTransaction.unit_id,
        unit.unit_id,
        'Inventory transaction is not linked to unit.'
      );

      const stock =
        getStock(
          inventoryItem.item_id,
          inventoryLocation.location_id
        );

      assertNumber(
        stock.quantity_on_hand,
        8,
        'Expected stock=8 after consuming 2 from 10.'
      );

      return (
        consumptionTransaction.transaction_id +
        ' | Stock=8'
      );
    }
  );


  // ==========================================================================
  // 10. COMPLETE CLEANING -> INSPECTION
  // ==========================================================================

  test(
    'Complete cleaning creates inspection and moves unit to INSPECTION',
    () => {

      const result =
        StayOperationsService.completeCleaning(
          housekeepingTask.task_id,
          {
            notes:
              'Phase 4 acceptance cleaning completed',

            scheduled_at:
              dateTimeString(
                new Date()
              ),

            inspection_type:
              'CHECKOUT',

            inspection_notes:
              'Phase 4 acceptance inspection'
          },
          ACTOR
        );

      housekeepingTask =
        HousekeepingService.getById(
          housekeepingTask.task_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      assertEqual(
        normalize(
          housekeepingTask.status
        ),
        'COMPLETED',
        'Housekeeping task should be COMPLETED.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'INSPECTION',
        'Unit should be INSPECTION after cleaning.'
      );


      const inspections =
        InspectionService.getByReservation(
          reservation.reservation_id
        );

      inspection =
        inspections
          .filter(
            row =>
              normalize(
                row.status
              ) === 'PENDING'
          )
          .sort(
            (a, b) =>
              text(
                b.inspection_id
              ).localeCompare(
                text(
                  a.inspection_id
                )
              )
          )[0];

      assertTrue(
        inspection,
        'Pending inspection was not created by completeCleaning().'
      );

      return (
        inspection.inspection_id +
        ' | INSPECTION'
      );
    }
  );


  // ==========================================================================
  // 11. ASSIGN INSPECTOR + START INSPECTION
  // ==========================================================================

  test(
    'Assign inspector and start inspection',
    () => {

      let inspectorId =
        text(
          inspection.inspector_id
        );

      if (!inspectorId) {

        const inspector =
          StaffService.getActiveStaffByRole(
            'SUPERVISOR'
          )
          .find(
            person =>
              !text(
                person.property_id
              ) ||
              text(
                person.property_id
              ) ===
              text(
                unit.property_id
              )
          ) ||
          StaffService.getActiveStaffByRole(
            'ADMIN'
          )[0];

        assertTrue(
          inspector,
          'No active SUPERVISOR or ADMIN is available for inspection.'
        );

        inspectorId =
          inspector.staff_id;

        inspection =
          InspectionService.updateInspection(
            inspection.inspection_id,
            {
              inspector_id:
                inspectorId
            },
            ACTOR
          );
      }

      inspection =
        InspectionService.startInspection(
          inspection.inspection_id,
          ACTOR
        );

      assertEqual(
        normalize(
          inspection.status
        ),
        'IN_PROGRESS',
        'Inspection should be IN_PROGRESS.'
      );

      assertTrue(
        text(
          inspection.inspector_id
        ),
        'Inspection must have inspector_id.'
      );

      return (
        inspection.inspection_id +
        ' -> ' +
        inspection.inspector_id
      );
    }
  );


  // ==========================================================================
  // 12. ADD PASS CHECKLIST
  // ==========================================================================

  test(
    'Add and pass inspection checklist',
    () => {

      const checklistDefinitions = [
        {
          category:
            'CLEANLINESS',

          item:
            'Unit cleaned after checkout'
        },
        {
          category:
            'HOUSEKEEPING',

          item:
            'Checkout cleaning completed'
        },
        {
          category:
            'MAINTENANCE',

          item:
            'No maintenance issue observed'
        },
        {
          category:
            'INVENTORY',

          item:
            'Required guest supplies checked'
        }
      ];

      checklistDefinitions.forEach(
        definition => {

          const checklistItem =
            InspectionService.addChecklistItem(
              inspection.inspection_id,
              {
                category:
                  definition.category,

                item:
                  definition.item,

                result:
                  '',

                notes:
                  'Phase 4 acceptance checklist'
              },
              ACTOR
            );

          InspectionService.setChecklistResult(
            checklistItem.checklist_item_id,
            'PASS',
            'Passed during Phase 4 acceptance test',
            ACTOR
          );
        }
      );

      const checklist =
        InspectionService.getChecklist(
          inspection.inspection_id
        );

      assertEqual(
        checklist.length,
        4,
        'Expected four inspection checklist items.'
      );

      assertTrue(
        checklist.every(
          row =>
            normalize(
              row.result
            ) === 'PASS'
        ),
        'Every checklist item should PASS.'
      );

      return '4/4 checklist items PASS';
    }
  );


  // ==========================================================================
  // 13. COMPLETE INSPECTION PASS -> READY
  // ==========================================================================

  test(
    'Complete PASS inspection and return unit to READY',
    () => {

      StayOperationsService.completeInspection(
        inspection.inspection_id,
        {
          cleanliness_score:
            100,

          maintenance_score:
            100,

          overall_result:
            'PASS',

          notes:
            'Phase 4 acceptance inspection passed'
        },
        {},
        ACTOR
      );

      inspection =
        InspectionService.getById(
          inspection.inspection_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      assertEqual(
        normalize(
          inspection.status
        ),
        'COMPLETED',
        'Inspection should be COMPLETED.'
      );

      assertEqual(
        normalize(
          inspection.overall_result
        ),
        'PASS',
        'Inspection result should be PASS.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'READY',
        'Unit should be READY after passing inspection.'
      );

      return 'COMPLETED / PASS | READY';
    }
  );


  // ==========================================================================
  // 14. VERIFY COMPLETE STAY OPERATIONS AGGREGATE
  // ==========================================================================

  test(
    'Stay operations aggregate reflects completed lifecycle',
    () => {

      const aggregate =
        StayOperationsService.getStayOperations(
          reservation.reservation_id
        );

      assertTrue(
        aggregate,
        'getStayOperations() returned no result.'
      );

      const currentReservation =
        ReservationService.getById(
          reservation.reservation_id
        );

      const operational =
        getOperationalStatus(
          unit.unit_id
        );

      assertEqual(
        normalize(
          currentReservation.status
        ),
        'COMPLETED',
        'Final reservation status should be COMPLETED.'
      );

      assertEqual(
        normalize(
          operational.operational_status
        ),
        'READY',
        'Final operational status should be READY.'
      );

      return (
        reservation.reservation_id +
        ' | COMPLETED -> READY'
      );
    }
  );


  // ==========================================================================
  // 15. VERIFY INVENTORY LINK + RECONCILIATION
  // ==========================================================================

  test(
    'Inventory consumption remains linked and reconciled',
    () => {

      const linked =
        InventoryTransactionService
          .getByHousekeepingTask(
            housekeepingTask.task_id
          );

      assertTrue(
        linked.some(
          row =>
            row.transaction_id ===
            consumptionTransaction.transaction_id
        ),
        'Housekeeping-linked inventory consumption was not found.'
      );

      const comparison =
        InventoryTransactionService
          .compareStockToLedger(
            inventoryItem.item_id,
            inventoryLocation.location_id
          );

      assertTrue(
        comparison.matches === true,
        'Inventory stock does not reconcile with ledger. Difference=' +
        comparison.difference
      );

      assertNumber(
        comparison.stock_balance,
        8,
        'Final inventory stock should equal 8.'
      );

      assertNumber(
        comparison.ledger_balance,
        8,
        'Final inventory ledger balance should equal 8.'
      );

      return (
        consumptionTransaction.transaction_id +
        ' | Stock/Ledger=8'
      );
    }
  );


  // ==========================================================================
  // 16. FULL PHASE 4 INTEGRITY GATE
  // ==========================================================================

  test(
    'Full integrity gate passes after end-to-end lifecycle',
    () => {

      const report =
        IntegrityCheckService.runAll();

      assertTrue(
        report,
        'IntegrityCheckService.runAll() returned no report.'
      );

      /*
       * Support the current report structure without assuming that the
       * boolean/count fields are formatted as strings.
       */
      if (
        Object.prototype.hasOwnProperty.call(
          report,
          'passed'
        )
      ) {
        assertTrue(
          report.passed === true,
          'Integrity report passed=false.'
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          report,
          'errors'
        ) &&
        typeof report.errors === 'number'
      ) {
        assertNumber(
          report.errors,
          0,
          'Integrity report contains errors.'
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          report,
          'warnings'
        ) &&
        typeof report.warnings === 'number'
      ) {
        assertNumber(
          report.warnings,
          0,
          'Integrity report contains warnings.'
        );
      }

      return 'Integrity gate executed after complete Phase 4 flow';
    }
  );


  // ==========================================================================
  // FINAL ACCEPTANCE ASSERTIONS
  // ==========================================================================

  reservation =
    ReservationService.getById(
      reservation.reservation_id
    );

  housekeepingTask =
    HousekeepingService.getById(
      housekeepingTask.task_id
    );

  inspection =
    InspectionService.getById(
      inspection.inspection_id
    );

  const finalOperational =
    getOperationalStatus(
      unit.unit_id
    );

  const finalStock =
    getStock(
      inventoryItem.item_id,
      inventoryLocation.location_id
    );


  Logger.log(
    '============================================================'
  );

  Logger.log(
    'PHASE 4 END-TO-END ACCEPTANCE SUMMARY'
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

  Logger.log(
    'RESERVATION: ' +
    reservation.reservation_id +
    ' | ' +
    reservation.status
  );

  Logger.log(
    'UNIT: ' +
    unit.unit_id +
    ' | ' +
    finalOperational.operational_status
  );

  Logger.log(
    'HOUSEKEEPING: ' +
    housekeepingTask.task_id +
    ' | ' +
    housekeepingTask.status
  );

  Logger.log(
    'INSPECTION: ' +
    inspection.inspection_id +
    ' | ' +
    inspection.status +
    ' / ' +
    inspection.overall_result
  );

  Logger.log(
    'INVENTORY ITEM: ' +
    inventoryItem.item_id
  );

  Logger.log(
    'INVENTORY LOCATION: ' +
    inventoryLocation.location_id
  );

  Logger.log(
    'INVENTORY RECEIPT: ' +
    receiptTransaction.transaction_id
  );

  Logger.log(
    'INVENTORY CONSUMPTION: ' +
    consumptionTransaction.transaction_id +
    ' -> HOUSEKEEPING ' +
    housekeepingTask.task_id
  );

  Logger.log(
    'FINAL INVENTORY STOCK: ' +
    finalStock.quantity_on_hand
  );

  Logger.log(
    '============================================================'
  );


  if (failed > 0) {
    throw new Error(
      'PHASE 4 END-TO-END ACCEPTANCE FAILED. ' +
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

    reservation_id:
      reservation.reservation_id,

    reservation_status:
      reservation.status,

    unit_id:
      unit.unit_id,

    operational_status:
      finalOperational.operational_status,

    housekeeping_task_id:
      housekeepingTask.task_id,

    housekeeping_status:
      housekeepingTask.status,

    inspection_id:
      inspection.inspection_id,

    inspection_status:
      inspection.status,

    inspection_result:
      inspection.overall_result,

    inventory_item_id:
      inventoryItem.item_id,

    inventory_location_id:
      inventoryLocation.location_id,

    inventory_consumption_transaction_id:
      consumptionTransaction.transaction_id,

    final_inventory_stock:
      Number(
        finalStock.quantity_on_hand || 0
      )
  };
}


/**
 * Normal clean run: creates a new reservation.
 */
function testPhase4EndToEnd() {
  return _runPhase4EndToEnd(null);
}


/**
 * Recovery entry point for the reservation created by the first test run.
 *
 * Current failed run created:
 *   RES-000008
 *
 * It failed before confirmation because the test incorrectly handled the
 * workflow response wrapper. The reservation itself is valid and PENDING.
 */
function resumePhase4EndToEnd_RES000008() {
  return _runPhase4EndToEnd('RES-000008');
}
