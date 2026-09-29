/**
 * ============================================================================
 * PHASE 6.12 - ADMIN APPLICATION END-TO-END ACCEPTANCE
 * ============================================================================
 * Safe/read-oriented E2E acceptance.
 *
 * Validates:
 *   Index.html -> WebApp -> WebApiService -> Admin facades -> domain reads
 *   Reference/bootstrap -> Dashboard -> Reservations -> Operations -> Finance
 *   Stable API envelopes and route allowlist
 *   Cross-module property/unit consistency
 *   Global integrity as final gate
 *
 * IMPORTANT:
 * - No reservation/operations/finance writes are performed.
 * - Existing Phase 4 lifecycle acceptance remains the authoritative destructive
 *   workflow test. Phase 6.12 proves the admin application integration layer.
 * ============================================================================
 */
function testPhase6EndToEnd() {
  Logger.log('===== PHASE 6.12 END-TO-END ACCEPTANCE START =====');

  const results = [];
  function pass(name, detail) {
    results.push({name:name, passed:true, detail:detail || ''});
    Logger.log('PASS: ' + name + (detail ? ' | ' + detail : ''));
  }
  function fail(name, err) {
    const msg = err && err.message ? err.message : String(err);
    results.push({name:name, passed:false, detail:msg});
    Logger.log('FAIL: ' + name + ' | ' + msg);
  }
  function run(name, fn) {
    try { pass(name, fn() || ''); } catch (err) { fail(name, err); }
  }
  function assertTrue(v, msg) { if (!v) throw new Error(msg || 'Assertion failed'); }
  function assertEqual(a,b,msg) { if (a !== b) throw new Error((msg || 'Values differ') + ' | expected=' + a + ' actual=' + b); }
  function success(response, action) {
    assertTrue(response && response.success === true,
      action + ' failed: ' + (response && response.error ? response.error.message : 'empty response'));
    assertEqual(null, response.error, action + ' returned error');
    assertTrue(response.meta && response.meta.action === action, action + ' meta.action mismatch');
    assertTrue(response.meta && response.meta.timestamp, action + ' timestamp missing');
    return response.data;
  }

  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMATS.DATE);
  const year = today.substring(0,4);
  const startDate = year + '-01-01';
  const endDate = year + '-12-31';

  let html = '';
  let actions = [];
  let propertyId = '';
  let unitId = '';
  let dashboard = null;
  let operations = null;
  let finance = null;

  run('1. Web application renders', () => {
    html = doGet({}).getContent();
    assertTrue(html.length > 100000, 'Rendered application is unexpectedly small.');
    return 'bytes=' + html.length;
  });

  run('2. All four admin UIs are present', () => {
    ['const DashboardUI','const ReservationsUI','const OperationsUI','const FinanceUI']
      .forEach(token => assertTrue(html.indexOf(token) !== -1, 'Missing ' + token));
    return 'Dashboard + Reservations + Operations + Finance';
  });

  run('3. Browser boundary uses apiCall()', () => {
    assertTrue(html.indexOf('.apiCall(') !== -1, 'apiCall bridge missing');
    ['BaseRepository','AdminReservationService.','AdminOperationsService.','AdminFinanceService.']
      .forEach(token => assertTrue(html.indexOf(token) === -1, 'Browser leaks dependency: ' + token));
    return 'browser -> WebApp.apiCall';
  });

  run('4. WebApp bridge delegates to WebApiService', () => {
    assertTrue(typeof apiCall === 'function', 'Global apiCall missing');
    const r = apiCall('reference.bootstrap', {});
    success(r, 'reference.bootstrap');
    return 'apiCall -> WebApiService';
  });

  run('5. Frozen API allowlist contains 73 unique actions', () => {
    actions = WebApiService.getActions();
    assertEqual(73, actions.length, 'Action count changed');
    assertEqual(actions.length, new Set(actions).size, 'Duplicate action found');
    return '73 actions';
  });

  run('6. Frozen route group counts remain intact', () => {
    const expected={dashboard:7,reservations:12,operations:24,finance:22,reference:8};
    Object.keys(expected).forEach(prefix => {
      const n=actions.filter(a => a.indexOf(prefix + '.') === 0).length;
      assertEqual(expected[prefix], n, prefix + ' route count changed');
    });
    return '7 / 12 / 24 / 22 / 8';
  });

  run('7. Reference bootstrap resolves active properties', () => {
    const data=success(apiCall('reference.bootstrap',{}),'reference.bootstrap');
    assertTrue(Array.isArray(data.properties) && data.properties.length > 0,'No active properties');
    return 'properties=' + data.properties.length;
  });

  run('8. Operational property is resolved through reference API', () => {
    const props=success(apiCall('reference.properties',{}),'reference.properties');
    for (let i=0;i<props.length;i++) {
      const units=success(apiCall('reference.units',{property_id:props[i].property_id}),'reference.units');
      if (units.length) { propertyId=props[i].property_id; unitId=units[0].unit_id; break; }
    }
    assertTrue(propertyId && unitId,'No active property with units found');
    return propertyId + ' / ' + unitId;
  });

  run('9. Reference bundle supports UI classifications', () => {
    const cats=['RESERVATION_STATUS','BOOKING_SOURCE','UNIT_TYPE','EXPENSE_CATEGORY','CURRENCY','PAYMENT_METHOD'];
    const data=success(apiCall('reference.bundle',{categories:cats}),'reference.bundle');
    cats.forEach(c => assertTrue(Array.isArray(data[c]), 'Missing category ' + c));
    return cats.length + ' categories';
  });

  run('10. Dashboard aggregate traverses full API path', () => {
    dashboard=success(apiCall('dashboard.get',{property_id:propertyId,date:today}),'dashboard.get');
    assertEqual(propertyId,dashboard.property.property_id,'Dashboard property mismatch');
    assertTrue(Array.isArray(dashboard.units),'Dashboard units missing');
    assertTrue(dashboard.kpis && typeof dashboard.kpis === 'object','Dashboard KPIs missing');
    return 'units=' + dashboard.units.length + ', alerts=' + dashboard.alerts.length;
  });

  run('11. Dashboard unit count matches reference units', () => {
    const units=success(apiCall('reference.units',{property_id:propertyId}),'reference.units');
    assertEqual(units.length,dashboard.units.length,'Dashboard/reference unit count mismatch');
    return 'units=' + units.length;
  });

  run('12. Reservation register traverses API path', () => {
    const rows=success(apiCall('reservations.list',{property_id:propertyId}),'reservations.list');
    assertTrue(Array.isArray(rows),'Reservation list not array');
    rows.forEach(x => assertEqual(propertyId,x.property.property_id,'Reservation from wrong property'));
    return 'reservations=' + rows.length;
  });

  run('13. Availability read traverses API path', () => {
    const tomorrow=Utilities.formatDate(new Date(new Date().getTime()+86400000),CONFIG.TIMEZONE,CONFIG.DATE_FORMATS.DATE);
    const data=success(apiCall('reservations.checkAvailability',{unit_id:unitId,start_date:today,end_date:tomorrow}),'reservations.checkAvailability');
    assertEqual(unitId,data.unit.unit_id,'Availability unit mismatch');
    assertTrue(data.availability && typeof data.availability.available === 'boolean','Availability boolean missing');
    return 'available=' + data.availability.available;
  });

  run('14. Operations aggregate traverses API path', () => {
    operations=success(apiCall('operations.board',{property_id:propertyId}),'operations.board');
    assertEqual(propertyId,operations.property.property_id,'Operations property mismatch');
    assertTrue(Array.isArray(operations.units),'Operations units missing');
    assertTrue(Array.isArray(operations.housekeeping),'Housekeeping missing');
    assertTrue(Array.isArray(operations.inspections),'Inspections missing');
    assertTrue(Array.isArray(operations.maintenance),'Maintenance missing');
    return 'units=' + operations.units.length;
  });

  run('15. Operations unit detail traverses API path', () => {
    const data=success(apiCall('operations.unit',{unit_id:unitId}),'operations.unit');
    assertEqual(unitId,data.unit.unit_id,'Operations unit mismatch');
    assertTrue(data.operational_status,'Operational status missing');
    return data.operational_status.operational_status;
  });
