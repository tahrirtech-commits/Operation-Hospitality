/**
 * ============================================================================
 * testAdminOperationsService.gs
 * PHASE 6.3 - ADMIN OPERATIONS FACADE ACCEPTANCE
 * ============================================================================
 *
 * NON-DESTRUCTIVE.
 * Validates reads, property isolation and delegation contracts.
 * It deliberately does not execute lifecycle writes.
 *
 * Acceptance: FAILED = 0
 * ============================================================================
 */

function testAdminOperationsService() {
  Logger.log("===== PHASE 6.3 ADMIN OPERATIONS SERVICE TEST START =====");

  const results = [];

  function pass(name, detail) {
    results.push({ name: name, passed: true, detail: detail || "" });
    Logger.log("PASS: " + name + (detail ? " | " + detail : ""));
  }

  function fail(name, err) {
    const msg = err && err.message ? err.message : String(err);
    results.push({ name: name, passed: false, detail: msg });
    Logger.log("FAIL: " + name + " | " + msg);
  }

  function assertTrue(v, msg) {
    if (!v) throw new Error(msg || "Assertion failed.");
  }

  function assertEqual(expected, actual, msg) {
    if (String(expected) !== String(actual)) {
      throw new Error(
        (msg ? msg + " | " : "") +
          "Expected=" +
          expected +
          ", Actual=" +
          actual,
      );
    }
  }

  function run(name, fn) {
    try {
      pass(name, fn() || "");
    } catch (err) {
      fail(name, err);
    }
  }

  const properties = PropertyService.getAllProperties();
  assertTrue(properties.length > 0, "No properties found.");

  const property = properties[0];
  const propertyId = property.property_id;
  const units = UnitService.getUnitsByProperty(propertyId);
  assertTrue(units.length > 0, "No units found.");

  const unit = units[0];

  Logger.log("Property: " + propertyId);
  Logger.log("Unit: " + unit.unit_id);

  run("1. Public facade methods exist", () => {
    const methods = [
      "getOperationsBoard",
      "getUnitOperations",
      "getStayOperations",
      "getTodayHousekeeping",
      "getOverdueHousekeeping",
      "getPendingInspections",
      "getOpenMaintenance",
      "getDueHousekeepingSchedules",
      "checkIn",
      "checkOut",
      "startCleaning",
      "completeCleaning",
      "completeInspection",
      "applyInspectionResult",
      "completeMaintenanceAndRequestInspection",
      "assignHousekeepingTask",
      "cancelHousekeepingTask",
      "startInspection",
      "setChecklistResult",
      "cancelInspection",
      "createManualWorkOrder",
      "assignTechnician",
      "scheduleWorkOrder",
      "startWorkOrder",
    ];

    methods.forEach((name) =>
      assertTrue(
        typeof AdminOperationsService[name] === "function",
        "Missing method: " + name,
      ),
    );

    return methods.length + " methods";
  });

  let board;

  run("2. Operations board loads", () => {
    board = AdminOperationsService.getOperationsBoard(propertyId);

    assertEqual(propertyId, board.property.property_id);
    assertTrue(Array.isArray(board.units), "units missing");
    assertTrue(Array.isArray(board.housekeeping), "housekeeping missing");
    assertTrue(Array.isArray(board.inspections), "inspections missing");
    assertTrue(Array.isArray(board.maintenance), "maintenance missing");

    return (
      "units=" +
      board.units.length +
      ", housekeeping=" +
      board.housekeeping.length +
      ", inspections=" +
      board.inspections.length +
      ", maintenance=" +
      board.maintenance.length
    );
  });

  run("3. Board contains all property units", () => {
    assertEqual(units.length, board.units.length);
    return "units=" + units.length;
  });

  run("4. Board is property isolated", () => {
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));

    []
      .concat(board.housekeeping, board.inspections, board.maintenance)
      .forEach((row) => {
        assertTrue(
          unitIds.has(String(row.unit_id).trim()),
          "Cross-property row: " + row.unit_id,
        );
      });

    return "property isolation verified";
  });

  run("5. Unit operations match domain services", () => {
    const result = AdminOperationsService.getUnitOperations(unit.unit_id);

    assertEqual(
      HousekeepingService.getByUnit(unit.unit_id).length,
      result.housekeeping_tasks.length,
    );

    assertEqual(
      InspectionService.getByUnit(unit.unit_id).length,
      result.inspections.length,
    );

    assertEqual(
      MaintenanceService.getWorkOrdersByUnit(unit.unit_id).length,
      result.maintenance_work_orders.length,
    );

    const status = OperationalStatusService.getStatus(unit.unit_id);
    assertEqual(
      status ? status.operational_status : "",
      result.operational_status
        ? result.operational_status.operational_status
        : "",
    );

    return unit.unit_id;
  });

  run("6. Today housekeeping is property isolated", () => {
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));
    const rows = AdminOperationsService.getTodayHousekeeping(propertyId);
    rows.forEach((r) => assertTrue(unitIds.has(String(r.unit_id).trim())));
    return "tasks=" + rows.length;
  });

  run("7. Overdue housekeeping is property isolated", () => {
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));
    const rows = AdminOperationsService.getOverdueHousekeeping(propertyId);
    rows.forEach((r) => assertTrue(unitIds.has(String(r.unit_id).trim())));
    return "tasks=" + rows.length;
  });

  run("8. Pending inspections are property isolated", () => {
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));
    const rows = AdminOperationsService.getPendingInspections(propertyId);
    rows.forEach((r) => assertTrue(unitIds.has(String(r.unit_id).trim())));
    return "inspections=" + rows.length;
  });

  run("9. Open maintenance is property isolated", () => {
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));
    const rows = AdminOperationsService.getOpenMaintenance(propertyId);
    rows.forEach((r) => assertTrue(unitIds.has(String(r.unit_id).trim())));
    return "work_orders=" + rows.length;
  });

  run("10. Due schedules are property isolated", () => {
    const today = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE,
    );
    const unitIds = new Set(units.map((u) => String(u.unit_id).trim()));
    const rows = AdminOperationsService.getDueHousekeepingSchedules(
      propertyId,
      today,
    );
    rows.forEach((r) => assertTrue(unitIds.has(String(r.unit_id).trim())));
    return "schedules=" + rows.length;
  });

  const reservations = ReservationService.getAll();

  if (reservations.length > 0) {
    run("11. Stay view matches StayOperationsService", () => {
      const reservationId = reservations[0].reservation_id;
      const actual = AdminOperationsService.getStayOperations(reservationId);
      const expected = StayOperationsService.getStayOperations(reservationId);

      assertEqual(
        expected.reservation.reservation_id,
        actual.reservation.reservation_id,
      );
      assertEqual(
        expected.housekeeping_tasks.length,
        actual.housekeeping_tasks.length,
      );
      assertEqual(expected.inspections.length, actual.inspections.length);
      assertEqual(
        expected.maintenance_work_orders.length,
        actual.maintenance_work_orders.length,
      );

      return reservationId;
    });
  } else {
    pass(
      "11. Stay view matches StayOperationsService",
      "SKIPPED: no reservations",
    );
  }

  run("12. Invalid property is rejected", () => {
    let rejected = false;
    try {
      AdminOperationsService.getOperationsBoard("PROP-999999");
    } catch (err) {
      rejected = true;
    }
    assertTrue(rejected, "Invalid property was not rejected.");
    return "rejected";
  });

  run("13. Invalid unit is rejected", () => {
    let rejected = false;
    try {
      AdminOperationsService.getUnitOperations("UNIT-999999");
    } catch (err) {
      rejected = true;
    }
    assertTrue(rejected, "Invalid unit was not rejected.");
    return "rejected";
  });

  run("14. Stay orchestration dependency contract exists", () => {
    [
      "checkIn",
      "checkOut",
      "startCleaning",
      "completeCleaning",
      "applyInspectionResult",
      "completeInspection",
      "completeMaintenanceAndRequestInspection",
      "getStayOperations",
    ].forEach((name) =>
      assertTrue(
        typeof StayOperationsService[name] === "function",
        "Missing StayOperationsService." + name,
      ),
    );
    return "8 orchestration methods verified";
  });

  run("15. Housekeeping dependency contract exists", () => {
    [
      "assignTask",
      "cancelTask",
      "getAll",
      "getByUnit",
      "getTodayTasks",
      "getOverdueTasks",
    ].forEach((name) =>
      assertTrue(
        typeof HousekeepingService[name] === "function",
        "Missing HousekeepingService." + name,
      ),
    );
    return "contract verified";
  });

  run("16. Inspection dependency contract exists", () => {
    [
      "startInspection",
      "setChecklistResult",
      "cancelInspection",
      "getAll",
      "getByUnit",
      "getPendingInspections",
    ].forEach((name) =>
      assertTrue(
        typeof InspectionService[name] === "function",
        "Missing InspectionService." + name,
      ),
    );
    return "contract verified";
  });

  run("17. Maintenance dependency contract exists", () => {
    [
      "createManualWorkOrder",
      "assignTechnician",
      "scheduleWorkOrder",
      "startWorkOrder",
      "getAllWorkOrders",
      "getWorkOrdersByUnit",
      "getOpenWorkOrders",
    ].forEach((name) =>
      assertTrue(
        typeof MaintenanceService[name] === "function",
        "Missing MaintenanceService." + name,
      ),
    );
    return "contract verified";
  });

  run("18. Facade does not expose raw operational status mutation", () => {
    [
      "changeStatus",
      "markReady",
      "markDirty",
      "markCleaning",
      "markInspection",
      "markMaintenance",
    ].forEach((name) =>
      assertTrue(
        typeof AdminOperationsService[name] === "undefined",
        "Unsafe raw status method exposed: " + name,
      ),
    );
    return "orchestration boundary verified";
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  Logger.log("===== PHASE 6.3 ADMIN OPERATIONS SERVICE TEST SUMMARY =====");
  Logger.log("PASSED: " + passed);
  Logger.log("FAILED: " + failed);
  Logger.log(JSON.stringify(results, null, 2));
  Logger.log("===== PHASE 6.3 ADMIN OPERATIONS SERVICE TEST END =====");

  if (failed > 0) {
    throw new Error(
      "Phase 6.3 AdminOperationsService acceptance failed. FAILED=" + failed,
    );
  }

  return {
    passed: true,
    passed_count: passed,
    failed_count: failed,
    property_id: propertyId,
  };
}
