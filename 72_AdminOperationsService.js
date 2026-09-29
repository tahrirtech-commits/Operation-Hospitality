/**

 \* ============================================================================

 \* 72_AdminOperationsService.gs

 \* RENTAL OPERATIONS MVP

 \* PHASE 6.3 - ADMIN OPERATIONS FACADE

 \* ============================================================================

 \*

 \* UI-facing facade for stay / housekeeping / inspection / maintenance ops.

 \*

 \* Cross-domain lifecycle writes delegate to StayOperationsService.

 \* Domain-specific assignment/scheduling actions delegate to their owners.

 \* No direct Google Sheet writes.

 \* ============================================================================

 */

const AdminOperationsService = (() => {
  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === "";
  }

  function text(v) {
    return isBlank(v) ? "" : String(v).trim();
  }

  function actor(v) {
    return text(v) || CONFIG.DEFAULTS.ACTOR_ID;
  }

  function requireProperty(propertyId) {
    propertyId = text(propertyId);

    if (!propertyId) throw new Error("property_id is required.");

    const property = PropertyService.getPropertyById(propertyId);

    if (!property) throw new Error("Property not found: " + propertyId);

    return property;
  }

  function requireUnit(unitId) {
    unitId = text(unitId);

    if (!unitId) throw new Error("unit_id is required.");

    const unit = UnitService.getUnitById(unitId);

    if (!unit) throw new Error("Unit not found: " + unitId);

    return unit;
  }

  function propertyUnitIds(propertyId) {
    const property = requireProperty(propertyId);

    return {
      property: property,

      units: UnitService.getUnitsByProperty(property.property_id),
    };
  }

  function filterByUnitSet(rows, unitSet) {
    return (rows || []).filter((row) => unitSet.has(text(row.unit_id)));
  }

  /**

   \* Operational board for a property.

   */

  function getOperationsBoard(propertyId) {
    const context = propertyUnitIds(propertyId);
    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    /*
     * PERFORMANCE PATCH 4
     *
     * OperationalStatusService.getStatus() validates and reads status
     * records per unit. For a board read, use its authoritative bulk-read
     * method once and join the records to the already-resolved property
     * units in memory.
     */
    const allStatuses = OperationalStatusService.getAllStatuses();

    const statusMap = new Map();

    allStatuses.forEach((statusRecord) => {
      const unitId = text(statusRecord.unit_id);

      if (unitSet.has(unitId) && !statusMap.has(unitId)) {
        statusMap.set(unitId, statusRecord);
      }
    });

    const statuses = context.units.map((unit) => ({
      unit: unit,
      operational_status: statusMap.get(text(unit.unit_id)) || null,
    }));

    return {
      property: context.property,
      units: statuses,
      housekeeping: filterByUnitSet(HousekeepingService.getAll(), unitSet),
      inspections: filterByUnitSet(InspectionService.getAll(), unitSet),
      maintenance: filterByUnitSet(
        MaintenanceService.getAllWorkOrders(),
        unitSet,
      ),
    };
  }

  function getUnitOperations(unitId) {
    const unit = requireUnit(unitId);

    return {
      unit: unit,

      operational_status: OperationalStatusService.getStatus(unit.unit_id),

      housekeeping_tasks: HousekeepingService.getByUnit(unit.unit_id),

      inspections: InspectionService.getByUnit(unit.unit_id),

      maintenance_work_orders: MaintenanceService.getWorkOrdersByUnit(
        unit.unit_id,
      ),
    };
  }

  function getStayOperations(reservationId) {
    reservationId = text(reservationId);

    if (!reservationId) throw new Error("reservation_id is required.");

    return StayOperationsService.getStayOperations(reservationId);
  }

  function getTodayHousekeeping(propertyId) {
    const context = propertyUnitIds(propertyId);

    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    return filterByUnitSet(HousekeepingService.getTodayTasks(), unitSet);
  }

  function getOverdueHousekeeping(propertyId) {
    const context = propertyUnitIds(propertyId);

    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    return filterByUnitSet(HousekeepingService.getOverdueTasks(), unitSet);
  }

  function getPendingInspections(propertyId) {
    const context = propertyUnitIds(propertyId);

    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    return filterByUnitSet(InspectionService.getPendingInspections(), unitSet);
  }

  function getOpenMaintenance(propertyId) {
    const context = propertyUnitIds(propertyId);

    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    return filterByUnitSet(MaintenanceService.getOpenWorkOrders(), unitSet);
  }

  function getDueHousekeepingSchedules(propertyId, asOfDate) {
    const context = propertyUnitIds(propertyId);

    const unitSet = new Set(context.units.map((u) => text(u.unit_id)));

    return filterByUnitSet(
      HousekeepingScheduleService.getDueSchedules(asOfDate),

      unitSet,
    );
  }

  // --------------------------------------------------------------------------

  // STAY LIFECYCLE - ALWAYS THROUGH StayOperationsService

  // --------------------------------------------------------------------------

  function checkIn(reservationId, actorId) {
    return StayOperationsService.checkIn(text(reservationId), actor(actorId));
  }

  function checkOut(reservationId, options, actorId) {
    return StayOperationsService.checkOut(
      text(reservationId),

      options || {},

      actor(actorId),
    );
  }

  function startCleaning(taskId, actorId) {
    return StayOperationsService.startCleaning(text(taskId), actor(actorId));
  }

  function completeCleaning(taskId, options, actorId) {
    return StayOperationsService.completeCleaning(
      text(taskId),

      options || {},

      actor(actorId),
    );
  }

  function completeInspection(
    inspectionId,

    completion,

    remediationOptions,

    actorId,
  ) {
    return StayOperationsService.completeInspection(
      text(inspectionId),

      completion || {},

      remediationOptions || {},

      actor(actorId),
    );
  }

  function applyInspectionResult(inspectionId, remediationOptions, actorId) {
    return StayOperationsService.applyInspectionResult(
      text(inspectionId),

      remediationOptions || {},

      actor(actorId),
    );
  }

  function completeMaintenanceAndRequestInspection(
    workOrderId,

    resolution,

    cost,

    options,

    actorId,
  ) {
    return StayOperationsService.completeMaintenanceAndRequestInspection(
      text(workOrderId),

      text(resolution),

      cost,

      options || {},

      actor(actorId),
    );
  }

  // --------------------------------------------------------------------------

  // HOUSEKEEPING ADMIN ACTIONS

  // --------------------------------------------------------------------------

  function assignHousekeepingTask(taskId, staffId, actorId) {
    return HousekeepingService.assignTask(
      text(taskId),

      text(staffId),

      actor(actorId),
    );
  }

  function cancelHousekeepingTask(taskId, reason, actorId) {
    return HousekeepingService.cancelTask(
      text(taskId),

      actor(actorId),

      text(reason),
    );
  }

  // --------------------------------------------------------------------------

  // INSPECTION ADMIN ACTIONS

  // --------------------------------------------------------------------------

  function startInspection(inspectionId, actorId) {
    return InspectionService.startInspection(
      text(inspectionId),

      actor(actorId),
    );
  }

  function setChecklistResult(checklistItemId, result, notes, actorId) {
    return InspectionService.setChecklistResult(
      text(checklistItemId),

      text(result),

      text(notes),

      actor(actorId),
    );
  }

  function cancelInspection(inspectionId, notes, actorId) {
    return InspectionService.cancelInspection(
      text(inspectionId),

      text(notes),

      actor(actorId),
    );
  }

  // --------------------------------------------------------------------------

  // MAINTENANCE ADMIN ACTIONS

  // --------------------------------------------------------------------------

  function createManualWorkOrder(data, actorId) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Work-order data must be an object.");
    }

    return MaintenanceService.createManualWorkOrder(data, actor(actorId));
  }

  function assignTechnician(workOrderId, staffId, actorId) {
    return MaintenanceService.assignTechnician(
      text(workOrderId),

      text(staffId),

      actor(actorId),
    );
  }

  function scheduleWorkOrder(workOrderId, scheduledDate, staffId, actorId) {
    return MaintenanceService.scheduleWorkOrder(
      text(workOrderId),

      scheduledDate,

      text(staffId),

      actor(actorId),
    );
  }

  function startWorkOrder(workOrderId, actorId) {
    return MaintenanceService.startWorkOrder(
      text(workOrderId),

      actor(actorId),
    );
  }

  return {
    getOperationsBoard,

    getUnitOperations,

    getStayOperations,

    getTodayHousekeeping,

    getOverdueHousekeeping,

    getPendingInspections,

    getOpenMaintenance,

    getDueHousekeepingSchedules,

    checkIn,

    checkOut,

    startCleaning,

    completeCleaning,

    completeInspection,

    applyInspectionResult,

    completeMaintenanceAndRequestInspection,

    assignHousekeepingTask,

    cancelHousekeepingTask,

    startInspection,

    setChecklistResult,

    cancelInspection,

    createManualWorkOrder,

    assignTechnician,

    scheduleWorkOrder,

    startWorkOrder,
  };
})();