/*
  run('16. Dashboard and Operations agree on property units', () => {
    const d=new Set(dashboard.units.map(x=>x.unit.unit_id));
    const o=new Set(operations.units.map(x=>x.unit.unit_id));
    assertEqual(d.size,o.size,'Unit set sizes differ');
    d.forEach(id=>assertTrue(o.has(id),'Operations missing dashboard unit '+id));
    return 'consistent units=' + d.size;
  });
*/

run('16. Dashboard and Operations agree on property units', () => {
  const d = new Set(
    dashboard.units.map(x => x.unit_id)
  );

  const o = new Set(
    operations.units.map(x => x.unit.unit_id)
  );

  assertEqual(
    d.size,
    o.size,
    'Unit set sizes differ'
  );

  d.forEach(id =>
    assertTrue(
      o.has(id),
      'Operations missing dashboard unit ' + id
    )
  );

  o.forEach(id =>
    assertTrue(
      d.has(id),
      'Dashboard missing operations unit ' + id
    )
  );

  return 'consistent units=' + d.size;
});

  run('17. Finance overview traverses API path', () => {
    finance=success(apiCall('finance.overview',{
      property_id:propertyId,start_date:startDate,end_date:endDate,as_of_date:today
    }),'finance.overview');
    assertEqual(propertyId,finance.property.property_id,'Finance property mismatch');
    assertTrue(finance.expenses && finance.utilities && finance.internet,'Finance sections missing');
    return 'expenses=' + finance.expenses.rows.length + ', bills=' + finance.utilities.bills.length;
  });

  run('18. Finance accounting boundary survives API path', () => {
    const b=finance.accounting_boundary;
    assertTrue(b,'accounting_boundary missing');
    assertEqual(false,b.utility_bills_are_operating_expenses,'Utility boundary changed');
    assertEqual(false,b.internet_services_are_operating_expenses,'Internet boundary changed');
    assertEqual(false,b.combined_grand_total_provided,'Combined grand total unexpectedly enabled');
    return 'separation enforced';
  });

  run('19. Finance expense list is property scoped', () => {
    const rows=success(apiCall('finance.expenses.list',{property_id:propertyId}),'finance.expenses.list');
    rows.forEach(x=>assertEqual(propertyId,x.property_id,'Expense from wrong property'));
    return 'expenses=' + rows.length;
  });

  run('20. Finance utility/internet reads are property scoped', () => {
    const utilities=success(apiCall('finance.utilities.list',{property_id:propertyId}),'finance.utilities.list');
    const internet=success(apiCall('finance.internet.list',{property_id:propertyId}),'finance.internet.list');
    utilities.forEach(x=>assertEqual(propertyId,x.property_id,'Utility from wrong property'));
    internet.forEach(x=>assertEqual(propertyId,x.property_id,'Internet service from wrong property'));
    return 'utilities=' + utilities.length + ', internet=' + internet.length;
  });

  run('21. Success API envelope is stable', () => {
    const r=apiCall('operations.unit',{unit_id:unitId});
    success(r,'operations.unit');
    assertEqual(null,r.error,'Success error must be null');
    return 'stable';
  });

  run('22. Unknown action returns controlled NOT_FOUND envelope', () => {
    const r=apiCall('internal.deleteEverything',{});
    assertEqual(false,r.success,'Unknown action unexpectedly succeeded');
    assertEqual(null,r.data,'Failure data must be null');
    assertEqual('NOT_FOUND',r.error.code,'Unknown action code changed');
    assertEqual('internal.deleteEverything',r.meta.action,'Failure meta mismatch');
    return r.error.code;
  });

  run('23. Missing required parameter returns VALIDATION_ERROR', () => {
    const r=apiCall('operations.unit',{});
    assertEqual(false,r.success,'Invalid request unexpectedly succeeded');
    assertEqual('VALIDATION_ERROR',r.error.code,'Validation error mapping changed');
    return r.error.code;
  });

  run('24. Invalid entity returns controlled NOT_FOUND', () => {
    const r=apiCall('operations.unit',{unit_id:'UNIT-999999'});
    assertEqual(false,r.success,'Invalid unit unexpectedly succeeded');
    assertEqual('NOT_FOUND',r.error.code,'Invalid entity mapping changed');
    return r.error.code;
  });

  run('25. Strict API entry point rejects unknown actions', () => {
    let threw=false;try{WebApiService.execute('not.allowed',{});}catch(e){threw=true;}
    assertTrue(threw,'WebApiService.execute did not throw');
    return 'rejected';
  });

  run('26. No raw repository/API escape routes are allowlisted', () => {
    actions.forEach(a=>{
      assertTrue(a.indexOf('repository.')!==0,'Repository route exposed: '+a);
      assertTrue(a.indexOf('sheet.')!==0,'Sheet route exposed: '+a);
      assertTrue(a.indexOf('operationalStatus.')!==0,'Raw status route exposed: '+a);
    });
    return 'protected';
  });

  run('27. Current rendered app contains no remaining phase placeholders', () => {
    ['Phase 6.8','Phase 6.9','Phase 6.10','Phase 6.11']
      .forEach(x=>assertTrue(html.indexOf('will be added in '+x)===-1,'Placeholder remains for '+x));
    return 'all four screens implemented';
  });

  run('28. Global integrity service completes', () => {
    assertTrue(typeof IntegrityCheckService === 'object','IntegrityCheckService missing');
    assertTrue(typeof IntegrityCheckService.runAll === 'function','runAll missing');
    const report=IntegrityCheckService.runAll();
    assertTrue(report && typeof report === 'object','Integrity report missing');
    assertEqual(0,Number(report.errors||0),'Global integrity has errors');
    return 'errors=' + report.errors + ', warnings=' + report.warnings + ', info=' + report.infos;
  });

  const passed=results.filter(x=>x.passed).length;
  const failed=results.length-passed;
  Logger.log('===== PHASE 6.12 END-TO-END ACCEPTANCE SUMMARY =====');
  Logger.log('PROPERTY: ' + propertyId);
  Logger.log('UNIT: ' + unitId);
  Logger.log('PASSED: ' + passed);
  Logger.log('FAILED: ' + failed);
  Logger.log(JSON.stringify(results,null,2));
  Logger.log('===== PHASE 6.12 END-TO-END ACCEPTANCE END =====');

  if (failed > 0) {
    throw new Error('PHASE 6.12 END-TO-END ACCEPTANCE FAILED. FAILED=' + failed);
  }
  return {
    passed:true,
    passed_count:passed,
    failed_count:failed,
    property_id:propertyId,
    unit_id:unitId,
    api_actions:actions.length
  };
}
