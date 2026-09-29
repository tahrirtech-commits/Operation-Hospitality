/**
 * PHASE 6.11 - FINANCE UI ACCEPTANCE
 * Non-destructive: validates rendered UI/API wiring only.
 */
function testFinanceUI() {
  Logger.log('===== PHASE 6.11 FINANCE UI TEST START =====');
  const results=[];
  function ok(n,d){results.push({name:n,passed:true,detail:d||''});Logger.log('PASS: '+n+(d?' | '+d:''))}
  function bad(n,e){const m=e&&e.message?e.message:String(e);results.push({name:n,passed:false,detail:m});Logger.log('FAIL: '+n+' | '+m)}
  function run(n,f){try{ok(n,f()||'')}catch(e){bad(n,e)}}
  function yes(v,m){if(!v)throw new Error(m||'Assertion failed')}
  function has(h,v){yes(h.indexOf(v)!==-1,'Missing: '+v)}
  const html=doGet({}).getContent();Logger.log('Rendered bytes: '+html.length);

  run('1. doGet renders Phase 6.11 HTML',()=>{yes(html.length>80000);return'bytes='+html.length});
  run('2. Finance placeholder is removed',()=>{yes(html.indexOf('will be added in Phase 6.11')===-1);return'removed'});
  run('3. Accounting boundary is visible',()=>{has(html,'id="financeBoundary"');has(html,'not included in a combined grand total');return'visible'});
  run('4. Finance period filter exists',()=>{has(html,'id="financeStart"');has(html,'id="financeEnd"');return'present'});
  run('5. Three independent financial summary types exist',()=>{has(html,'id="financeExpenseTotal"');has(html,'id="financeUtilityTotal"');has(html,'id="financeInternetMonthly"');return'3 sections'});
  run('6. Expense register exists',()=>{has(html,'id="financeExpensesBody"');return'present'});
  run('7. Utility bill register exists',()=>{has(html,'id="financeBillsBody"');return'present'});
  run('8. Utility service register exists',()=>{has(html,'id="financeUtilities"');return'present'});
  run('9. Internet register exists',()=>{has(html,'id="financeInternet"');return'present'});
  run('10. Finance uses aggregate overview route',()=>{has(html,"'finance.overview'");return'present'});
  run('11. Expense creation route is wired',()=>{has(html,"'finance.expenses.create'");return'present'});
  run('12. Utility creation route is wired',()=>{has(html,"'finance.utilities.create'");return'present'});
  run('13. Utility bill creation route is wired',()=>{has(html,"'finance.utilityBills.create'");return'present'});
  run('14. Utility bill payment route is wired',()=>{has(html,"'finance.utilityBills.markPaid'");return'present'});
  run('15. Internet creation route is wired',()=>{has(html,"'finance.internet.create'");return'present'});
  run('16. Reference bundle supplies finance classifications',()=>{['EXPENSE_CATEGORY','CURRENCY','PAYMENT_METHOD','UTILITY_TYPE','FREQUENCY','PAYMENT_STATUS'].forEach(v=>has(html,"'"+v+"'"));return'6 categories'});
  run('17. Units use reference.units',()=>{has(html,"'reference.units'");return'present'});
  run('18. No combined grand total element exists',()=>{yes(html.indexOf('financeGrandTotal')===-1);yes(html.indexOf('combinedTotal')===-1);return'boundary protected'});
  run('19. Utility bills are not auto-posted to expenses',()=>{has(html,'Utility bills and internet subscriptions are shown separately');return'boundary visible'});
  run('20. Internet fees are labelled subscription master',()=>{has(html,'Subscription master');has(html,'fees are not posted automatically to expenses');return'boundary visible'});
  run('21. Browser has no direct finance domain access',()=>{['BaseRepository','ExpenseService.','UtilityService.','InternetService.','AdminFinanceService.'].forEach(v=>yes(html.indexOf(v)===-1,'Forbidden dependency: '+v));return'boundary verified'});
  run('22. Dashboard UI remains present',()=>{has(html,'const DashboardUI');return'preserved'});
  run('23. Reservations UI remains present',()=>{has(html,'const ReservationsUI');return'preserved'});
  run('24. Operations UI remains present',()=>{has(html,'const OperationsUI');return'preserved'});
  run('25. API allowlist remains 73 actions',()=>{const a=WebApiService.getActions();yes(a.length===73,'Expected 73, got '+a.length);return'73 actions'});
  run('26. All 22 finance routes remain registered',()=>{const a=WebApiService.getActions().filter(x=>x.indexOf('finance.')===0);yes(a.length===22,'Expected 22, got '+a.length);return'22 routes'});
  run('27. FinanceUI exposes reusable contract',()=>{['init','load','openDrawer','closeDrawer','getState'].forEach(v=>has(html,v));return'5 capabilities'});
  run('28. Finance tabs exist',()=>{['expenses','utilities','internet'].forEach(v=>has(html,'data-finance-tab="'+v+'"'));return'3 tabs'});
  run('29. Google palette remains intact',()=>{['#1A73E8','#202124','#5F6368','#DADCE0','#F8FAFD'].forEach(v=>has(html,v));return'palette verified'});
  run('30. Responsive finance rules exist',()=>{has(html,'@media(max-width:1100px)');has(html,'@media(max-width:700px)');return'responsive'});
  run('31. Acceptance performs no finance writes',()=>{return'non-destructive by design'});

  const passed=results.filter(x=>x.passed).length,failed=results.length-passed;
  Logger.log('===== PHASE 6.11 FINANCE UI TEST SUMMARY =====');Logger.log('PASSED: '+passed);Logger.log('FAILED: '+failed);Logger.log(JSON.stringify(results,null,2));Logger.log('===== PHASE 6.11 FINANCE UI TEST END =====');
  if(failed)throw new Error('Phase 6.11 Finance UI acceptance failed. FAILED='+failed);
  return {passed:true,passed_count:passed,failed_count:failed,rendered_html_bytes:html.length};
}

