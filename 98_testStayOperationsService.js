/**
 * ============================================================================
 * testStayOperationsService.gs
 * PHASE 4 - STAY OPERATIONS INTEGRATION TEST
 * ============================================================================
 *
 * PURPOSE
 * -------
 * Exercises the cross-domain orchestration implemented by:
 *
 *   54_StayOperationsService.gs
 *
 * The test covers:
 *
 *   1. Create CONFIRMED test reservation
 *   2. Check in -> CHECKED_IN + OCCUPIED
 *   3. Check out -> COMPLETED + DIRTY + CHECKOUT_CLEAN
 *   4. Assign/start cleaning -> CLEANING
 *   5. Complete cleaning -> INSPECTION + inspection created
 *   6. Complete PASS inspection -> READY
 *   7. Maintenance-failure inspection -> MAINTENANCE + work order
 *   8. Complete maintenance -> re-inspection + INSPECTION
 *   9. Complete PASS re-inspection -> READY
 *  10. Aggregated stay workflow query
 *
 * NOTES
 * -----
 * - Uses far-future reservation dates to minimize collision with real data.
 * - Uses existing ACTIVE staff:
 *      HOUSEKEEPER
 *      SUPERVISOR or ADMIN
 *      TECHNICIAN
 * - Uses an existing ACTIVE + READY unit.
 * - Leaves test records in place for auditability.
 * - The unit should finish READY.
 * ============================================================================
 */

