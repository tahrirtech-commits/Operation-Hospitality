/**
 * ============================================================================
 * 80_WebApiService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.5 / 6.7B - WEB API SERVICE
 * ============================================================================
 *
 * Unified API boundary for the Phase 6 Admin UI.
 *
 * ALLOWED DEPENDENCIES
 * - DashboardService
 * - AdminReservationService
 * - AdminOperationsService
 * - AdminFinanceService
 * - AdminReferenceService
 *
 * This service does NOT call repositories, Sheets, or Phase 1-5 domain
 * services directly.
 *
 * Every call returns:
 * {
 *   success: true|false,
 *   data: ... | null,
 *   error: null | { code, message },
 *   meta: { action, timestamp }
 * }
 * ============================================================================
 */

const WebApiService = (() => {

  const ACTIONS = Object.freeze({

    // Admin reference / lookup data
    'reference.bootstrap':
      p => AdminReferenceService.getBootstrap(),
    'reference.properties':
      p => AdminReferenceService.getProperties(p || {}),
    'reference.units':
      p => AdminReferenceService.getUnits(
        required(p, 'property_id'),
        objectValue(p, 'options')
      ),
    'reference.customers':
      p => AdminReferenceService.getCustomers(p || {}),
    'reference.guests':
      p => AdminReferenceService.getGuests(p || {}),
    'reference.staff':
      p => AdminReferenceService.getStaff(p || {}),
    'reference.values':
      p => AdminReferenceService.getReferenceValues(
        required(p, 'category')
      ),
    'reference.bundle':
      p => AdminReferenceService.getReferenceBundle(
        arrayRequired(p, 'categories')
      ),

    // Dashboard
    'dashboard.get':
      p => DashboardService.getDashboard(p || {}),
    'dashboard.kpis':
      p => DashboardService.getKpis(p || {}),
    'dashboard.units':
      p => DashboardService.getUnitBoard(p || {}),
    'dashboard.arrivals':
      p => DashboardService.getArrivals(p || {}),
    'dashboard.departures':
      p => DashboardService.getDepartures(p || {}),
    'dashboard.operations':
      p => DashboardService.getOperations(p || {}),
    'dashboard.alerts':
      p => DashboardService.getAlerts(p || {}),

    // Reservations
    'reservations.searchAvailability':
      p => AdminReservationService.searchAvailability(p || {}),
    'reservations.checkAvailability':
      p => AdminReservationService.checkUnitAvailability(p || {}),
    'reservations.list':
      p => AdminReservationService.listReservations(p || {}),
    'reservations.get':
      p => AdminReservationService.getReservation(required(p, 'reservation_id')),
    'reservations.createDirect':
      p => AdminReservationService.createDirectReservation(p || {}),
    'reservations.confirm':
      p => AdminReservationService.confirmReservation(
        required(p, 'reservation_id'),
        actor(p)
      ),
    'reservations.cancel':
      p => AdminReservationService.cancelReservation(
        required(p, 'reservation_id'),
        actor(p),
        value(p, 'reason')
      ),
    'reservations.checkIn':
      p => AdminReservationService.checkInReservation(
        required(p, 'reservation_id'),
        actor(p)
      ),
    'reservations.noShow':
      p => AdminReservationService.markNoShow(
        required(p, 'reservation_id'),
        actor(p)
      ),
    'reservations.otaBlockCompleted':
      p => AdminReservationService.markOTABlockCompleted(
        required(p, 'ota_block_id'),
        actor(p),
        value(p, 'notes')
      ),
    'reservations.arrivals':
      p => AdminReservationService.getArrivals(
        required(p, 'property_id'),
        required(p, 'date')
      ),
    'reservations.departures':
      p => AdminReservationService.getDepartures(
        required(p, 'property_id'),
        required(p, 'date')
      ),

    // Operations reads
    'operations.board':
      p => AdminOperationsService.getOperationsBoard(
        required(p, 'property_id')
      ),
    'operations.unit':
      p => AdminOperationsService.getUnitOperations(
        required(p, 'unit_id')
      ),
    'operations.stay':
      p => AdminOperationsService.getStayOperations(
        required(p, 'reservation_id')
      ),
    'operations.housekeeping.today':
      p => AdminOperationsService.getTodayHousekeeping(
        required(p, 'property_id')
      ),
    'operations.housekeeping.overdue':
      p => AdminOperationsService.getOverdueHousekeeping(
        required(p, 'property_id')
      ),
    'operations.inspections.pending':
      p => AdminOperationsService.getPendingInspections(
        required(p, 'property_id')
      ),
    'operations.maintenance.open':
      p => AdminOperationsService.getOpenMaintenance(
        required(p, 'property_id')
      ),
    'operations.housekeepingSchedules.due':
      p => AdminOperationsService.getDueHousekeepingSchedules(
        required(p, 'property_id'),
        value(p, 'as_of_date')
      ),

    // Operations writes
    'operations.checkIn':
      p => AdminOperationsService.checkIn(
        required(p, 'reservation_id'),
        actor(p)
      ),
    'operations.checkOut':
      p => AdminOperationsService.checkOut(
        required(p, 'reservation_id'),
        objectValue(p, 'options'),
        actor(p)
      ),
    'operations.cleaning.start':
      p => AdminOperationsService.startCleaning(
        required(p, 'task_id'),
        actor(p)
      ),
    'operations.cleaning.complete':
      p => AdminOperationsService.completeCleaning(
        required(p, 'task_id'),
        objectValue(p, 'options'),
        actor(p)
      ),
    'operations.inspection.complete':
      p => AdminOperationsService.completeInspection(
        required(p, 'inspection_id'),
        objectValue(p, 'completion'),
        objectValue(p, 'remediation_options'),
        actor(p)
      ),
    'operations.inspection.applyResult':
      p => AdminOperationsService.applyInspectionResult(
        required(p, 'inspection_id'),
        objectValue(p, 'remediation_options'),
        actor(p)
      ),
    'operations.maintenance.completeAndInspect':
      p => AdminOperationsService.completeMaintenanceAndRequestInspection(
        required(p, 'work_order_id'),
        required(p, 'resolution'),
        value(p, 'cost'),
        objectValue(p, 'options'),
        actor(p)
      ),
    'operations.housekeeping.assign':
      p => AdminOperationsService.assignHousekeepingTask(
        required(p, 'task_id'),
        required(p, 'staff_id'),
        actor(p)
      ),
    'operations.housekeeping.cancel':
      p => AdminOperationsService.cancelHousekeepingTask(
        required(p, 'task_id'),
        value(p, 'reason'),
        actor(p)
      ),
    'operations.inspection.start':
      p => AdminOperationsService.startInspection(
        required(p, 'inspection_id'),
        actor(p)
      ),
    'operations.inspection.checklistResult':
      p => AdminOperationsService.setChecklistResult(
        required(p, 'checklist_item_id'),
        required(p, 'result'),
        value(p, 'notes'),
        actor(p)
      ),
    'operations.inspection.cancel':
      p => AdminOperationsService.cancelInspection(
        required(p, 'inspection_id'),
        value(p, 'notes'),
        actor(p)
      ),
    'operations.maintenance.create':
      p => AdminOperationsService.createManualWorkOrder(
        objectRequired(p, 'work_order'),
        actor(p)
      ),
    'operations.maintenance.assign':
      p => AdminOperationsService.assignTechnician(
        required(p, 'work_order_id'),
        required(p, 'staff_id'),
        actor(p)
      ),
    'operations.maintenance.schedule':
      p => AdminOperationsService.scheduleWorkOrder(
        required(p, 'work_order_id'),
        required(p, 'scheduled_date'),
        value(p, 'staff_id'),
        actor(p)
      ),
    'operations.maintenance.start':
      p => AdminOperationsService.startWorkOrder(
        required(p, 'work_order_id'),
        actor(p)
      ),

    // Finance reads
    'finance.overview':
      p => AdminFinanceService.getFinanceOverview(
        required(p, 'property_id'),
        required(p, 'start_date'),
        required(p, 'end_date'),
        value(p, 'as_of_date')
      ),
    'finance.unit':
      p => AdminFinanceService.getUnitFinance(
        required(p, 'property_id'),
        required(p, 'unit_id'),
        required(p, 'start_date'),
        required(p, 'end_date')
      ),
    'finance.expenses.list':
      p => AdminFinanceService.listExpenses(p || {}),
    'finance.utilities.list':
      p => AdminFinanceService.listUtilities(
        required(p, 'property_id')
      ),
    'finance.utilityBills.list':
      p => AdminFinanceService.listUtilityBills(
        required(p, 'property_id'),
        value(p, 'start_date'),
        value(p, 'end_date')
      ),
    'finance.utilityBills.overdue':
      p => AdminFinanceService.getOverdueUtilityBills(
        required(p, 'property_id'),
        value(p, 'as_of_date')
      ),
    'finance.internet.list':
      p => AdminFinanceService.listInternetServices(
        required(p, 'property_id'),
        p && p.active_only === true
      ),
    'finance.internet.expiring':
      p => AdminFinanceService.getExpiringInternetContracts(
        required(p, 'property_id'),
        value(p, 'days_ahead'),
        value(p, 'as_of_date')
      ),

    // Finance writes
    'finance.expenses.create':
      p => AdminFinanceService.createExpense(
        objectRequired(p, 'expense'),
        actor(p)
      ),
    'finance.expenses.update':
      p => AdminFinanceService.updateExpense(
        required(p, 'expense_id'),
        objectRequired(p, 'changes'),
        actor(p)
      ),
    'finance.utilities.create':
      p => AdminFinanceService.createUtility(
        objectRequired(p, 'utility'),
        actor(p)
      ),
    'finance.utilities.update':
      p => AdminFinanceService.updateUtility(
        required(p, 'utility_id'),
        objectRequired(p, 'changes'),
        actor(p)
      ),
    'finance.utilities.changeStatus':
      p => AdminFinanceService.changeUtilityStatus(
        required(p, 'utility_id'),
        required(p, 'status'),
        actor(p)
      ),
    'finance.utilityBills.create':
      p => AdminFinanceService.createUtilityBill(
        objectRequired(p, 'bill'),
        actor(p)
      ),
    'finance.utilityBills.update':
      p => AdminFinanceService.updateUtilityBill(
        required(p, 'bill_id'),
        objectRequired(p, 'changes'),
        actor(p)
      ),
    'finance.utilityBills.markPaid':
      p => AdminFinanceService.markUtilityBillPaid(
        required(p, 'bill_id'),
        required(p, 'paid_date'),
        actor(p)
      ),
    'finance.utilityBills.markPending':
      p => AdminFinanceService.markUtilityBillPending(
        required(p, 'bill_id'),
        actor(p)
      ),
    'finance.utilityBills.markRefunded':
      p => AdminFinanceService.markUtilityBillRefunded(
        required(p, 'bill_id'),
        actor(p)
      ),
    'finance.internet.create':
      p => AdminFinanceService.createInternetService(
        objectRequired(p, 'internet_service'),
        actor(p)
      ),
    'finance.internet.update':
      p => AdminFinanceService.updateInternetService(
        required(p, 'internet_service_id'),
        objectRequired(p, 'changes'),
        actor(p)
      ),
    'finance.internet.activate':
      p => AdminFinanceService.activateInternetService(
        required(p, 'internet_service_id'),
        actor(p)
      ),
    'finance.internet.deactivate':
      p => AdminFinanceService.deactivateInternetService(
        required(p, 'internet_service_id'),
        actor(p)
      )
  });

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME
    );
  }

  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === '';
  }

  function value(params, key) {
    return params && params[key] !== undefined ? params[key] : '';
  }

  function required(params, key) {
    const v = value(params, key);
    if (isBlank(v)) throw new Error(key + ' is required.');
    return String(v).trim();
  }

  function objectRequired(params, key) {
    const v = params && params[key];
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(key + ' must be an object.');
    }
    return v;
  }

  function objectValue(params, key) {
    const v = params && params[key];
    if (v === undefined || v === null || v === '') return {};
    if (typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(key + ' must be an object.');
    }
    return v;
  }

  function arrayRequired(params, name) {
    const v = value(params, name);

    if (!Array.isArray(v)) {
      throw new Error(
        name + ' must be an array.'
      );
    }

    return v;
  }


  function actor(params) {
    return params && !isBlank(params.actor_id)
      ? String(params.actor_id).trim()
      : CONFIG.DEFAULTS.ACTOR_ID;
  }

  function errorCode(err) {
    const msg = err && err.message ? err.message : String(err);

    if (/required|must be|must both be supplied/i.test(msg)) {
      return 'VALIDATION_ERROR';
    }
    if (/not found|unknown/i.test(msg)) {
      return 'NOT_FOUND';
    }
    if (/not available|conflict|overlap|transition|cannot|does not belong/i.test(msg)) {
      return 'BUSINESS_RULE_ERROR';
    }
    return 'APPLICATION_ERROR';
  }

  function success(action, data) {
    return {
      success: true,
      data: data === undefined ? null : data,
      error: null,
      meta: {
        action: action,
        timestamp: timestamp()
      }
    };
  }

  function failure(action, err) {
    return {
      success: false,
      data: null,
      error: {
        code: errorCode(err),
        message: err && err.message ? err.message : String(err)
      },
      meta: {
        action: action,
        timestamp: timestamp()
      }
    };
  }

  /**
   * Safe UI entry point. Domain/application exceptions are converted to a
   * stable API envelope instead of escaping into google.script.run.
   */
  function call(action, params) {
    action = isBlank(action) ? '' : String(action).trim();
    params = params || {};

    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      return failure(
        action,
        new Error('Unknown API action: ' + action)
      );
    }

    try {
      return success(action, ACTIONS[action](params));
    } catch (err) {
      return failure(action, err);
    }
  }

  /**
   * Strict internal/testing entry point. Useful when the caller wants normal
   * exception semantics.
   */
  function execute(action, params) {
    action = isBlank(action) ? '' : String(action).trim();

    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      throw new Error('Unknown API action: ' + action);
    }

    return ACTIONS[action](params || {});
  }

  function getActions() {
    return Object.keys(ACTIONS).slice().sort();
  }

  return {
    call,
    execute,
    getActions
  };

})();
