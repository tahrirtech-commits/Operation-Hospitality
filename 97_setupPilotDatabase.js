/**
 * ============================================================================
 * 97_setupPilotDatabase.js
 * RENTAL OPERATIONS MVP
 * ============================================================================
 *
 * Non-destructive, idempotent bootstrap for a blank PILOT spreadsheet.
 *
 * Rules:
 * - Creates missing runtime sheets.
 * - Never deletes sheets or data.
 * - Refuses an existing sheet whose row-1 schema differs from the canonical
 *   schema below.
 * - Seeds only missing ReferenceData rows.
 * - Initializes IdService sequences after all managed sheets exist.
 * - Runs IntegrityCheckService when available and returns its result.
 *
 * IMPORTANT:
 * This installer intentionally creates the runtime sheets required by
 * IntegrityCheckService, not every future/optional sheet name in CONFIG.
 * ============================================================================
 */

function setupPilotDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'setupPilotDatabase() must run from a container-bound Google Sheet.'
    );
  }

  const report = {
    spreadsheet_id: ss.getId(),
    spreadsheet_name: ss.getName(),
    created_sheets: [],
    existing_sheets: [],
    seeded_reference_rows: 0,
    id_sequences_initialized: false,
    integrity: null
  };

  const definitions = getPilotDatabaseDefinitions_();

  // --------------------------------------------------------------------------
  // 1. Create / validate canonical runtime sheets.
  // --------------------------------------------------------------------------
  definitions.forEach(def => {
    let sheet = ss.getSheetByName(def.name);

    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet
        .getRange(1, 1, 1, def.headers.length)
        .setValues([def.headers])
        .setFontWeight('bold');

      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, def.headers.length);
      report.created_sheets.push(def.name);
      return;
    }

    const lastColumn = sheet.getLastColumn();

    if (lastColumn === 0) {
      sheet
        .getRange(1, 1, 1, def.headers.length)
        .setValues([def.headers])
        .setFontWeight('bold');

      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, def.headers.length);
      report.existing_sheets.push(def.name + ' (empty sheet initialized)');
      return;
    }

    const actualHeaders = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map(value => String(value || '').trim());

    const exactMatch =
      actualHeaders.length === def.headers.length &&
      def.headers.every((header, index) => actualHeaders[index] === header);

    if (!exactMatch) {
      throw new Error(
        'SCHEMA_MISMATCH: ' + def.name +
        '\nExpected: ' + def.headers.join(' | ') +
        '\nActual:   ' + actualHeaders.join(' | ') +
        '\nNo changes were made to this existing sheet.'
      );
    }

    report.existing_sheets.push(def.name);
  });

  // --------------------------------------------------------------------------
  // 2. Seed controlled reference data.
  // --------------------------------------------------------------------------
  report.seeded_reference_rows = seedPilotReferenceData_();

  // --------------------------------------------------------------------------
  // 3. Initialize / reconcile ID sequences.
  // --------------------------------------------------------------------------
  if (
    typeof IdService === 'undefined' ||
    !IdService ||
    typeof IdService.initializeAll !== 'function'
  ) {
    throw new Error('IdService.initializeAll() is not available.');
  }

  IdService.initializeAll();
  report.id_sequences_initialized = true;

  // --------------------------------------------------------------------------
  // 4. Run the project's authoritative integrity suite.
  // --------------------------------------------------------------------------
  if (
    typeof IntegrityCheckService !== 'undefined' &&
    IntegrityCheckService &&
    typeof IntegrityCheckService.runAll === 'function'
  ) {
    report.integrity = IntegrityCheckService.runAll();
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


/**
 * Canonical schemas required by the current MVP runtime.
 *
 * Full persistence columns are included where domain services persist optional
 * metadata, because BaseRepository writes only fields represented by headers.
 */
function getPilotDatabaseDefinitions_() {
  return [
    {
      name: CONFIG.SHEETS.REFERENCE_DATA,
      headers: ['category', 'code', 'label', 'active']
    },
    {
      name: CONFIG.SHEETS.PROPERTIES,
      headers: [
        'property_id', 'property_code', 'name', 'property_type', 'location_id',
        'address', 'city', 'country', 'timezone', 'currency',
        'check_in_time', 'check_out_time', 'min_nights', 'max_nights',
        'status', 'notes', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.UNITS,
      headers: [
        'unit_id', 'property_id', 'unit_code', 'unit_name', 'unit_type',
        'bedrooms', 'bathrooms', 'max_guests', 'floor', 'view_type',
        'status', 'notes', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.LOCATIONS,
      headers: [
        'location_id', 'name', 'city', 'region', 'country',
        'latitude', 'longitude', 'active', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.CUSTOMERS,
      headers: [
        'customer_id', 'first_name', 'last_name', 'email', 'phone',
        'nationality', 'status', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.GUESTS,
      headers: [
        'guest_id', 'first_name', 'last_name', 'email', 'phone',
        'nationality', 'id_type', 'id_number', 'date_of_birth',
        'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.RESERVATIONS,
      headers: [
        'reservation_id', 'unit_id', 'customer_id', 'booking_source',
        'check_in_date', 'check_out_date', 'adults', 'children',
        'status', 'notes', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.RESERVATION_GUESTS,
      headers: ['reservation_guest_id', 'reservation_id', 'guest_id', 'role']
    },
    {
      name: CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS,
      headers: [
        'external_event_id', 'unit_id', 'source', 'external_uid',
        'start_date', 'end_date', 'summary', 'status',
        'last_seen_at', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.OTA_BLOCKS,
      headers: [
        'ota_block_id', 'reservation_id', 'unit_id', 'source',
        'start_date', 'end_date', 'status', 'blocked_at', 'cancelled_at',
        'notes', 'created_at', 'updated_at', 'updated_by'
      ]
    },
    {
      name: CONFIG.SHEETS.STAFF,
      headers: [
        'staff_id', 'name', 'role', 'property_id', 'phone', 'email',
        'status', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.HOUSEKEEPING_TASKS,
      headers: [
        'task_id', 'unit_id', 'reservation_id', 'task_type', 'priority',
        'scheduled_date', 'scheduled_start', 'scheduled_end', 'assigned_to',
        'status', 'started_at', 'completed_at', 'inspection_required', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES,
      headers: [
        'schedule_id', 'unit_id', 'task_type', 'frequency', 'interval_value',
        'day_of_week', 'day_of_month', 'last_completed', 'next_due',
        'assigned_to', 'active'
      ]
    },
    {
      name: CONFIG.SHEETS.MAINTENANCE_ASSETS,
      headers: [
        'asset_id', 'unit_id', 'asset_type', 'name', 'brand', 'model',
        'serial_number', 'purchase_date', 'warranty_until',
        'expected_life_years', 'status'
      ]
    },
    {
      name: CONFIG.SHEETS.MAINTENANCE_SCHEDULES,
      headers: [
        'schedule_id', 'asset_id', 'maintenance_type', 'frequency',
        'interval_value', 'last_completed', 'next_due', 'assigned_to',
        'estimated_duration', 'estimated_cost', 'active'
      ]
    },
    {
      name: CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
      headers: [
        'work_order_id', 'unit_id', 'asset_id', 'reservation_id', 'source',
        'issue_type', 'description', 'priority', 'assigned_to',
        'scheduled_date', 'status', 'started_at', 'completed_at',
        'cost', 'resolution'
      ]
    },
    {
      name: CONFIG.SHEETS.INSPECTIONS,
      headers: [
        'inspection_id', 'unit_id', 'reservation_id', 'inspection_type',
        'scheduled_at', 'inspector_id', 'status', 'cleanliness_score',
        'maintenance_score', 'overall_result', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.INSPECTION_CHECKLIST,
      headers: [
        'checklist_item_id', 'inspection_id', 'category', 'item',
        'result', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,
      headers: [
        'unit_id', 'operational_status', 'status_reason', 'status_since',
        'expected_ready_at', 'updated_by', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.UTILITIES,
      headers: [
        'utility_id', 'property_id', 'unit_id', 'utility_type', 'provider',
        'account_number', 'meter_number', 'billing_frequency',
        'currency', 'status'
      ]
    },
    {
      name: CONFIG.SHEETS.UTILITY_BILLS,
      headers: [
        'bill_id', 'utility_id', 'billing_period_start', 'billing_period_end',
        'bill_date', 'due_date', 'amount', 'tax_amount', 'total_amount',
        'payment_status', 'paid_date', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.INTERNET_SERVICES,
      headers: [
        'internet_service_id', 'property_id', 'unit_id', 'provider',
        'account_number', 'package_name', 'monthly_fee', 'installation_fee',
        'billing_cycle', 'contract_start', 'contract_end', 'status'
      ]
    },
    {
      name: CONFIG.SHEETS.OPERATING_EXPENSES,
      headers: [
        'expense_id', 'property_id', 'unit_id', 'reservation_id',
        'expense_date', 'category', 'description', 'amount', 'currency',
        'payment_method', 'vendor', 'receipt_url', 'notes'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_ITEMS,
      headers: [
        'item_id', 'item_code', 'name', 'category', 'unit_of_measure',
        'item_type', 'reorder_level', 'target_stock_level', 'unit_cost',
        'preferred_vendor_id', 'active', 'notes', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_LOCATIONS,
      headers: [
        'location_id', 'property_id', 'unit_id', 'name', 'location_type',
        'active', 'notes', 'created_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_STOCK,
      headers: [
        'stock_id', 'item_id', 'location_id', 'quantity_on_hand',
        'reserved_quantity', 'minimum_quantity', 'maximum_quantity',
        'last_counted_at', 'updated_at'
      ]
    },
    {
      name: CONFIG.SHEETS.INVENTORY_TRANSACTIONS,
      headers: [
        'transaction_id', 'item_id', 'transaction_type', 'quantity',
        'from_location_id', 'to_location_id', 'unit_id', 'reservation_id',
        'housekeeping_task_id', 'maintenance_work_order_id',
        'reference_type', 'reference_id', 'unit_cost', 'notes',
        'performed_by', 'transaction_at'
      ]
    },
    {
      name: CONFIG.SHEETS.AUDIT_LOG,
      headers: [
        'audit_id', 'timestamp', 'actor_type', 'actor_id', 'action',
        'entity_type', 'entity_id', 'old_value', 'new_value'
      ]
    }
  ];
}


/**
 * Seed values supported by current service enums, validation rules and
 * acceptance/integration tests.
 *
 * This is configuration/reference data only. It does not create properties,
 * units, customers, staff, reservations or other business records.
 */
function getPilotReferenceSeed_() {
  return {
    PROPERTY_TYPE: [
      ['APARTMENT', 'Apartment'],
      ['VILLA', 'Villa'],
      ['CHALET', 'Chalet']
    ],

    UNIT_TYPE: [
      ['STUDIO', 'Studio'],
      ['ONE_BEDROOM', 'One Bedroom'],
      ['TWO_BEDROOM', 'Two Bedroom'],
      ['THREE_BEDROOM', 'Three Bedroom'],
      ['VILLA', 'Villa']
    ],

    UNIT_STATUS: [
      ['ACTIVE', 'Active'],
      ['INACTIVE', 'Inactive']
    ],

    STAFF_ROLE: [
      ['ADMIN', 'Admin'],
      ['SUPERVISOR', 'Supervisor'],
      ['HOUSEKEEPER', 'Housekeeper'],
      ['TECHNICIAN', 'Technician']
    ],

    OPERATIONAL_STATUS: [
      ['READY', 'Ready'],
      ['RESERVED', 'Reserved'],
      ['OCCUPIED', 'Occupied'],
      ['DIRTY', 'Dirty'],
      ['CLEANING', 'Cleaning'],
      ['INSPECTION', 'Inspection'],
      ['MAINTENANCE', 'Maintenance'],
      ['OUT_OF_SERVICE', 'Out of Service'],
      ['BLOCKED', 'Blocked']
    ],

    RESERVATION_STATUS: [
      ['PENDING', 'Pending'],
      ['CONFIRMED', 'Confirmed'],
      ['CHECKED_IN', 'Checked In'],
      ['COMPLETED', 'Completed'],
      ['CANCELLED', 'Cancelled'],
      ['NO_SHOW', 'No Show']
    ],

    BOOKING_SOURCE: [
      ['DIRECT', 'Direct'],
      ['AIRBNB', 'Airbnb'],
      ['BOOKING_COM', 'Booking.com'],
      ['OTHER', 'Other']
    ],

    INVENTORY_ITEM_TYPE: [
      ['CONSUMABLE', 'Consumable'],
      ['REUSABLE', 'Reusable']
    ],

    INVENTORY_CATEGORY: [
      ['LINEN', 'Linen'],
      ['TOILETRIES', 'Toiletries'],
      ['CLEANING', 'Cleaning'],
      ['KITCHEN', 'Kitchen'],
      ['MAINTENANCE', 'Maintenance'],
      ['OTHER', 'Other']
    ],

    INVENTORY_LOCATION_TYPE: [
      ['UNIT', 'Unit'],
      ['STORE', 'Store'],
      ['HOUSEKEEPING', 'Housekeeping'],
      ['LAUNDRY', 'Laundry'],
      ['MAINTENANCE', 'Maintenance'],
      ['QUARANTINE', 'Quarantine'],
      ['OTHER', 'Other']
    ],

    INVENTORY_TRANSACTION_TYPE: [
      ['RECEIPT', 'Receipt'],
      ['TRANSFER', 'Transfer'],
      ['CONSUMPTION', 'Consumption'],
      ['ADJUSTMENT_IN', 'Adjustment In'],
      ['ADJUSTMENT_OUT', 'Adjustment Out'],
      ['DAMAGE', 'Damage'],
      ['LOSS', 'Loss'],
      ['RETURN', 'Return']
    ],

    INVENTORY_UOM: [
      ['EACH', 'Each'],
      ['SET', 'Set'],
      ['PACK', 'Pack'],
      ['BOX', 'Box'],
      ['LITER', 'Liter'],
      ['KG', 'Kilogram']
    ],

    EXPENSE_CATEGORY: [
      ['AMENITIES', 'Amenities'],
      ['MAINTENANCE', 'Maintenance'],
      ['ELECTRICITY', 'Electricity'],
      ['WATER', 'Water'],
      ['INTERNET', 'Internet'],
      ['HOUSEKEEPING', 'Housekeeping'],
      ['LAUNDRY', 'Laundry'],
      ['OTHER', 'Other']
    ],

    CURRENCY: [
      ['EGP', 'Egyptian Pound'],
      ['USD', 'US Dollar'],
      ['EUR', 'Euro'],
      ['SAR', 'Saudi Riyal']
    ],

    PAYMENT_METHOD: [
      ['CASH', 'Cash'],
      ['BANK_TRANSFER', 'Bank Transfer'],
      ['CARD', 'Card'],
      ['OTHER', 'Other']
    ],

    UTILITY_TYPE: [
      ['ELECTRICITY', 'Electricity'],
      ['WATER', 'Water'],
      ['GAS', 'Gas'],
      ['OTHER', 'Other']
    ],

    FREQUENCY: [
      ['DAILY', 'Daily'],
      ['WEEKLY', 'Weekly'],
      ['MONTHLY', 'Monthly'],
      ['QUARTERLY', 'Quarterly'],
      ['SEMI_ANNUAL', 'Semi Annual'],
      ['ANNUAL', 'Annual'],
      ['INTERVAL_DAYS', 'Interval Days']
    ],

    PAYMENT_STATUS: [
      ['PENDING', 'Pending'],
      ['PAID', 'Paid'],
      ['REFUNDED', 'Refunded']
    ]
  };
}


function seedPilotReferenceData_() {
  const sheet = BaseRepository.getSheet(
    CONFIG.SHEETS.REFERENCE_DATA
  );

  const headers = BaseRepository.getHeaders(
    CONFIG.SHEETS.REFERENCE_DATA
  );

  const required = ['category', 'code', 'label', 'active'];

  if (
    headers.length !== required.length ||
    !required.every((header, index) => headers[index] === header)
  ) {
    throw new Error(
      'Unexpected ReferenceData schema. Expected: ' +
      required.join(' | ')
    );
  }

  const existing = BaseRepository.findAll(
    CONFIG.SHEETS.REFERENCE_DATA
  );

  const existingKeys = new Set(
    existing.map(row =>
      String(row.category || '').trim().toUpperCase() +
      '|' +
      String(row.code || '').trim().toUpperCase()
    )
  );

  const seed = getPilotReferenceSeed_();
  const rows = [];

  Object.keys(seed).forEach(category => {
    seed[category].forEach(item => {
      const code = item[0];
      const label = item[1];
      const key = category + '|' + code;

      if (!existingKeys.has(key)) {
        rows.push([
          category,
          code,
          label,
          true
        ]);
        existingKeys.add(key);
      }
    });
  });

  if (rows.length > 0) {
    const startRow = Math.max(sheet.getLastRow() + 1, 2);

    sheet
      .getRange(startRow, 1, rows.length, required.length)
      .setValues(rows);
  }

  return rows.length;
}
