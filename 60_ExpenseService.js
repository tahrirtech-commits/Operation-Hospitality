/**
 * 60_ExpenseService.gs
 * Phase 5 - Finance & Reporting
 *
 * Sheet: 27_OperatingExpenses
 * expense_id | property_id | unit_id | reservation_id | expense_date |
 * category | description | amount | currency | payment_method | vendor |
 * receipt_url | notes
 */
const ExpenseService = (() => {
  const ENTITY_TYPE = 'OPERATING_EXPENSE';
  const SHEET = CONFIG.SHEETS.OPERATING_EXPENSES;
  const REF = {
    EXPENSE_CATEGORY: 'EXPENSE_CATEGORY',
    CURRENCY: 'CURRENCY',
    PAYMENT_METHOD: 'PAYMENT_METHOD'
  };

  function isBlank(v) { return v === undefined || v === null || String(v).trim() === ''; }
  function text(v) { return isBlank(v) ? '' : String(v).trim(); }
  function norm(v) { return text(v).toUpperCase(); }
  function actor(v) { return text(v) || CONFIG.DEFAULTS.ACTOR_ID; }
  function money(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }

  function positiveNumber(v, field) {
    if (isBlank(v)) throw new Error(field + ' is required.');
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(field + ' must be greater than 0.');
    return n;
  }

  function normalizeDate(v) {
    if (isBlank(v)) throw new Error('expense_date is required.');
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) throw new Error('Invalid expense_date.');
      return Utilities.formatDate(v, CONFIG.TIMEZONE, CONFIG.DATE_FORMATS.DATE);
    }
    const s = text(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error('expense_date must use YYYY-MM-DD format.');
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const x = new Date(y, mo - 1, d);
    if (x.getFullYear() !== y || x.getMonth() !== mo - 1 || x.getDate() !== d) {
      throw new Error('Invalid expense_date: ' + s);
    }
    return s;
  }

  function dateNumber(v) { return Number(normalizeDate(v).replace(/-/g, '')); }

  function validateDateRange(startDate, endDate) {
    const start = normalizeDate(startDate), end = normalizeDate(endDate);
    if (dateNumber(start) > dateNumber(end)) throw new Error('startDate cannot be after endDate.');
    return { start_date: start, end_date: end };
  }

  function validateRef(category, value, required) {
    const v = norm(value);
    if (!v) {
      if (required) throw new Error(category + ' value is required.');
      return '';
    }
    ValidationService.validateReference(category, v);
    return v;
  }

  function validateCategory(v) { return validateRef(REF.EXPENSE_CATEGORY, v, true); }
  function validateCurrency(v) { return validateRef(REF.CURRENCY, v, true); }
  function validatePaymentMethod(v) { return validateRef(REF.PAYMENT_METHOD, v, false); }

  function requireRecord(sheet, idField, id, label) {
    const value = text(id);
    if (!value) throw new Error(label + ' ID is required.');
    const row = BaseRepository.findById(sheet, idField, value);
    if (!row) throw new Error(label + ' not found: ' + value);
    return row;
  }

  function requireProperty(id) { return requireRecord(CONFIG.SHEETS.PROPERTIES, 'property_id', id, 'Property'); }
  function requireUnit(id) { return requireRecord(CONFIG.SHEETS.UNITS, 'unit_id', id, 'Unit'); }
  function requireReservation(id) {
    if (typeof ReservationService !== 'undefined' && ReservationService &&
        typeof ReservationService.requireReservation === 'function') {
      return ReservationService.requireReservation(id);
    }
    return requireRecord(CONFIG.SHEETS.RESERVATIONS, 'reservation_id', id, 'Reservation');
  }

  function validateRelationships(data) {
    const propertyId = text(data.property_id), unitId = text(data.unit_id), reservationId = text(data.reservation_id);
    requireProperty(propertyId);
    let unit = null, reservation = null;

    if (unitId) {
      unit = requireUnit(unitId);
      if (text(unit.property_id) !== propertyId) {
        throw new Error('Unit ' + unitId + ' does not belong to property ' + propertyId + '.');
      }
    }

    if (reservationId) {
      reservation = requireReservation(reservationId);
      const reservationUnitId = text(reservation.unit_id);
      if (unitId && reservationUnitId && unitId !== reservationUnitId) {
        throw new Error('Reservation ' + reservationId + ' belongs to unit ' + reservationUnitId + ', not ' + unitId + '.');
      }
      if (reservationUnitId) {
        const reservationUnit = requireUnit(reservationUnitId);
        if (text(reservationUnit.property_id) !== propertyId) {
          throw new Error('Reservation ' + reservationId + ' does not belong to property ' + propertyId + '.');
        }
      }
    }
    return { unit: unit, reservation: reservation };
  }

  function validateExpense(data) {
    if (!data || typeof data !== 'object') throw new Error('Expense data is required.');
    const out = {
      property_id: text(data.property_id),
      unit_id: text(data.unit_id),
      reservation_id: text(data.reservation_id),
      expense_date: normalizeDate(data.expense_date),
      category: validateCategory(data.category),
      description: text(data.description),
      amount: positiveNumber(data.amount, 'amount'),
      currency: validateCurrency(data.currency),
      payment_method: validatePaymentMethod(data.payment_method),
      vendor: text(data.vendor),
      receipt_url: text(data.receipt_url),
      notes: text(data.notes)
    };
    if (!out.property_id) throw new Error('property_id is required.');
    if (!out.description) throw new Error('description is required.');
    validateRelationships(out);
    return out;
  }

  function getAll() { return BaseRepository.findAll(SHEET); }
  function getById(id) { return BaseRepository.findById(SHEET, 'expense_id', text(id)); }
  function exists(id) { return !!getById(id); }
  function requireExpense(id) {
    const row = getById(id);
    if (!row) throw new Error('Operating expense not found: ' + text(id));
    return row;
  }

  function createExpense(data, actorId) {
    const a = actor(actorId), v = validateExpense(data);
    const row = Object.assign({ expense_id: IdService.nextId(ENTITY_TYPE) }, v);
    const inserted = BaseRepository.insert(SHEET, row);
    AuditService.logCreate(ENTITY_TYPE, inserted.expense_id, inserted, a);
    return inserted;
  }

  function updateExpense(expenseId, changes, actorId) {
    const a = actor(actorId), current = requireExpense(expenseId);
    if (!changes || typeof changes !== 'object') throw new Error('Expense changes are required.');
    if (Object.prototype.hasOwnProperty.call(changes, 'expense_id') &&
        text(changes.expense_id) !== text(current.expense_id)) {
      throw new Error('expense_id is immutable.');
    }
    const candidate = Object.assign({}, current);
    ['property_id','unit_id','reservation_id','expense_date','category','description','amount','currency','payment_method','vendor','receipt_url','notes']
      .forEach(f => { if (Object.prototype.hasOwnProperty.call(changes, f)) candidate[f] = changes[f]; });
    const v = validateExpense(candidate);
    const updated = BaseRepository.update(SHEET, 'expense_id', current.expense_id, v);
    AuditService.logUpdate(ENTITY_TYPE, current.expense_id, current, updated, a);
    return updated;
  }

  function getByProperty(id) { return BaseRepository.findByField(SHEET, 'property_id', text(id)); }
  function getByUnit(id) { return BaseRepository.findByField(SHEET, 'unit_id', text(id)); }
  function getByReservation(id) { return BaseRepository.findByField(SHEET, 'reservation_id', text(id)); }
  function getByCategory(v) { const x=norm(v); return getAll().filter(r => norm(r.category) === x); }
  function getByVendor(v) { const x=norm(v); return getAll().filter(r => norm(r.vendor) === x); }
  function getByCurrency(v) { const x=norm(v); return getAll().filter(r => norm(r.currency) === x); }
  function getByPaymentMethod(v) { const x=norm(v); return getAll().filter(r => norm(r.payment_method) === x); }

  function getByDateRange(startDate, endDate) {
    const range = validateDateRange(startDate, endDate), start = dateNumber(range.start_date), end = dateNumber(range.end_date);
    return getAll().filter(r => {
      try { const d=dateNumber(r.expense_date); return d >= start && d <= end; }
      catch (e) { return false; }
    });
  }

  function getByPropertyAndDateRange(propertyId, startDate, endDate) {
    const id=text(propertyId); requireProperty(id);
    return getByDateRange(startDate,endDate).filter(r => text(r.property_id) === id);
  }

  function getByUnitAndDateRange(unitId, startDate, endDate) {
    const id=text(unitId); requireUnit(id);
    return getByDateRange(startDate,endDate).filter(r => text(r.unit_id) === id);
  }

  function summarizeByCurrency(rows) {
    const totals={};
    rows.forEach(r => {
      const c=norm(r.currency); if(!c) return;
      totals[c]=money((totals[c] || 0) + Number(r.amount || 0));
    });
    return Object.keys(totals).sort().map(c => ({currency:c,total:totals[c]}));
  }

  function singleCurrencyTotal(rows) {
    const totals=summarizeByCurrency(rows);
    if (!totals.length) return {currency:'',total:0,expense_count:rows.length};
    if (totals.length > 1) throw new Error('Expenses contain multiple currencies. Use currency-aware aggregation.');
    return {currency:totals[0].currency,total:totals[0].total,expense_count:rows.length};
  }

  function getTotalByProperty(propertyId,startDate,endDate) { return singleCurrencyTotal(getByPropertyAndDateRange(propertyId,startDate,endDate)); }
  function getTotalByUnit(unitId,startDate,endDate) { return singleCurrencyTotal(getByUnitAndDateRange(unitId,startDate,endDate)); }
  function getTotalByReservation(reservationId) { requireReservation(reservationId); return singleCurrencyTotal(getByReservation(reservationId)); }
  function getTotalsByCurrency(propertyId,startDate,endDate) { return summarizeByCurrency(getByPropertyAndDateRange(propertyId,startDate,endDate)); }

  function getTotalsByCategory(propertyId,startDate,endDate) {
    const grouped={};
    getByPropertyAndDateRange(propertyId,startDate,endDate).forEach(r => {
      const category=norm(r.category), currency=norm(r.currency), key=category+'|'+currency;
      if(!grouped[key]) grouped[key]={category:category,currency:currency,total:0,expense_count:0};
      grouped[key].total=money(grouped[key].total + Number(r.amount || 0));
      grouped[key].expense_count++;
    });
    return Object.keys(grouped).sort().map(k => grouped[k]);
  }

  function getTotalsByUnit(propertyId,startDate,endDate) {
    const grouped={};
    getByPropertyAndDateRange(propertyId,startDate,endDate).forEach(r => {
      const unitId=text(r.unit_id), currency=norm(r.currency), key=(unitId || 'UNALLOCATED')+'|'+currency;
      if(!grouped[key]) grouped[key]={unit_id:unitId,currency:currency,total:0,expense_count:0};
      grouped[key].total=money(grouped[key].total + Number(r.amount || 0));
      grouped[key].expense_count++;
    });
    return Object.keys(grouped).sort().map(k => grouped[k]);
  }

  function findOrphanPropertyLinks() {
    return getAll().filter(r => !text(r.property_id) || !BaseRepository.findById(CONFIG.SHEETS.PROPERTIES,'property_id',text(r.property_id)));
  }
  function findOrphanUnitLinks() {
    return getAll().filter(r => text(r.unit_id) && !BaseRepository.findById(CONFIG.SHEETS.UNITS,'unit_id',text(r.unit_id)));
  }
  function findPropertyUnitMismatches() {
    return getAll().filter(r => {
      if(!text(r.property_id) || !text(r.unit_id)) return false;
      const u=BaseRepository.findById(CONFIG.SHEETS.UNITS,'unit_id',text(r.unit_id));
      return !!u && text(u.property_id) !== text(r.property_id);
    });
  }
  function findOrphanReservationLinks() {
    return getAll().filter(r => text(r.reservation_id) && !BaseRepository.findById(CONFIG.SHEETS.RESERVATIONS,'reservation_id',text(r.reservation_id)));
  }
  function findReservationUnitMismatches() {
    return getAll().filter(r => {
      if(!text(r.reservation_id)) return false;
      const res=BaseRepository.findById(CONFIG.SHEETS.RESERVATIONS,'reservation_id',text(r.reservation_id));
      if(!res) return false;
      const resUnit=text(res.unit_id), expUnit=text(r.unit_id);
      if(expUnit && resUnit && expUnit !== resUnit) return true;
      if(resUnit) {
        const u=BaseRepository.findById(CONFIG.SHEETS.UNITS,'unit_id',resUnit);
        if(u && text(u.property_id) !== text(r.property_id)) return true;
      }
      return false;
    });
  }
  function findInvalidCategories() { return getAll().filter(r => { try{validateCategory(r.category);return false;}catch(e){return true;} }); }
  function findInvalidAmounts() { return getAll().filter(r => isBlank(r.amount) || !Number.isFinite(Number(r.amount)) || Number(r.amount) <= 0); }
  function findInvalidCurrencies() { return getAll().filter(r => { try{validateCurrency(r.currency);return false;}catch(e){return true;} }); }
  function findInvalidPaymentMethods() { return getAll().filter(r => { try{validatePaymentMethod(r.payment_method);return false;}catch(e){return true;} }); }
  function findInvalidDates() { return getAll().filter(r => { try{normalizeDate(r.expense_date);return false;}catch(e){return true;} }); }
  function findMissingDescriptions() { return getAll().filter(r => isBlank(r.description)); }
  function findDuplicateExpenseIds() {
    const seen=new Set(), dup=[];
    getAll().forEach(r => { const id=text(r.expense_id); if(!id)return; if(seen.has(id))dup.push(r); else seen.add(id); });
    return dup;
  }

  // Vendor remains free text. These helpers are analytical, not FK enforcement.
  function getKnownVendors() { return CONFIG.SHEETS.VENDORS ? BaseRepository.findAll(CONFIG.SHEETS.VENDORS) : []; }
  function findVendorByName(name) { const x=norm(name); return !x ? null : (getKnownVendors().find(v => norm(v.vendor_name) === x) || null); }
  function getVendorResolution(name) { const n=text(name), v=findVendorByName(n); return {vendor:n,matched:!!v,vendor_record:v}; }
  function findUnknownVendorNames() { return getAll().filter(r => text(r.vendor) && !findVendorByName(r.vendor)); }
  function findInactiveKnownVendors() {
    return getAll().filter(r => { if(!text(r.vendor))return false; const v=findVendorByName(r.vendor); return !!v && norm(v.status) !== 'ACTIVE'; });
  }

  return {
    ENTITY_TYPE, REFERENCE_CATEGORY:REF,
    createExpense, updateExpense,
    getAll, getById, requireExpense, exists,
    getByProperty, getByUnit, getByReservation, getByCategory, getByVendor,
    getByCurrency, getByPaymentMethod, getByDateRange,
    getByPropertyAndDateRange, getByUnitAndDateRange,
    getTotalByProperty, getTotalByUnit, getTotalByReservation,
    getTotalsByCurrency, getTotalsByCategory, getTotalsByUnit, summarizeByCurrency,
    validateExpense, validateCategory, validateCurrency, validatePaymentMethod, validateDateRange,
    getKnownVendors, findVendorByName, getVendorResolution,
    findUnknownVendorNames, findInactiveKnownVendors,
    findOrphanPropertyLinks, findOrphanUnitLinks, findPropertyUnitMismatches,
    findOrphanReservationLinks, findReservationUnitMismatches,
    findInvalidCategories, findInvalidAmounts, findInvalidCurrencies,
    findInvalidPaymentMethods, findInvalidDates, findMissingDescriptions,
    findDuplicateExpenseIds
  };
})();