function testStayOperationsService() {

  const ACTOR_ID = 'SYSTEM';

  const TEST_CHECK_IN =
    '2099-11-10';

  const TEST_CHECK_OUT =
    '2099-11-12';

  let passed = 0;
  let failed = 0;

  let unit = null;
  let housekeeper = null;
  let inspector = null;
  let technician = null;

  let reservation = null;
  let checkoutTask = null;
  let checkoutInspection = null;
  let maintenanceInspection = null;
  let maintenanceWorkOrder = null;
  let reinspection = null;


  // ==========================================================================
  // TEST HELPERS
  // ==========================================================================

  function normalize(value) {
    return String(
      value === undefined ||
      value === null
        ? ''
        : value
    )
      .trim()
      .toUpperCase();
  }


  function assertTrue(
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
            ? message + ' '
            : ''
        ) +
        'Expected [' +
        expected +
        '] but got [' +
        actual +
        '].'
      );
    }
  }


  function runTest(
    name,
    callback
  ) {

    try {

      callback();

      passed++;

      Logger.log(
        'PASS - ' + name
      );

    } catch (err) {

      failed++;

      Logger.log(
        'FAIL - ' +
        name +
        ': ' +
        err.message
      );

      throw err;
    }
  }


  function findActiveStaffByRoles(
    roles
  ) {

    const allowed =
      new Set(
        roles.map(normalize)
      );

    return StaffService
      .getActiveStaff()
      .find(
        staff =>
          allowed.has(
            normalize(
              staff.role
            )
          )
      ) || null;
  }


  function findReadyActiveUnit() {

    const units =
      BaseRepository.findAll(
        CONFIG.SHEETS.UNITS
      );

    return units.find(
      candidate => {

        if (
          normalize(
            candidate.status
          ) !==
          'ACTIVE'
        ) {
          return false;
        }

        try {

          const operational =
            OperationalStatusService
              .getStatus(
                candidate.unit_id
              );

          return (
            operational &&
            normalize(
              operational
                .operational_status
            ) ===
            'READY'
          );

        } catch (err) {

          return false;
        }
      }
    ) || null;
  }


  function addChecklist(
    inspectionId,
    category,
    item,
    result
  ) {

    return InspectionService
      .addChecklistItem(
        inspectionId,
        {
          category:
            category,

          item:
            item,

          result:
            result,

          notes:
            'StayOperations integration test'
        },
        ACTOR_ID
      );
  }


  // ==========================================================================
  // 1. PREREQUISITES
  // ==========================================================================

  runTest(
    'Resolve Phase 4 test prerequisites',
    function() {

      unit =
        findReadyActiveUnit();

      assertTrue(
        unit,
        'No ACTIVE + READY unit is available for the test.'
      );


      housekeeper =
        findActiveStaffByRoles([
          'HOUSEKEEPER',
          'SUPERVISOR'
        ]);

      assertTrue(
        housekeeper,
        'No ACTIVE HOUSEKEEPER or SUPERVISOR is available.'
      );


      inspector =
        findActiveStaffByRoles([
          'SUPERVISOR',
          'ADMIN'
        ]);

      assertTrue(
        inspector,
        'No ACTIVE SUPERVISOR or ADMIN is available.'
      );


      technician =
        findActiveStaffByRoles([
          'TECHNICIAN'
        ]);

      assertTrue(
        technician,
        'No ACTIVE TECHNICIAN is available.'
      );


      Logger.log(
        'Test unit: ' +
        unit.unit_id
      );

      Logger.log(
        'Housekeeper: ' +
        housekeeper.staff_id
      );

      Logger.log(
        'Inspector: ' +
        inspector.staff_id
      );

      Logger.log(
        'Technician: ' +
        technician.staff_id
      );
    }
  );


  // ==========================================================================
  // 2. CREATE CONFIRMED RESERVATION
  // ==========================================================================

  runTest(
    'Create CONFIRMED test reservation',
    function() {

      const result =
        ReservationWorkflowService
          .createReservation(
            {
              reservation: {

                unit_id:
                  unit.unit_id,

                customer_id:
                  '',

                booking_source:
                  'OTHER',

                check_in_date:
                  TEST_CHECK_IN,

                check_out_date:
                  TEST_CHECK_OUT,

                status:
                  'CONFIRMED'
              },

              guests:
                [],

              ota_sources:
                []
            },
            ACTOR_ID
          );


      reservation =
        result.reservation;


      assertTrue(
        reservation &&
        reservation.reservation_id,
        'Reservation was not created.'
      );


      assertEquals(
        'CONFIRMED',
        normalize(
          reservation.status
        ),
        'Reservation status mismatch.'
      );
    }
  );


  // ==========================================================================
  // 3. CHECK-IN
  // ==========================================================================

  runTest(
    'Check-in -> CHECKED_IN + OCCUPIED',
    function() {

      const result =
        StayOperationsService
          .checkIn(
            reservation.reservation_id,
            ACTOR_ID
          );


      assertEquals(
        'CHECKED_IN',
        normalize(
          result.reservation.status
        ),
        'Reservation did not become CHECKED_IN.'
      );


      assertEquals(
        'OCCUPIED',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not become OCCUPIED.'
      );
    }
  );


  // ==========================================================================
  // 4. CHECK-OUT
  // ==========================================================================

  runTest(
    'Check-out -> COMPLETED + DIRTY + checkout cleaning',
    function() {

      const result =
        StayOperationsService
          .checkOut(
            reservation.reservation_id,
            {
              assigned_to:
                housekeeper.staff_id,

              priority:
                'HIGH',

              inspection_required:
                true,

              notes:
                'StayOperations integration checkout cleaning'
            },
            ACTOR_ID
          );


      assertEquals(
        'COMPLETED',
        normalize(
          result.reservation.status
        ),
        'Reservation did not become COMPLETED.'
      );


      assertEquals(
        'DIRTY',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not become DIRTY.'
      );


      checkoutTask =
        result.housekeeping_task;


      assertTrue(
        checkoutTask &&
        checkoutTask.task_id,
        'Checkout cleaning task was not created.'
      );


      assertEquals(
        'CHECKOUT_CLEAN',
        normalize(
          checkoutTask.task_type
        ),
        'Unexpected housekeeping task type.'
      );


      assertEquals(
        'ASSIGNED',
        normalize(
          checkoutTask.status
        ),
        'Checkout task should be ASSIGNED because assigned_to was supplied.'
      );
    }
  );


  // ==========================================================================
  // 5. START CLEANING
  // ==========================================================================

  runTest(
    'Start cleaning -> IN_PROGRESS + CLEANING',
    function() {

      const result =
        StayOperationsService
          .startCleaning(
            checkoutTask.task_id,
            ACTOR_ID
          );


      assertEquals(
        'IN_PROGRESS',
        normalize(
          result
            .housekeeping_task
            .status
        ),
        'Housekeeping task did not become IN_PROGRESS.'
      );


      assertEquals(
        'CLEANING',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not become CLEANING.'
      );
    }
  );


  // ==========================================================================
  // 6. COMPLETE CLEANING
  // ==========================================================================

  runTest(
    'Complete cleaning -> COMPLETED + INSPECTION',
    function() {

      const result =
        StayOperationsService
          .completeCleaning(
            checkoutTask.task_id,
            {
              inspector_id:
                inspector.staff_id,

              scheduled_at:
                '2099-11-12 14:00:00',

              inspection_type:
                'CHECKOUT',

              notes:
                'Checkout cleaning completed',

              inspection_notes:
                'StayOperations checkout inspection'
            },
            ACTOR_ID
          );


      assertEquals(
        'COMPLETED',
        normalize(
          result
            .housekeeping_task
            .status
        ),
        'Housekeeping task did not become COMPLETED.'
      );


      checkoutInspection =
        result.inspection;


      assertTrue(
        checkoutInspection &&
        checkoutInspection.inspection_id,
        'Checkout inspection was not created.'
      );


      assertEquals(
        'INSPECTION',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not become INSPECTION.'
      );
    }
  );


  // ==========================================================================
  // 7. PREPARE PASS INSPECTION
  // ==========================================================================

  runTest(
    'Prepare checkout inspection checklist',
    function() {

      addChecklist(
        checkoutInspection.inspection_id,
        'CLEANLINESS',
        'StayOps test - room cleanliness',
        'PASS'
      );


      addChecklist(
        checkoutInspection.inspection_id,
        'HOUSEKEEPING',
        'StayOps test - linen and amenities',
        'PASS'
      );


      addChecklist(
        checkoutInspection.inspection_id,
        'MAINTENANCE',
        'StayOps test - visible maintenance condition',
        'PASS'
      );


      const started =
        InspectionService
          .startInspection(
            checkoutInspection.inspection_id,
            ACTOR_ID
          );


      assertEquals(
        'IN_PROGRESS',
        normalize(
          started.status
        ),
        'Inspection did not become IN_PROGRESS.'
      );
    }
  );


  // ==========================================================================
  // 8. PASS INSPECTION
  // ==========================================================================

  runTest(
    'PASS inspection -> READY',
    function() {

      const result =
        StayOperationsService
          .completeInspection(
            checkoutInspection.inspection_id,
            {
              overall_result:
                'PASS',

              cleanliness_score:
                100,

              maintenance_score:
                100,

              notes:
                'StayOperations integration PASS'
            },
            {},
            ACTOR_ID
          );


      assertEquals(
        'PASS',
        normalize(
          result.result
        ),
        'Unexpected inspection result.'
      );


      assertEquals(
        'READY',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not return to READY.'
      );
    }
  );


  // ==========================================================================
  // 9. CREATE MAINTENANCE-FAILURE INSPECTION
  // ==========================================================================

  runTest(
    'Create maintenance-failure inspection',
    function() {

      OperationalStatusService
        .markInspection(
          unit.unit_id,
          'StayOperations maintenance-failure test',
          ACTOR_ID,
          ''
        );


      maintenanceInspection =
        InspectionService
          .createInspection(
            {
              unit_id:
                unit.unit_id,

              reservation_id:
                reservation.reservation_id,

              inspection_type:
                'MANUAL',

              scheduled_at:
                '2099-11-12 15:00:00',

              inspector_id:
                inspector.staff_id,

              cleanliness_score:
                '',

              maintenance_score:
                '',

              overall_result:
                '',

              notes:
                'StayOperations maintenance-failure branch'
            },
            ACTOR_ID
          );


      addChecklist(
        maintenanceInspection.inspection_id,
        'CLEANLINESS',
        'StayOps maintenance branch - cleanliness',
        'PASS'
      );


      addChecklist(
        maintenanceInspection.inspection_id,
        'MAINTENANCE',
        'StayOps maintenance branch - AC test',
        'FAIL'
      );


      const started =
        InspectionService
          .startInspection(
            maintenanceInspection.inspection_id,
            ACTOR_ID
          );


      assertEquals(
        'IN_PROGRESS',
        normalize(
          started.status
        ),
        'Maintenance-failure inspection did not start.'
      );
    }
  );


  // ==========================================================================
  // 10. FAIL INSPECTION -> MAINTENANCE
  // ==========================================================================

  runTest(
    'Maintenance FAIL -> MAINTENANCE + work order',
    function() {

      const result =
        StayOperationsService
          .completeInspection(
            maintenanceInspection.inspection_id,
            {
              overall_result:
                'FAIL',

              cleanliness_score:
                100,

              maintenance_score:
                40,

              notes:
                'AC maintenance issue detected'
            },
            {
              maintenance_assigned_to:
                technician.staff_id,

              maintenance_priority:
                'HIGH',

              maintenance_scheduled_date:
                '2099-11-12',

              maintenance_issue_type:
                'AC_INSPECTION_FAILURE',

              maintenance_description:
                'StayOperations test maintenance failure'
            },
            ACTOR_ID
          );


      assertEquals(
        'FAIL',
        normalize(
          result.result
        ),
        'Expected FAIL inspection result.'
      );


      assertEquals(
        'MAINTENANCE',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not become MAINTENANCE.'
      );


      maintenanceWorkOrder =
        result.maintenance_work_order;


      assertTrue(
        maintenanceWorkOrder &&
        maintenanceWorkOrder.work_order_id,
        'Maintenance work order was not created.'
      );


      assertEquals(
        'INSPECTION',
        normalize(
          maintenanceWorkOrder.source
        ),
        'Work order source should be INSPECTION.'
      );


      assertEquals(
        technician.staff_id,
        maintenanceWorkOrder.assigned_to,
        'Technician was not assigned.'
      );
    }
  );


  // ==========================================================================
  // 11. START MAINTENANCE
  // ==========================================================================

  runTest(
    'Start maintenance work order',
    function() {

      const started =
        MaintenanceService
          .startWorkOrder(
            maintenanceWorkOrder.work_order_id,
            ACTOR_ID
          );


      assertEquals(
        'IN_PROGRESS',
        normalize(
          started.status
        ),
        'Maintenance work order did not become IN_PROGRESS.'
      );


      maintenanceWorkOrder =
        started;
    }
  );


  // ==========================================================================
  // 12. COMPLETE MAINTENANCE -> REINSPECTION
  // ==========================================================================

  runTest(
    'Complete maintenance -> re-inspection + INSPECTION',
    function() {

      const result =
        StayOperationsService
          .completeMaintenanceAndRequestInspection(
            maintenanceWorkOrder.work_order_id,
            'StayOperations test repair completed',
            125,
            {
              inspector_id:
                inspector.staff_id,

              scheduled_at:
                '2099-11-12 17:00:00',

              notes:
                'Verify maintenance repair'
            },
            ACTOR_ID
          );


      assertEquals(
        'COMPLETED',
        normalize(
          result
            .maintenance_work_order
            .status
        ),
        'Maintenance work order did not complete.'
      );


      reinspection =
        result.inspection;


      assertTrue(
        reinspection &&
        reinspection.inspection_id,
        'Re-inspection was not created.'
      );


      assertEquals(
        'INSPECTION',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not return to INSPECTION.'
      );
    }
  );


  // ==========================================================================
  // 13. PREPARE REINSPECTION
  // ==========================================================================

  runTest(
    'Prepare maintenance re-inspection',
    function() {

      addChecklist(
        reinspection.inspection_id,
        'MAINTENANCE',
        'StayOps reinspection - repaired AC',
        'PASS'
      );


      const started =
        InspectionService
          .startInspection(
            reinspection.inspection_id,
            ACTOR_ID
          );


      assertEquals(
        'IN_PROGRESS',
        normalize(
          started.status
        ),
        'Re-inspection did not become IN_PROGRESS.'
      );
    }
  );


  // ==========================================================================
  // 14. PASS REINSPECTION -> READY
  // ==========================================================================

  runTest(
    'PASS re-inspection -> READY',
    function() {

      const result =
        StayOperationsService
          .completeInspection(
            reinspection.inspection_id,
            {
              overall_result:
                'PASS',

              cleanliness_score:
                100,

              maintenance_score:
                100,

              notes:
                'Maintenance repair verified'
            },
            {},
            ACTOR_ID
          );


      assertEquals(
        'READY',
        normalize(
          result
            .operational_status
            .operational_status
        ),
        'Unit did not return to READY after re-inspection.'
      );
    }
  );


  // ==========================================================================
  // 15. AGGREGATED WORKFLOW VIEW
  // ==========================================================================

  runTest(
    'Get aggregated stay operations view',
    function() {

      const workflow =
        StayOperationsService
          .getStayOperations(
            reservation.reservation_id
          );


      assertEquals(
        reservation.reservation_id,
        workflow
          .reservation
          .reservation_id,
        'Workflow reservation mismatch.'
      );


      assertEquals(
        'COMPLETED',
        normalize(
          workflow
            .reservation
            .status
        ),
        'Final reservation status should be COMPLETED.'
      );


      assertEquals(
        'READY',
        normalize(
          workflow
            .operational_status
            .operational_status
        ),
        'Final unit status should be READY.'
      );


      assertTrue(
        Array.isArray(
          workflow.housekeeping_tasks
        ),
        'housekeeping_tasks must be an array.'
      );


      assertTrue(
        Array.isArray(
          workflow.inspections
        ),
        'inspections must be an array.'
      );


      assertTrue(
        Array.isArray(
          workflow.maintenance_work_orders
        ),
        'maintenance_work_orders must be an array.'
      );


      assertTrue(
        workflow.housekeeping_tasks.length >= 1,
        'Expected at least one housekeeping task.'
      );


      assertTrue(
        workflow.inspections.length >= 3,
        'Expected checkout inspection, failure inspection, and re-inspection.'
      );


      assertTrue(
        workflow.maintenance_work_orders.length >= 1,
        'Expected at least one maintenance work order.'
      );
    }
  );


  // ==========================================================================
  // FINAL SUMMARY
  // ==========================================================================

  const finalStatus =
    OperationalStatusService
      .getStatus(
        unit.unit_id
      );


  const summary = {

    passed:
      passed,

    failed:
      failed,

    total:
      passed + failed,

    unit_id:
      unit.unit_id,

    reservation_id:
      reservation
        ? reservation.reservation_id
        : '',

    checkout_task_id:
      checkoutTask
        ? checkoutTask.task_id
        : '',

    checkout_inspection_id:
      checkoutInspection
        ? checkoutInspection.inspection_id
        : '',

    maintenance_inspection_id:
      maintenanceInspection
        ? maintenanceInspection.inspection_id
        : '',

    maintenance_work_order_id:
      maintenanceWorkOrder
        ? maintenanceWorkOrder.work_order_id
        : '',

    reinspection_id:
      reinspection
        ? reinspection.inspection_id
        : '',

    final_operational_status:
      finalStatus
        ? finalStatus.operational_status
        : ''
  };


  Logger.log(
    '============================================================'
  );

  Logger.log(
    'STAY OPERATIONS TEST SUMMARY'
  );

  Logger.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );

  Logger.log(
    '============================================================'
  );


  if (failed > 0) {

    throw new Error(
      'StayOperationsService test failed. ' +
      'Passed: ' +
      passed +
      ', Failed: ' +
      failed
    );
  }


  return summary;
}
