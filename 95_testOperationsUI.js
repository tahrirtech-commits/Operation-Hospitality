/**
 * PHASE 6.10 - OPERATIONS UI ACCEPTANCE
 * Non-destructive: verifies UI/API wiring only.
 */
function testOperationsUI() {
  Logger.log('===== PHASE 6.10 OPERATIONS UI TEST START =====');
  const results=[];
  function ok(n,d){results.push({name:n,passed:true,detail:d||''});Logger.log('PASS: '+n+(d?' | '+d:''))}
  function bad(n,e){const m=e&&e.message?e.message:String(e);results.push({name:n,passed:false,detail:m});Logger.log('FAIL: '+n+' | '+m)}
  function run(n,f){try{ok(n,f()||'')}catch(e){bad(n,e)}}
  function yes(v,m){if(!v)throw new Error(m||'Assertion failed')}
  function has(h,v){yes(h.indexOf(v)!==-1,'Missing: '+v)}

  const html=doGet({}).getContent();
  Logger.log('Rendered bytes: '+html.length);

  run('1. doGet renders Phase 6.10 HTML',()=>{yes(html.length>50000);return'bytes='+html.length});
  run('2. Operations placeholder is removed',()=>{yes(html.indexOf('orchestration screens will be added in Phase 6.10')===-1);return'removed'});
  run('3. Operations KPI area exists',()=>{has(html,'id="operationsKpis"');return'present'});
  run('4. Unit operations board exists',()=>{has(html,'id="operationsUnitGrid"');has(html,'Unit operations board');return'present'});
  run('5. Housekeeping panel exists',()=>{has(html,'id="operationsHousekeeping"');return'present'});
  run('6. Inspection panel exists',()=>{has(html,'id="operationsInspections"');return'present'});
  run('7. Maintenance panel exists',()=>{has(html,'id="operationsMaintenance"');return'present'});
  run('8. Operations detail drawer exists',()=>{has(html,'id="operationsDrawer"');has(html,'id="operationsDrawerActions"');return'present'});
  run('9. Property board uses aggregate operations.board',()=>{has(html,"'operations.board'");return'aggregate route'});
  run('10. Unit detail uses operations.unit',()=>{has(html,"'operations.unit'");return'present'});
  run('11. Staff lookup uses reference.staff',()=>{has(html,"'reference.staff'");return'present'});
  run('12. Housekeeping assignment route wired',()=>{has(html,"'operations.housekeeping.assign'");return'present'});
  run('13. Cleaning orchestration routes wired',()=>{has(html,"'operations.cleaning.start'");has(html,"'operations.cleaning.complete'");return'2 routes'});
  run('14. Housekeeping cancellation route wired',()=>{has(html,"'operations.housekeeping.cancel'");return'present'});
  run('15. Inspection start/cancel routes wired',()=>{has(html,"'operations.inspection.start'");has(html,"'operations.inspection.cancel'");return'2 routes'});
  run('16. Maintenance assignment route wired',()=>{has(html,"'operations.maintenance.assign'");return'present'});
  run('17. Maintenance schedule route wired',()=>{has(html,"'operations.maintenance.schedule'");return'present'});
  run('18. Maintenance start route wired',()=>{has(html,"'operations.maintenance.start'");return'present'});
  run('19. Maintenance completion uses orchestrated route',()=>{has(html,"'operations.maintenance.completeAndInspect'");return'present'});
  run('20. Browser has no direct operations domain access',()=>{['BaseRepository','HousekeepingService.','InspectionService.','MaintenanceService.','StayOperationsService.','OperationalStatusService.'].forEach(v=>yes(html.indexOf(v)===-1,'Forbidden dependency: '+v));return'boundary verified'});
  run('21. No raw operational-status mutation UI exists',()=>{yes(html.indexOf("'operationalStatus.change'")===-1);return'protected'});
  run('22. Dashboard UI remains present',()=>{has(html,'const DashboardUI');has(html,"'dashboard.get'");return'preserved'});
  run('23. Reservations UI remains present',()=>{has(html,'const ReservationsUI');has(html,"'reservations.list'");return'preserved'});
  run('24. Finance placeholder remains',()=>{has(html,'Phase 6.11');return'preserved'});
  run('25. API allowlist remains 73 actions',()=>{const a=WebApiService.getActions();yes(a.length===73,'Expected 73, got '+a.length);return'73 actions'});
  run('26. All 24 operations routes remain registered',()=>{const a=WebApiService.getActions().filter(x=>x.indexOf('operations.')===0);yes(a.length===24,'Expected 24, got '+a.length);return'24 routes'});
  run('27. OperationsUI reusable contract exists',()=>{['init','load','openUnit','closeDrawer','getState'].forEach(v=>has(html,v));return'5 capabilities'});
  run('28. Google palette remains intact',()=>{['#1A73E8','#202124','#5F6368','#DADCE0','#F8FAFD'].forEach(v=>has(html,v));return'palette verified'});
  run('29. Responsive operations rules exist',()=>{has(html,'@media(max-width:1100px)');has(html,'@media(max-width:700px)');return'responsive'});
  run('30. Acceptance test performs no operational writes',()=>{return'non-destructive by design'});

  const passed=results.filter(x=>x.passed).length,failed=results.length-passed;
  Logger.log('===== PHASE 6.10 OPERATIONS UI TEST SUMMARY =====');
  Logger.log('PASSED: '+passed);Logger.log('FAILED: '+failed);Logger.log(JSON.stringify(results,null,2));
  Logger.log('===== PHASE 6.10 OPERATIONS UI TEST END =====');
  if(failed)throw new Error('Phase 6.10 Operations UI acceptance failed. FAILED='+failed);
  return {passed:true,passed_count:passed,failed_count:failed,rendered_html_bytes:html.length};
}

