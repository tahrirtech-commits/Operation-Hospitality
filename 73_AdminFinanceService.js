/**
 * ============================================================================
 * 73_AdminFinanceService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 6.4 - ADMIN FINANCE FACADE
 * ============================================================================
 *
 * UI-facing facade over the frozen Phase 5 finance services.
 *
 * IMPORTANT ACCOUNTING BOUNDARIES
 * - OperatingExpenses are authoritative expense records.
 * - UtilityBills are NOT automatically OperatingExpenses.
 * - InternetService is a subscription/contract master, NOT an expense ledger.
 * - Currency-aware totals remain separated by currency.
 * - This facade never adds utility/internet amounts into expense totals.
 * ============================================================================
 */

const AdminFinanceService = (() => {

  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === '';
  }

  function text(v) {
    return isBlank(v) ? '' : String(v).trim();
  }

  function actor(v) {
    return text(v) || CONFIG.DEFAULTS.ACTOR_ID;
  }

  function requireProperty(propertyId) {
    propertyId = text(propertyId);
    if (!propertyId) throw new Error('property_id is required.');

    const property = PropertyService.getPropertyById(propertyId);
    if (!property) throw new Error('Property not found: ' + propertyId);

    return property;
  }

  function requireUnit(unitId) {
    unitId = text(unitId);
    if (!unitId) throw new Error('unit_id is required.');

    const unit = UnitService.getUnitById(unitId);
    if (!unit) throw new Error('Unit not found: ' + unitId);

    return unit;
  }

  function requirePropertyUnit(propertyId, unitId) {
    const property = requireProperty(propertyId);
    const unit = requireUnit(unitId);

    if (text(unit.property_id) !== text(property.property_id)) {
      throw new Error(
        'Unit ' + unit.unit_id +
        ' does not belong to property ' + property.property_id + '.'
      );
    }

    return { property: property, unit: unit };
  }

  function validateRange(startDate, endDate) {
    return ExpenseService.validateDateRange(startDate, endDate);
  }

  /**
   * Property-level finance read model.
   *
   * No grand total is returned because these sections have different
   * accounting semantics and may not share a currency dimension.
   */
  function getFinanceOverview(propertyId, startDate, endDate, asOfDate) {
    const property = requireProperty(propertyId);
    const range = validateRange(startDate, endDate);

    const expenses = ExpenseService.getByPropertyAndDateRange(
      property.property_id,
      range.start_date,
      range.end_date
    );

    const utilityBills = UtilityService.getBillsByProperty(
      property.property_id
    ).filter(bill => {
      const d = text(bill.bill_date);
      return d >= range.start_date && d <= range.end_date;
    });

    const utilities = UtilityService.getUtilitiesByProperty(
      property.property_id
    );

    const internetServices = InternetService.getByProperty(
      property.property_id
    );

    const overdueBillIds = new Set(
      UtilityService.getOverdueBills(asOfDate)
        .map(row => text(row.bill_id))
    );

    const propertyOverdueBills = utilityBills.filter(
      row => overdueBillIds.has(text(row.bill_id))
    );

    return {
      property: property,
      start_date: range.start_date,
      end_date: range.end_date,

      expenses: {
        rows: expenses,
        totals_by_currency:
          ExpenseService.summarizeByCurrency(expenses),
        totals_by_category:
          ExpenseService.getTotalsByCategory(
            property.property_id,
            range.start_date,
            range.end_date
          ),
        totals_by_unit:
          ExpenseService.getTotalsByUnit(
            property.property_id,
            range.start_date,
            range.end_date
          )
      },

      utilities: {
        services: utilities,
        bills: utilityBills,
        totals_by_currency:
          UtilityService.summarizeByCurrency(utilityBills),
        overdue_bills: propertyOverdueBills
      },

      internet: {
        services: internetServices,
        fee_summary:
          InternetService.getFeeSummaryByProperty(
            property.property_id,
            false
          ),
        active_fee_summary:
          InternetService.getFeeSummaryByProperty(
            property.property_id,
            true
          )
      },

      accounting_boundary: {
        utility_bills_are_operating_expenses: false,
        internet_services_are_operating_expenses: false,
        combined_grand_total_provided: false
      }
    };
  }

  function getUnitFinance(propertyId, unitId, startDate, endDate) {
    const context = requirePropertyUnit(propertyId, unitId);
    const range = validateRange(startDate, endDate);

    const expenses = ExpenseService.getByUnitAndDateRange(
      context.unit.unit_id,
      range.start_date,
      range.end_date
    );

    const utilityBills = UtilityService.getBillsByUnit(
      context.unit.unit_id
    ).filter(bill => {
      const d = text(bill.bill_date);
      return d >= range.start_date && d <= range.end_date;
    });

    const internet = InternetService.getByUnit(context.unit.unit_id);

    return {
      property: context.property,
      unit: context.unit,
      start_date: range.start_date,
      end_date: range.end_date,

      expenses: {
        rows: expenses,
        totals_by_currency:
          ExpenseService.summarizeByCurrency(expenses)
      },

      utilities: {
        services:
          UtilityService.getUtilitiesByUnit(context.unit.unit_id),
        bills: utilityBills,
        totals_by_currency:
          UtilityService.summarizeByCurrency(utilityBills)
      },

      internet: {
        services: internet,
        fee_summary:
          InternetService.getFeeSummaryByUnit(
            context.unit.unit_id,
            false
          ),
        active_fee_summary:
          InternetService.getFeeSummaryByUnit(
            context.unit.unit_id,
            true
          )
      }
    };
  }

  // --------------------------------------------------------------------------
  // EXPENSES
  // --------------------------------------------------------------------------

  function listExpenses(filters) {
    filters = filters || {};

    if (!isBlank(filters.unit_id)) {
      const unit = requireUnit(filters.unit_id);

      if (!isBlank(filters.property_id) &&
          text(unit.property_id) !== text(filters.property_id)) {
        throw new Error('unit_id does not belong to property_id.');
      }
    }

    if (!isBlank(filters.start_date) || !isBlank(filters.end_date)) {
      if (isBlank(filters.start_date) || isBlank(filters.end_date)) {
        throw new Error(
          'start_date and end_date must both be supplied.'
        );
      }
    }

    let rows;

    if (!isBlank(filters.property_id) &&
        !isBlank(filters.start_date)) {
      requireProperty(filters.property_id);
      rows = ExpenseService.getByPropertyAndDateRange(
        text(filters.property_id),
        filters.start_date,
        filters.end_date
      );
    } else if (!isBlank(filters.unit_id) &&
               !isBlank(filters.start_date)) {
      rows = ExpenseService.getByUnitAndDateRange(
        text(filters.unit_id),
        filters.start_date,
        filters.end_date
      );
    } else if (!isBlank(filters.property_id)) {
      requireProperty(filters.property_id);
      rows = ExpenseService.getByProperty(text(filters.property_id));
    } else if (!isBlank(filters.unit_id)) {
      rows = ExpenseService.getByUnit(text(filters.unit_id));
    } else {
      rows = ExpenseService.getAll();
    }

    if (!isBlank(filters.category)) {
      const category = text(filters.category).toUpperCase();
      rows = rows.filter(
        row => text(row.category).toUpperCase() === category
      );
    }

    if (!isBlank(filters.currency)) {
      const currency = text(filters.currency).toUpperCase();
      rows = rows.filter(
        row => text(row.currency).toUpperCase() === currency
      );
    }

    if (!isBlank(filters.vendor)) {
      const vendor = text(filters.vendor).toUpperCase();
      rows = rows.filter(
        row => text(row.vendor).toUpperCase() === vendor
      );
    }

    return rows;
  }

  function createExpense(data, actorId) {
    return ExpenseService.createExpense(data, actor(actorId));
  }

  function updateExpense(expenseId, changes, actorId) {
    return ExpenseService.updateExpense(
      text(expenseId),
      changes,
      actor(actorId)
    );
  }

  // --------------------------------------------------------------------------
  // UTILITIES / BILLS
  // --------------------------------------------------------------------------

  function listUtilities(propertyId) {
    const property = requireProperty(propertyId);
    return UtilityService.getUtilitiesByProperty(property.property_id);
  }

  function listUtilityBills(propertyId, startDate, endDate) {
    const property = requireProperty(propertyId);
    let rows = UtilityService.getBillsByProperty(property.property_id);

    if (!isBlank(startDate) || !isBlank(endDate)) {
      const range = validateRange(startDate, endDate);
      rows = rows.filter(row => {
        const d = text(row.bill_date);
        return d >= range.start_date && d <= range.end_date;
      });
    }

    return rows;
  }

  function getOverdueUtilityBills(propertyId, asOfDate) {
    const property = requireProperty(propertyId);
    const utilityIds = new Set(
      UtilityService.getUtilitiesByProperty(property.property_id)
        .map(row => text(row.utility_id))
    );

    return UtilityService.getOverdueBills(asOfDate)
      .filter(row => utilityIds.has(text(row.utility_id)));
  }

  function createUtility(data, actorId) {
    return UtilityService.createUtility(data, actor(actorId));
  }

  function updateUtility(utilityId, changes, actorId) {
    return UtilityService.updateUtility(
      text(utilityId),
      changes,
      actor(actorId)
    );
  }

  function changeUtilityStatus(utilityId, status, actorId) {
    return UtilityService.changeUtilityStatus(
      text(utilityId),
      status,
      actor(actorId)
    );
  }

  function createUtilityBill(data, actorId) {
    return UtilityService.createBill(data, actor(actorId));
  }

  function updateUtilityBill(billId, changes, actorId) {
    return UtilityService.updateBill(
      text(billId),
      changes,
      actor(actorId)
    );
  }

  function markUtilityBillPaid(billId, paidDate, actorId) {
    return UtilityService.markBillPaid(
      text(billId),
      paidDate,
      actor(actorId)
    );
  }

  function markUtilityBillPending(billId, actorId) {
    return UtilityService.markBillPending(
      text(billId),
      actor(actorId)
    );
  }

  function markUtilityBillRefunded(billId, actorId) {
    return UtilityService.markBillRefunded(
      text(billId),
      actor(actorId)
    );
  }

  // --------------------------------------------------------------------------
  // INTERNET SUBSCRIPTIONS
  // --------------------------------------------------------------------------

  function listInternetServices(propertyId, activeOnly) {
    const property = requireProperty(propertyId);
    let rows = InternetService.getByProperty(property.property_id);

    if (activeOnly === true) {
      rows = rows.filter(
        row => text(row.status).toUpperCase() === 'ACTIVE'
      );
    }

    return rows;
  }

  function getExpiringInternetContracts(propertyId, daysAhead, asOfDate) {
    const property = requireProperty(propertyId);
    const ids = new Set(
      InternetService.getByProperty(property.property_id)
        .map(row => text(row.internet_service_id))
    );

    return InternetService.getContractsExpiringWithin(
      daysAhead,
      asOfDate
    ).filter(
      row => ids.has(text(row.internet_service_id))
    );
  }

  function createInternetService(data, actorId) {
    return InternetService.createInternetService(
      data,
      actor(actorId)
    );
  }

  function updateInternetService(serviceId, changes, actorId) {
    return InternetService.updateInternetService(
      text(serviceId),
      changes,
      actor(actorId)
    );
  }

  function activateInternetService(serviceId, actorId) {
    return InternetService.activate(
      text(serviceId),
      actor(actorId)
    );
  }

  function deactivateInternetService(serviceId, actorId) {
    return InternetService.deactivate(
      text(serviceId),
      actor(actorId)
    );
  }

  return {
    getFinanceOverview,
    getUnitFinance,

    listExpenses,
    createExpense,
    updateExpense,

    listUtilities,
    listUtilityBills,
    getOverdueUtilityBills,
    createUtility,
    updateUtility,
    changeUtilityStatus,
    createUtilityBill,
    updateUtilityBill,
    markUtilityBillPaid,
    markUtilityBillPending,
    markUtilityBillRefunded,

    listInternetServices,
    getExpiringInternetContracts,
    createInternetService,
    updateInternetService,
    activateInternetService,
    deactivateInternetService
  };

})();
