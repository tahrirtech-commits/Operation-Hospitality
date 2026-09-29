/**
 * 61_UtilityService.gs
 * Phase 5 - Utilities and Utility Bills
 *
 * 24_Utilities:
 * utility_id,property_id,unit_id,utility_type,provider,account_number,meter_number,
 * billing_frequency,currency,status
 *
 * 25_UtilityBills:
 * bill_id,utility_id,billing_period_start,billing_period_end,bill_date,due_date,
 * amount,tax_amount,total_amount,payment_status,paid_date,notes
 *
 * No automatic UtilityBill -> OperatingExpense synchronization.
 */
const UtilityService = (() => {
  const UTILITY_ENTITY_TYPE = "UTILITY";
  const BILL_ENTITY_TYPE = "UTILITY_BILL";
  const UTILITY_SHEET = CONFIG.SHEETS.UTILITIES;
  const BILL_SHEET = CONFIG.SHEETS.UTILITY_BILLS;

  const blank = (v) => v === null || v === undefined || String(v).trim() === "";
  const text = (v) => (blank(v) ? "" : String(v).trim());
  const upper = (v) => text(v).toUpperCase();
  const actor = (id) =>
    !blank(id)
      ? text(id)
      : CONFIG.DEFAULTS && !blank(CONFIG.DEFAULTS.ACTOR_ID)
        ? text(CONFIG.DEFAULTS.ACTOR_ID)
        : "SYSTEM";

  function number(v, name, min) {
    if (blank(v)) throw new Error(name + " is required.");
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(name + " must be numeric.");
    if (min !== undefined && n < min)
      throw new Error(name + " must be >= " + min + ".");
    return n;
  }

  function money(v, name, min) {
    return Math.round((number(v, name, min) + Number.EPSILON) * 100) / 100;
  }

  function sameMoney(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.005;
  }

  // Canonicalizes both Google Sheets Date objects and YYYY-MM-DD strings.
  // All bill-date comparisons must pass through this helper.
  function date(v, name, allowBlank) {
    if (blank(v)) {
      if (allowBlank) return "";
      throw new Error(name + " is required.");
    }
    if (
      Object.prototype.toString.call(v) === "[object Date]" &&
      !isNaN(v.getTime())
    ) {
      return Utilities.formatDate(
        v,
        CONFIG.TIMEZONE || Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
    }
    const s = text(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw new Error(name + " must use YYYY-MM-DD.");
    const p = s.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    if (
      d.getUTCFullYear() !== p[0] ||
      d.getUTCMonth() !== p[1] - 1 ||
      d.getUTCDate() !== p[2]
    ) {
      throw new Error(name + " is not a valid calendar date.");
    }
    return s;
  }

  function today() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE || Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  function ref(category, value, name, allowBlank) {
    if (blank(value)) {
      if (allowBlank) return "";
      throw new Error(name + " is required.");
    }
    const v = upper(value);
    ValidationService.validateReference(category, v);
    return v;
  }

  function requireRow(sheet, field, id, label) {
    const row = BaseRepository.findById(sheet, field, text(id));
    if (!row) throw new Error(label + " not found: " + text(id));
    return row;
  }

  function requireUtility(id) {
    return requireRow(UTILITY_SHEET, "utility_id", id, "Utility");
  }

  function requireBill(id) {
    return requireRow(BILL_SHEET, "bill_id", id, "Utility bill");
  }

  function validatePropertyUnit(propertyId, unitId) {
    const property = requireRow(
      CONFIG.SHEETS.PROPERTIES,
      "property_id",
      propertyId,
      "Property",
    );
    const unit = requireRow(CONFIG.SHEETS.UNITS, "unit_id", unitId, "Unit");
    if (text(unit.property_id) !== text(property.property_id)) {
      throw new Error(
        "Unit " +
          unit.unit_id +
          " does not belong to property " +
          property.property_id +
          ".",
      );
    }
  }

  function validateUtility(data, current) {
    const x = Object.assign({}, current || {}, data || {});
    validatePropertyUnit(x.property_id, x.unit_id);
    const status = upper(x.status || "ACTIVE");
    if (!["ACTIVE", "INACTIVE"].includes(status))
      throw new Error("status must be ACTIVE or INACTIVE.");
    if (blank(x.provider)) throw new Error("provider is required.");
    return {
      property_id: text(x.property_id),
      unit_id: text(x.unit_id),
      utility_type: ref("UTILITY_TYPE", x.utility_type, "utility_type"),
      provider: text(x.provider),
      account_number: text(x.account_number),
      meter_number: text(x.meter_number),
      billing_frequency: ref(
        "FREQUENCY",
        x.billing_frequency,
        "billing_frequency",
      ),
      currency: ref("CURRENCY", x.currency, "currency"),
      status,
    };
  }

  function assertUniqueUtility(x, excludeId) {
    const duplicate = BaseRepository.findAll(UTILITY_SHEET).find(
      (r) =>
        text(r.utility_id) !== text(excludeId) &&
        text(r.unit_id) === x.unit_id &&
        upper(r.utility_type) === x.utility_type &&
        ((!blank(x.account_number) &&
          text(r.account_number) === x.account_number) ||
          (!blank(x.meter_number) && text(r.meter_number) === x.meter_number)),
    );
    if (duplicate)
      throw new Error(
        "Duplicate utility account/meter: " + duplicate.utility_id,
      );
  }

  function createUtility(data, actorId) {
    const x = validateUtility(data);
    assertUniqueUtility(x, "");
    const id = IdService.nextId(UTILITY_ENTITY_TYPE);
    const saved = BaseRepository.insert(
      UTILITY_SHEET,
      Object.assign({ utility_id: id }, x),
    );
    AuditService.logCreate(UTILITY_ENTITY_TYPE, id, saved, actor(actorId));
    return saved;
  }

  function updateUtility(id, changes, actorId) {
    const old = requireUtility(id);
    const patch = Object.assign({}, changes || {});
    if ("utility_id" in patch && text(patch.utility_id) !== text(id))
      throw new Error("utility_id is immutable.");
    delete patch.utility_id;
    const x = validateUtility(patch, old);
    assertUniqueUtility(x, id);
    const saved = BaseRepository.update(UTILITY_SHEET, "utility_id", id, x);
    AuditService.logUpdate(UTILITY_ENTITY_TYPE, id, old, saved, actor(actorId));
    return saved;
  }

  function changeUtilityStatus(id, status, actorId) {
    return updateUtility(id, { status: upper(status) }, actorId);
  }

  const getAllUtilities = () => BaseRepository.findAll(UTILITY_SHEET);
  const getUtilityById = (id) =>
    BaseRepository.findById(UTILITY_SHEET, "utility_id", text(id));
  const utilityExists = (id) => !!getUtilityById(id);
  const getUtilitiesByProperty = (id) =>
    BaseRepository.findByField(UTILITY_SHEET, "property_id", text(id));
  const getUtilitiesByUnit = (id) =>
    BaseRepository.findByField(UTILITY_SHEET, "unit_id", text(id));
  const getUtilitiesByType = (type) =>
    getAllUtilities().filter((r) => upper(r.utility_type) === upper(type));
  const getActiveUtilities = () =>
    getAllUtilities().filter((r) => upper(r.status) === "ACTIVE");
  const getInactiveUtilities = () =>
    getAllUtilities().filter((r) => upper(r.status) === "INACTIVE");

  function validatePayment(status, paidDate) {
    if (status === "PAID" && blank(paidDate))
      throw new Error("paid_date is required when payment_status is PAID.");
    if (status !== "PAID" && !blank(paidDate))
      throw new Error("paid_date must be blank unless payment_status is PAID.");
  }

  function validateBill(data, current) {
    const x = Object.assign({}, current || {}, data || {});
    requireUtility(x.utility_id);
    const start = date(x.billing_period_start, "billing_period_start");
    const end = date(x.billing_period_end, "billing_period_end");
    if (start > end)
      throw new Error(
        "billing_period_start must be on or before billing_period_end.",
      );
    const billDate = date(x.bill_date, "bill_date");
    const dueDate = date(x.due_date, "due_date");
    if (dueDate < billDate)
      throw new Error("due_date must be on or after bill_date.");
    const amount = money(x.amount, "amount", 0);
    const tax = money(blank(x.tax_amount) ? 0 : x.tax_amount, "tax_amount", 0);
    const expected = Math.round((amount + tax + Number.EPSILON) * 100) / 100;
    const total = blank(x.total_amount)
      ? expected
      : money(x.total_amount, "total_amount", 0);
    if (!sameMoney(total, expected))
      throw new Error(
        "total_amount must equal amount + tax_amount. Expected " +
          expected +
          ".",
      );
    const paymentStatus = ref(
      "PAYMENT_STATUS",
      x.payment_status || "PENDING",
      "payment_status",
    );
    const paidDate = date(x.paid_date, "paid_date", true);
    validatePayment(paymentStatus, paidDate);
    return {
      utility_id: text(x.utility_id),
      billing_period_start: start,
      billing_period_end: end,
      bill_date: billDate,
      due_date: dueDate,
      amount,
      tax_amount: tax,
      total_amount: total,
      payment_status: paymentStatus,
      paid_date: paidDate,
      notes: text(x.notes),
    };
  }

  function assertUniqueBillPeriod(x, excludeId) {
    const duplicate = BaseRepository.findAll(BILL_SHEET).find(
      (r) =>
        text(r.bill_id) !== text(excludeId) &&
        text(r.utility_id) === x.utility_id &&
        date(r.billing_period_start, "billing_period_start") ===
          x.billing_period_start &&
        date(r.billing_period_end, "billing_period_end") ===
          x.billing_period_end,
    );
    if (duplicate)
      throw new Error("Duplicate utility billing period: " + duplicate.bill_id);
  }

  function createBill(data, actorId) {
    const x = validateBill(data);
    assertUniqueBillPeriod(x, "");
    const id = IdService.nextId(BILL_ENTITY_TYPE);
    const saved = BaseRepository.insert(
      BILL_SHEET,
      Object.assign({ bill_id: id }, x),
    );
    AuditService.logCreate(BILL_ENTITY_TYPE, id, saved, actor(actorId));
    return saved;
  }

  function updateBill(id, changes, actorId) {
    const old = requireBill(id);
    const patch = Object.assign({}, changes || {});
    if ("bill_id" in patch && text(patch.bill_id) !== text(id))
      throw new Error("bill_id is immutable.");
    delete patch.bill_id;
    const x = validateBill(patch, old);
    assertUniqueBillPeriod(x, id);
    const saved = BaseRepository.update(BILL_SHEET, "bill_id", id, x);
    AuditService.logUpdate(BILL_ENTITY_TYPE, id, old, saved, actor(actorId));
    return saved;
  }

  function changePaymentStatus(id, status, paidDate, actorId) {
    const s = ref("PAYMENT_STATUS", status, "payment_status");
    return updateBill(
      id,
      {
        payment_status: s,
        paid_date:
          s === "PAID"
            ? date(blank(paidDate) ? today() : paidDate, "paid_date")
            : "",
      },
      actorId,
    );
  }

  const markBillPaid = (id, paidDate, actorId) =>
    changePaymentStatus(id, "PAID", paidDate, actorId);
  const markBillPending = (id, actorId) =>
    changePaymentStatus(id, "PENDING", "", actorId);
  const markBillRefunded = (id, actorId) =>
    changePaymentStatus(id, "REFUNDED", "", actorId);

  const getAllBills = () => BaseRepository.findAll(BILL_SHEET);
  const getBillById = (id) =>
    BaseRepository.findById(BILL_SHEET, "bill_id", text(id));
  const billExists = (id) => !!getBillById(id);
  const getBillsByUtility = (id) =>
    BaseRepository.findByField(BILL_SHEET, "utility_id", text(id));
  const getBillsByPaymentStatus = (s) =>
    getAllBills().filter((r) => upper(r.payment_status) === upper(s));

  function getBillsByDateRange(startDate, endDate) {
    const s = date(startDate, "start_date"),
      e = date(endDate, "end_date");
    if (s > e) throw new Error("start_date must be on or before end_date.");
    return getAllBills().filter((r) => {
      const billDate = date(r.bill_date, "bill_date");
      return billDate >= s && billDate <= e;
    });
  }

  function getBillsByBillingPeriod(startDate, endDate) {
    const s = date(startDate, "start_date"),
      e = date(endDate, "end_date");
    if (s > e) throw new Error("start_date must be on or before end_date.");
    return getAllBills().filter((r) => {
      const periodStart = date(r.billing_period_start, "billing_period_start");
      const periodEnd = date(r.billing_period_end, "billing_period_end");
      return periodStart <= e && periodEnd >= s;
    });
  }

  function idsForUtilities(rows) {
    const ids = {};
    rows.forEach((r) => (ids[text(r.utility_id)] = true));
    return ids;
  }

  function getBillsByUnit(id) {
    const ids = idsForUtilities(getUtilitiesByUnit(id));
    return getAllBills().filter((r) => ids[text(r.utility_id)]);
  }

  function getBillsByProperty(id) {
    const ids = idsForUtilities(getUtilitiesByProperty(id));
    return getAllBills().filter((r) => ids[text(r.utility_id)]);
  }

  const getPendingBills = () =>
    getAllBills().filter((r) =>
      ["PENDING", "PARTIAL"].includes(upper(r.payment_status)),
    );

  function getOverdueBills(asOfDate) {
    const d = date(blank(asOfDate) ? today() : asOfDate, "as_of_date");
    return getPendingBills().filter((r) => date(r.due_date, "due_date") < d);
  }

  function getUpcomingDueBills(daysAhead, asOfDate) {
    const days = number(blank(daysAhead) ? 7 : daysAhead, "days_ahead", 0);
    const start = date(blank(asOfDate) ? today() : asOfDate, "as_of_date");
    const p = start.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + days);
    const end = Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
    return getPendingBills().filter((r) => {
      const dueDate = date(r.due_date, "due_date");
      return dueDate >= start && dueDate <= end;
    });
  }

  function utilityMap() {
    const map = {};
    getAllUtilities().forEach((r) => (map[text(r.utility_id)] = r));
    return map;
  }

  function summarizeByCurrency(bills) {
    const map = utilityMap(),
      totals = {};
    (bills || []).forEach((b) => {
      const u = map[text(b.utility_id)];
      if (!u) return;
      const c = upper(u.currency);
      if (!totals[c]) totals[c] = { currency: c, total: 0, bill_count: 0 };
      totals[c].total += Number(b.total_amount || 0);
      totals[c].bill_count++;
    });
    return Object.keys(totals)
      .sort()
      .map((c) => ({
        currency: c,
        total: Math.round((totals[c].total + Number.EPSILON) * 100) / 100,
        bill_count: totals[c].bill_count,
      }));
  }

  function getSingleCurrencyTotal(bills) {
    const rows = summarizeByCurrency(bills);
    if (!rows.length) return { currency: "", total: 0, bill_count: 0 };
    if (rows.length > 1)
      throw new Error(
        "Cannot combine multiple currencies: " +
          rows.map((r) => r.currency).join(", "),
      );
    return rows[0];
  }

  function filterBillDate(bills, startDate, endDate) {
    if (blank(startDate) && blank(endDate)) return bills;
    if (blank(startDate) || blank(endDate))
      throw new Error("Both startDate and endDate are required.");
    const s = date(startDate, "start_date"),
      e = date(endDate, "end_date");
    if (s > e) throw new Error("start_date must be on or before end_date.");
    return bills.filter((r) => {
      const billDate = date(r.bill_date, "bill_date");
      return billDate >= s && billDate <= e;
    });
  }

  const getUtilityCostByProperty = (id, s, e) =>
    getSingleCurrencyTotal(filterBillDate(getBillsByProperty(id), s, e));
  const getUtilityCostByUnit = (id, s, e) =>
    getSingleCurrencyTotal(filterBillDate(getBillsByUnit(id), s, e));

  function getUtilityCostByType(type, startDate, endDate) {
    const ids = idsForUtilities(getUtilitiesByType(type));
    return summarizeByCurrency(
      filterBillDate(
        getAllBills().filter((r) => ids[text(r.utility_id)]),
        startDate,
        endDate,
      ),
    );
  }

  function getMonthlyUtilitySummary(year, month, propertyId) {
    const y = Number(year),
      m = Number(month);
    if (!Number.isInteger(y) || y < 2000 || y > 9999)
      throw new Error("Invalid year.");
    if (!Number.isInteger(m) || m < 1 || m > 12)
      throw new Error("month must be 1..12.");
    const start =
      String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-01";
    const d = new Date(Date.UTC(y, m, 0));
    const end = Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
    const bills = filterBillDate(
      blank(propertyId) ? getAllBills() : getBillsByProperty(propertyId),
      start,
      end,
    );
    const um = utilityMap(),
      groups = {};
    bills.forEach((b) => {
      const u = um[text(b.utility_id)];
      if (!u) return;
      const key = upper(u.utility_type) + "|" + upper(u.currency);
      if (!groups[key])
        groups[key] = {
          utility_type: upper(u.utility_type),
          currency: upper(u.currency),
          total: 0,
          bill_count: 0,
        };
      groups[key].total += Number(b.total_amount || 0);
      groups[key].bill_count++;
    });
    return Object.keys(groups)
      .sort()
      .map((k) => ({
        utility_type: groups[k].utility_type,
        currency: groups[k].currency,
        total: Math.round((groups[k].total + Number.EPSILON) * 100) / 100,
        bill_count: groups[k].bill_count,
      }));
  }

  // Integrity helpers
  const findOrphanUtilityPropertyLinks = () =>
    getAllUtilities().filter(
      (r) =>
        !BaseRepository.findById(
          CONFIG.SHEETS.PROPERTIES,
          "property_id",
          text(r.property_id),
        ),
    );
  const findOrphanUtilityUnitLinks = () =>
    getAllUtilities().filter(
      (r) =>
        !BaseRepository.findById(
          CONFIG.SHEETS.UNITS,
          "unit_id",
          text(r.unit_id),
        ),
    );
  const findUtilityPropertyUnitMismatches = () =>
    getAllUtilities().filter((r) => {
      const u = BaseRepository.findById(
        CONFIG.SHEETS.UNITS,
        "unit_id",
        text(r.unit_id),
      );
      return u && text(u.property_id) !== text(r.property_id);
    });
  const invalidRef = (rows, category, field) =>
    rows.filter((r) => {
      try {
        ref(category, r[field], field);
        return false;
      } catch (e) {
        return true;
      }
    });
  const findInvalidUtilityTypes = () =>
    invalidRef(getAllUtilities(), "UTILITY_TYPE", "utility_type");
  const findInvalidUtilityFrequencies = () =>
    invalidRef(getAllUtilities(), "FREQUENCY", "billing_frequency");
  const findInvalidUtilityCurrencies = () =>
    invalidRef(getAllUtilities(), "CURRENCY", "currency");
  const findInvalidUtilityStatuses = () =>
    getAllUtilities().filter(
      (r) => !["ACTIVE", "INACTIVE"].includes(upper(r.status)),
    );

  function duplicates(rows, keyFn) {
    const seen = {},
      out = [];
    rows.forEach((r) => {
      const k = keyFn(r);
      if (seen[k]) out.push(r);
      else seen[k] = true;
    });
    return out;
  }

  const findDuplicateUtilityIds = () =>
    duplicates(getAllUtilities(), (r) => text(r.utility_id));
  function findDuplicateUtilityAccountsOrMeters() {
    const rows = getAllUtilities(),
      out = [];
    rows.forEach((r, i) => {
      for (let j = 0; j < i; j++) {
        const o = rows[j];
        if (
          text(r.unit_id) === text(o.unit_id) &&
          upper(r.utility_type) === upper(o.utility_type) &&
          ((!blank(r.account_number) &&
            text(r.account_number) === text(o.account_number)) ||
            (!blank(r.meter_number) &&
              text(r.meter_number) === text(o.meter_number)))
        ) {
          out.push(r);
          break;
        }
      }
    });
    return out;
  }

  const findOrphanBillUtilityLinks = () =>
    getAllBills().filter((r) => !getUtilityById(r.utility_id));
  const findDuplicateBillIds = () =>
    duplicates(getAllBills(), (r) => text(r.bill_id));
  const findDuplicateBillPeriods = () =>
    duplicates(getAllBills(), (r) =>
      [
        text(r.utility_id),
        date(r.billing_period_start, "billing_period_start"),
        date(r.billing_period_end, "billing_period_end"),
      ].join("|"),
    );

  function findInvalidBillingPeriods() {
    return getAllBills().filter((r) => {
      try {
        const s = date(r.billing_period_start, "start"),
          e = date(r.billing_period_end, "end");
        return s > e;
      } catch (e) {
        return true;
      }
    });
  }

  const findInvalidBillAmounts = () =>
    getAllBills().filter((r) => {
      const a = Number(r.amount),
        t = Number(r.tax_amount),
        z = Number(r.total_amount);
      return (
        !Number.isFinite(a) ||
        !Number.isFinite(t) ||
        !Number.isFinite(z) ||
        a < 0 ||
        t < 0 ||
        z < 0 ||
        !sameMoney(z, a + t)
      );
    });
  const findInvalidPaymentStatuses = () =>
    invalidRef(getAllBills(), "PAYMENT_STATUS", "payment_status");

  function findInvalidBillDates() {
    return getAllBills().filter((r) => {
      try {
        const b = date(r.bill_date, "bill_date"),
          d = date(r.due_date, "due_date");
        if (d < b) return true;
        if (!blank(r.paid_date)) date(r.paid_date, "paid_date");
        return false;
      } catch (e) {
        return true;
      }
    });
  }

  function findPaymentDateInconsistencies() {
    return getAllBills().filter((r) => {
      try {
        const paidDate = date(r.paid_date, "paid_date", true);
        validatePayment(upper(r.payment_status), paidDate);
        return false;
      } catch (e) {
        return true;
      }
    });
  }

  return {
    UTILITY_ENTITY_TYPE,
    BILL_ENTITY_TYPE,
    createUtility,
    updateUtility,
    changeUtilityStatus,
    getAllUtilities,
    getUtilityById,
    requireUtility,
    utilityExists,
    getUtilitiesByProperty,
    getUtilitiesByUnit,
    getUtilitiesByType,
    getActiveUtilities,
    getInactiveUtilities,
    createBill,
    updateBill,
    changePaymentStatus,
    markBillPaid,
    markBillPending,
    markBillRefunded,
    getAllBills,
    getBillById,
    requireBill,
    billExists,
    getBillsByUtility,
    getBillsByUnit,
    getBillsByProperty,
    getBillsByPaymentStatus,
    getBillsByDateRange,
    getBillsByBillingPeriod,
    getPendingBills,
    getOverdueBills,
    getUpcomingDueBills,
    summarizeByCurrency,
    getSingleCurrencyTotal,
    getUtilityCostByProperty,
    getUtilityCostByUnit,
    getUtilityCostByType,
    getMonthlyUtilitySummary,
    findOrphanUtilityPropertyLinks,
    findOrphanUtilityUnitLinks,
    findUtilityPropertyUnitMismatches,
    findInvalidUtilityTypes,
    findInvalidUtilityFrequencies,
    findInvalidUtilityCurrencies,
    findInvalidUtilityStatuses,
    findDuplicateUtilityIds,
    findDuplicateUtilityAccountsOrMeters,
    findOrphanBillUtilityLinks,
    findInvalidBillingPeriods,
    findDuplicateBillPeriods,
    findInvalidBillAmounts,
    findInvalidPaymentStatuses,
    findInvalidBillDates,
    findPaymentDateInconsistencies,
    findDuplicateBillIds,
  };
})();
