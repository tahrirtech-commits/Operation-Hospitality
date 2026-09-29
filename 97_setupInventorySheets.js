/**
 * One-time Phase 4 inventory sheet setup.
 * Creates missing sheets only; never deletes or clears existing data.
 */
function setupInventorySheets() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const definitions = [
    {
      name: CONFIG.SHEETS.INVENTORY_ITEMS,
      headers: [
        'item_id','item_code','name','category','unit_of_measure','item_type',
        'reorder_level','target_stock_level','unit_cost','preferred_vendor_id',
        'active','notes','created_at','updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_LOCATIONS,
      headers: [
        'location_id','property_id','unit_id','name','location_type','active',
        'notes','created_at','updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_STOCK,
      headers: [
        'stock_id','item_id','location_id','quantity_on_hand','reserved_quantity',
        'minimum_quantity','maximum_quantity','last_counted_at','updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_TRANSACTIONS,
      headers: [
        'transaction_id','item_id','transaction_type','quantity',
        'from_location_id','to_location_id','unit_id','reservation_id',
        'housekeeping_task_id','maintenance_work_order_id','reference_type',
        'reference_id','unit_cost','notes','performed_by','transaction_at'
      ]
    }
  ];

  const result = [];

  definitions.forEach(def => {
    let sheet = ss.getSheetByName(def.name);

    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
      sheet.autoResizeColumns(1, def.headers.length);
      result.push({ sheet: def.name, action: 'CREATED' });
      return;
    }

    const lastColumn = sheet.getLastColumn();
    const existingHeaders = lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String)
      : [];

    const sameHeaders =
      existingHeaders.length === def.headers.length &&
      def.headers.every((header, i) => existingHeaders[i] === header);

    if (!sameHeaders) {
      throw new Error(
        'Sheet already exists with unexpected headers: ' + def.name +
        '. Existing data was not modified.'
      );
    }

    result.push({ sheet: def.name, action: 'ALREADY_EXISTS' });
  });

  IdService.initializeAll();

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
