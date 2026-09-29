/**
 * ============================================================================
 * 54_StayOperationsService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 4 - STAY OPERATIONS ORCHESTRATION
 * ============================================================================
 *
 * Cross-domain orchestration for the physical stay lifecycle.
 *
 * Coordinates:
 *   - ReservationWorkflowService
 *   - OperationalStatusService
 *   - HousekeepingService
 *   - InspectionService
 *   - MaintenanceService
 *
 * DOES NOT own the domain rules inside those services.
 *
 * Main lifecycle:
 *
 *   CONFIRMED reservation
 *          |
 *          v
 *       CHECK-IN
 *          |
 *          +--> reservation CHECKED_IN
 *          +--> unit OCCUPIED
 *          |
 *          v
 *       CHECK-OUT
 *          |
 *          +--> reservation COMPLETED
 *          +--> unit DIRTY
 *          +--> CHECKOUT_CLEAN task
 *                    |
 *                    v
 *                CLEANING
 *                    |
 *              task COMPLETED
 *                    |
 *          +---------+---------+
 *          |                   |
 *   inspection required      no inspection
 *          |                   |
 *          v                   v
 *      INSPECTION            READY
 *          |
 *      +---+---+
 *      |       |
 *     PASS    FAIL
 *      |       |
 *    READY     +--> cleaning failure -> CLEANING
 *              +--> maintenance failure -> MAINTENANCE + work order
 *
 * IMPORTANT:
 * Google Sheets has no multi-sheet transaction. Where one domain operation
 * succeeds and a later orchestration step fails, this service throws a
 * reconciliation error instead of silently hiding the partial completion.
 * ============================================================================
 */

const StayOperationsService = (() => {
  const LOCK_TIMEOUT_MS = 30000;

  const OPERATIONAL_STATUS = {
    READY: "READY",
    OCCUPIED: "OCCUPIED",
    DIRTY: "DIRTY",
    CLEANING: "CLEANING",
    INSPECTION: "INSPECTION",
    MAINTENANCE: "MAINTENANCE",
  };

  // ==========================================================================
  // GENERIC HELPERS
  // ==========================================================================

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function normalize(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim().toUpperCase();
  }

  function normalizeText(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  function normalizeActorId(actorId) {
    return normalizeText(actorId) || CONFIG.DEFAULTS.ACTOR_ID;
  }

  function todayDate() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE,
    );
  }

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  function normalizeBoolean(value) {
    if (value === true || value === 1) {
      return true;
    }

    const normalized = normalize(value);

    return (
      normalized === "TRUE" ||
      normalized === "YES" ||
      normalized === "Y" ||
      normalized === "1"
    );
  }

  function executeWithLock(callback) {
    const lock = LockService.getScriptLock();

    let acquired = false;

    try {
      lock.waitLock(LOCK_TIMEOUT_MS);

      acquired = true;
    } catch (err) {
      throw new Error(
        "Stay operations workflow could not obtain system lock: " + err.message,
      );
    }

    try {
      return callback();
    } finally {
      if (acquired) {
        lock.releaseLock();
      }
    }
  }

  function reconciliationError(message, cause) {
    const suffix = cause && cause.message ? " Cause: " + cause.message : "";

    return new Error(message + " Manual reconciliation required." + suffix);
  }

  function requireReservation(reservationId) {
    return ReservationService.requireReservation(normalizeText(reservationId));
  }

  function requireHousekeepingTask(taskId) {
    return HousekeepingService.requireTask(normalizeText(taskId));
  }

  function requireInspection(inspectionId) {
    return InspectionService.requireInspection(normalizeText(inspectionId));
  }

  function requireOperationalStatus(unitId) {
    const status = OperationalStatusService.getStatus(unitId);

    if (!status) {
      throw new Error(
        "Operational status record not found for unit: " + unitId,
      );
    }

    return status;
  }

  function assertOperationalStatus(unitId, allowedStatuses, operationName) {
    const status = requireOperationalStatus(unitId);

    const current = normalize(status.operational_status);

    const allowed = (allowedStatuses || []).map(normalize);

    if (allowed.length > 0 && !allowed.includes(current)) {
      throw new Error(
        operationName +
          " requires unit " +
          unitId +
          " operational status to be " +
          allowed.join(" or ") +
          ", but current status is " +
          current +
          ".",
      );
    }

    return status;
  }

  // ==========================================================================
  // RESERVATION / STAY LIFECYCLE
  // ==========================================================================

  /**
   * CONFIRMED -> CHECKED_IN
   * READY -> OCCUPIED
   *
   * ReservationWorkflowService already owns both changes and its own lock.
   * Do not wrap this call in another ScriptLock.
   */
  function checkIn(reservationId, actorId) {
    return ReservationWorkflowService.checkIn(
      normalizeText(reservationId),
      normalizeActorId(actorId),
    );
  }

  /**
   * CHECKED_IN -> COMPLETED
   * OCCUPIED -> DIRTY
   * then create CHECKOUT_CLEAN task.
   *
   * options:
   * {
   *   scheduled_date,
   *   scheduled_start,
   *   scheduled_end,
   *   assigned_to,
   *   priority,
   *   inspection_required, // default true in HousekeepingService
   *   notes
   * }
   */
  function checkOut(reservationId, options, actorId) {
    reservationId = normalizeText(reservationId);

    actorId = normalizeActorId(actorId);

    options = options || {};

    /*
     * ReservationWorkflowService owns the reservation COMPLETED
     * and unit DIRTY transition and already uses ScriptLock.
     */
    const stayResult = ReservationWorkflowService.completeStay(
      reservationId,
      actorId,
    );

    try {
      const cleaningTask = HousekeepingService.createCheckoutCleaning(
        reservationId,
        options,
        actorId,
      );

      return {
        success: true,
        reservation: stayResult.reservation,
        operational_status: stayResult.operational_status,
        housekeeping_task: cleaningTask,
      };
    } catch (err) {
      throw reconciliationError(
        "Reservation " +
          reservationId +
          " was completed and its unit was marked DIRTY, " +
          "but the checkout-cleaning task could not be created.",
        err,
      );
    }
  }

  // ==========================================================================
  // HOUSEKEEPING ORCHESTRATION
  // ==========================================================================

  /**
   * Starts an assigned housekeeping task and moves the unit to CLEANING.
   */
  function startCleaning(taskId, actorId) {
    taskId = normalizeText(taskId);

    actorId = normalizeActorId(actorId);

    return executeWithLock(() => {
      const task = requireHousekeepingTask(taskId);

      assertOperationalStatus(
        task.unit_id,
        [OPERATIONAL_STATUS.DIRTY, OPERATIONAL_STATUS.CLEANING],
        "Start cleaning",
      );

      const started = HousekeepingService.startTask(taskId, actorId);

      try {
        const operationalStatus = OperationalStatusService.markCleaning(
          task.unit_id,
          "Housekeeping task " + taskId + " started",
          actorId,
          "",
        );

        return {
          success: true,
          housekeeping_task: started,
          operational_status: operationalStatus,
        };
      } catch (err) {
        throw reconciliationError(
          "Housekeeping task " +
            taskId +
            " was started, but unit " +
            task.unit_id +
            " could not be moved to CLEANING.",
          err,
        );
      }
    });
  }

  /**
   * Completes housekeeping.
   *
   * If inspection_required = false:
   *   CLEANING -> READY
   *
   * If inspection_required = true:
   *   CLEANING -> INSPECTION
   *   create CHECKOUT inspection
   *
   * options:
   * {
   *   notes,
   *   inspector_id,
   *   scheduled_at,
   *   inspection_type
   * }
   */
  function completeCleaning(taskId, options, actorId) {
    taskId = normalizeText(taskId);

    actorId = normalizeActorId(actorId);

    options = options || {};

    return executeWithLock(() => {
      const task = requireHousekeepingTask(taskId);

      assertOperationalStatus(
        task.unit_id,
        [OPERATIONAL_STATUS.CLEANING],
        "Complete cleaning",
      );

      const completed = HousekeepingService.completeTask(
        taskId,
        actorId,
        options.notes || "",
      );

      const inspectionRequired = normalizeBoolean(
        completed.inspection_required,
      );

      if (!inspectionRequired) {
        try {
          const operationalStatus = OperationalStatusService.markReady(
            completed.unit_id,
            "Housekeeping task " +
              taskId +
              " completed; no inspection required",
            actorId,
          );

          return {
            success: true,
            housekeeping_task: completed,
            inspection: null,
            operational_status: operationalStatus,
          };
        } catch (err) {
          throw reconciliationError(
            "Housekeeping task " +
              taskId +
              " was completed, but unit " +
              completed.unit_id +
              " could not be moved to READY.",
            err,
          );
        }
      }

      let inspection;

      try {
        inspection = InspectionService.createInspection(
          {
            unit_id: completed.unit_id,

            reservation_id: completed.reservation_id || "",

            inspection_type:
              options.inspection_type ||
              InspectionService.INSPECTION_TYPE.CHECKOUT,

            scheduled_at: options.scheduled_at || timestamp(),

            inspector_id: options.inspector_id || "",

            cleanliness_score: "",

            maintenance_score: "",

            overall_result: "",

            notes:
              options.inspection_notes ||
              "Inspection after housekeeping task " + taskId,
          },
          actorId,
        );
      } catch (err) {
        throw reconciliationError(
          "Housekeeping task " +
            taskId +
            " was completed, but its required inspection " +
            "could not be created.",
          err,
        );
      }

      try {
        const operationalStatus = OperationalStatusService.markInspection(
          completed.unit_id,
          "Inspection " +
            inspection.inspection_id +
            " required after housekeeping",
          actorId,
          "",
        );

        return {
          success: true,
          housekeeping_task: completed,
          inspection: inspection,
          operational_status: operationalStatus,
        };
      } catch (err) {
        throw reconciliationError(
          "Inspection " +
            inspection.inspection_id +
            " was created, but unit " +
            completed.unit_id +
            " could not be moved to INSPECTION.",
          err,
        );
      }
    });
  }

  // ==========================================================================
  // INSPECTION RESULT ORCHESTRATION
  // ==========================================================================

  /**
   * Applies the result of an already COMPLETED inspection.
   *
   * PASS:
   *   unit -> READY
   *
   * FAIL + cleaning/housekeeping checklist failure:
   *   create TOUCH_UP housekeeping task
   *
   * FAIL + maintenance checklist failure:
   *   create INSPECTION maintenance work order
   *
   * If both cleaning and maintenance failed, both remediation records are
   * created and MAINTENANCE is the unit's current operational status.
   *
   * Other FAIL categories (for example INVENTORY) remain INSPECTION until
   * a later domain-specific workflow resolves them.
   *
   * options:
   * {
   *   cleaning_assigned_to,
   *   cleaning_priority,
   *   cleaning_scheduled_date,
   *   maintenance_assigned_to,
   *   maintenance_priority,
   *   maintenance_scheduled_date,
   *   maintenance_issue_type,
   *   maintenance_description
   * }
   */
  function applyInspectionResult(inspectionId, options, actorId) {
    inspectionId = normalizeText(inspectionId);

    actorId = normalizeActorId(actorId);

    options = options || {};

    return executeWithLock(() => {
      const inspection = requireInspection(inspectionId);

      if (normalize(inspection.status) !== InspectionService.STATUS.COMPLETED) {
        throw new Error(
          "Inspection must be COMPLETED before its result can be applied: " +
            inspectionId,
        );
      }

      assertOperationalStatus(
        inspection.unit_id,
        [
          OPERATIONAL_STATUS.INSPECTION,
          OPERATIONAL_STATUS.CLEANING,
          OPERATIONAL_STATUS.MAINTENANCE,
        ],
        "Apply inspection result",
      );

      const summary = InspectionService.getInspectionSummary(inspectionId);

      const result = normalize(inspection.overall_result);

      if (result === InspectionService.RESULT.PASS) {
        const operationalStatus = OperationalStatusService.markReady(
          inspection.unit_id,
          "Inspection " + inspectionId + " passed",
          actorId,
        );

        return {
          success: true,
          result: "PASS",
          inspection: inspection,
          summary: summary,
          housekeeping_task: null,
          maintenance_work_order: null,
          operational_status: operationalStatus,
        };
      }

      if (result !== InspectionService.RESULT.FAIL) {
        throw new Error(
          "Completed inspection has invalid overall_result: " +
            inspection.overall_result,
        );
      }

      let cleaningTask = null;
      let workOrder = null;

      /*
       * Create remediation records before changing the unit's
       * operational status. If a later step fails, surface it.
       */
      if (summary.has_cleaning_failure) {
        cleaningTask = HousekeepingService.createTask(
          {
            unit_id: inspection.unit_id,

            reservation_id: inspection.reservation_id || "",

            task_type: HousekeepingService.TASK_TYPE.TOUCH_UP,

            priority:
              options.cleaning_priority || HousekeepingService.PRIORITY.HIGH,

            scheduled_date: options.cleaning_scheduled_date || todayDate(),

            scheduled_start: "",

            scheduled_end: "",

            assigned_to: options.cleaning_assigned_to || "",

            inspection_required: true,

            notes: "Remediation after failed inspection " + inspectionId,
          },
          actorId,
        );
      }

      if (summary.has_maintenance_failure) {
        workOrder = MaintenanceService.createInspectionIssue(
          {
            unit_id: inspection.unit_id,

            asset_id: "",

            reservation_id: inspection.reservation_id || "",

            issue_type: options.maintenance_issue_type || "INSPECTION_FAILURE",

            description:
              options.maintenance_description ||
              "Maintenance issue identified by inspection " + inspectionId,

            priority:
              options.maintenance_priority || MaintenanceService.PRIORITY.HIGH,

            assigned_to: options.maintenance_assigned_to || "",

            scheduled_date: options.maintenance_scheduled_date || "",

            status: MaintenanceService.WORK_ORDER_STATUS.OPEN,

            started_at: "",

            completed_at: "",

            cost: "",

            resolution: "",
          },
          actorId,
        );
      }

      let operationalStatus;

      if (summary.has_maintenance_failure) {
        operationalStatus = OperationalStatusService.markMaintenance(
          inspection.unit_id,
          "Inspection " + inspectionId + " failed with maintenance issue",
          actorId,
          "",
        );
      } else if (summary.has_cleaning_failure) {
        operationalStatus = OperationalStatusService.markCleaning(
          inspection.unit_id,
          "Inspection " +
            inspectionId +
            " failed; cleaning remediation required",
          actorId,
          "",
        );
      } else {
        /*
         * FAIL exists, but Phase 4 has no workflow for the
         * failed category (for example INVENTORY).
         * Keep the unit in INSPECTION instead of falsely READY.
         */
        operationalStatus = OperationalStatusService.markInspection(
          inspection.unit_id,
          "Inspection " +
            inspectionId +
            " failed; unresolved remediation required",
          actorId,
          "",
        );
      }

      return {
        success: true,
        result: "FAIL",
        inspection: inspection,
        summary: summary,
        housekeeping_task: cleaningTask,
        maintenance_work_order: workOrder,
        operational_status: operationalStatus,
      };
    });
  }

  // ==========================================================================
  // CONVENIENCE: COMPLETE + APPLY INSPECTION
  // ==========================================================================

  /**
   * Completes an IN_PROGRESS inspection and immediately applies its result.
   *
   * completion:
   * {
   *   overall_result,
   *   cleanliness_score,
   *   maintenance_score,
   *   notes
   * }
   *
   * remediationOptions:
   *   same options accepted by applyInspectionResult().
   */
  function completeInspection(
    inspectionId,
    completion,
    remediationOptions,
    actorId,
  ) {
    inspectionId = normalizeText(inspectionId);

    actorId = normalizeActorId(actorId);

    completion = completion || {};

    /*
     * Do not hold StayOperations lock while calling applyInspectionResult,
     * because applyInspectionResult obtains the same ScriptLock.
     */
    const completed = InspectionService.completeInspection(
      inspectionId,
      completion,
      actorId,
    );

    try {
      const applied = applyInspectionResult(
        inspectionId,
        remediationOptions || {},
        actorId,
      );

      applied.completed_inspection = completed;

      return applied;
    } catch (err) {
      throw reconciliationError(
        "Inspection " +
          inspectionId +
          " was completed, but its operational result could not be applied.",
        err,
      );
    }
  }

  // ==========================================================================
  // MAINTENANCE COMPLETION / RE-INSPECTION
  // ==========================================================================

  /**
   * Completes an IN_PROGRESS maintenance work order and creates a MANUAL
   * re-inspection. Maintenance completion alone never makes a unit READY.
   *
   * options:
   * {
   *   inspector_id,
   *   scheduled_at,
   *   notes
   * }
   */
  function completeMaintenanceAndRequestInspection(
    workOrderId,
    resolution,
    cost,
    options,
    actorId,
  ) {
    workOrderId = normalizeText(workOrderId);

    actorId = normalizeActorId(actorId);

    options = options || {};

    const workOrder = MaintenanceService.requireWorkOrder(workOrderId);

    const completed = MaintenanceService.completeWorkOrder(
      workOrderId,
      resolution,
      cost,
      actorId,
    );

    let inspection;

    try {
      inspection = InspectionService.createInspection(
        {
          unit_id: completed.unit_id,

          reservation_id: completed.reservation_id || "",

          inspection_type: InspectionService.INSPECTION_TYPE.MANUAL,

          scheduled_at: options.scheduled_at || timestamp(),

          inspector_id: options.inspector_id || "",

          cleanliness_score: "",

          maintenance_score: "",

          overall_result: "",

          notes:
            options.notes ||
            "Re-inspection after maintenance work order " + workOrderId,
        },
        actorId,
      );
    } catch (err) {
      throw reconciliationError(
        "Maintenance work order " +
          workOrderId +
          " was completed, but re-inspection could not be created.",
        err,
      );
    }

    try {
      const operationalStatus = OperationalStatusService.markInspection(
        completed.unit_id,
        "Maintenance work order " +
          workOrderId +
          " completed; re-inspection required",
        actorId,
        "",
      );

      return {
        success: true,
        maintenance_work_order: completed,
        inspection: inspection,
        operational_status: operationalStatus,
      };
    } catch (err) {
      throw reconciliationError(
        "Maintenance work order " +
          workOrderId +
          " was completed and inspection " +
          inspection.inspection_id +
          " was created, but unit " +
          completed.unit_id +
          " could not be moved to INSPECTION.",
        err,
      );
    }
  }

  // ==========================================================================
  // WORKFLOW VIEW
  // ==========================================================================

  function getStayOperations(reservationId) {
    const reservation = requireReservation(reservationId);

    const unitId = reservation.unit_id;

    return {
      reservation: reservation,

      operational_status: OperationalStatusService.getStatus(unitId),

      housekeeping_tasks: HousekeepingService.getByReservation(
        reservation.reservation_id,
      ),

      inspections: InspectionService.getByReservation(
        reservation.reservation_id,
      ),

      maintenance_work_orders: MaintenanceService.getWorkOrdersByReservation(
        reservation.reservation_id,
      ),
    };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {
    checkIn,
    checkOut,

    startCleaning,
    completeCleaning,

    applyInspectionResult,
    completeInspection,

    completeMaintenanceAndRequestInspection,

    getStayOperations,
  };
})();
