/**

 * ============================================================

 * 20_IntegrityCheckService.gs

 * RENTAL OPERATIONS MVP

 * PHASE 1 + PHASE 2 + PHASE 3 + PHASE 4 + PHASE 5

 * ============================================================

 *

 * Validates:

 *

 * FOUNDATION

 * - Required sheets

 * - Required headers

 * - Reference data

 * - Missing IDs

 * - Duplicate IDs

 * - ID formats

 * - ID sequences

 *

 * MASTER DATA

 * - Properties

 * - Units

 * - Customers

 * - Staff

 * - Operational status

 *

 * PHASE 2

 * - External calendar events

 * - OTA blocks

 * - Calendar feed configuration

 * - Calendar/reservation overlaps

 *

 * PHASE 3

 * - Reservations

 * - Reservation -> Unit

 * - Reservation -> Customer

 * - Reservation status/source/date validity

 * - ReservationGuest relationships

 * - Guest FK integrity

 * - Duplicate reservation/guest relationships

 * - Primary guest integrity

 * - OTA Block -> Reservation relationships

 * - OTA block reservation/unit/date consistency

 *

 * ============================================================

 */

const IntegrityCheckService = (() => {
  /**

   * ----------------------------------------------------------

   * GENERIC HELPERS

   * ----------------------------------------------------------

   */

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function normalize(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value)
      .trim()

      .toUpperCase();
  }

  function normalizeText(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  function addFinding(
    findings,

    severity,

    check,

    message,

    details,
  ) {
    findings.push({
      severity: normalize(severity),

      check: check,

      message: message,

      details: details || null,
    });
  }

  function addError(
    findings,

    check,

    message,

    details,
  ) {
    addFinding(
      findings,

      "ERROR",

      check,

      message,

      details,
    );
  }

  function addWarning(
    findings,

    check,

    message,

    details,
  ) {
    addFinding(
      findings,

      "WARNING",

      check,

      message,

      details,
    );
  }

  function addInfo(
    findings,

    check,

    message,

    details,
  ) {
    addFinding(
      findings,

      "INFO",

      check,

      message,

      details,
    );
  }

  function getSheetHeaders(sheetName) {
    return BaseRepository.getHeaders(sheetName);
  }

  function sheetHasHeader(
    sheetName,

    header,
  ) {
    return getSheetHeaders(sheetName).includes(header);
  }

  function safeFindAll(sheetName) {
    try {
      return BaseRepository.findAll(sheetName);
    } catch (err) {
      return [];
    }
  }

  /**

   * ----------------------------------------------------------

   * REQUIRED SHEETS

   * ----------------------------------------------------------

   */

  function getRequiredSheets() {
    return [
      CONFIG.SHEETS.REFERENCE_DATA,

      CONFIG.SHEETS.PROPERTIES,

      CONFIG.SHEETS.UNITS,

      CONFIG.SHEETS.LOCATIONS,

      CONFIG.SHEETS.CUSTOMERS,

      CONFIG.SHEETS.GUESTS,

      CONFIG.SHEETS.RESERVATIONS,

      CONFIG.SHEETS.RESERVATION_GUESTS,

      CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS,

      CONFIG.SHEETS.OTA_BLOCKS,

      CONFIG.SHEETS.STAFF,

      CONFIG.SHEETS.HOUSEKEEPING_TASKS,

      CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES,
      CONFIG.SHEETS.MAINTENANCE_ASSETS,
      CONFIG.SHEETS.MAINTENANCE_SCHEDULES,
      CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,
      CONFIG.SHEETS.INSPECTIONS,
      CONFIG.SHEETS.INSPECTION_CHECKLIST,

      CONFIG.SHEETS.INVENTORY_ITEMS,
      CONFIG.SHEETS.INVENTORY_LOCATIONS,
      CONFIG.SHEETS.INVENTORY_STOCK,
      CONFIG.SHEETS.INVENTORY_TRANSACTIONS,

      // Phase 5 - Finance
      CONFIG.SHEETS.UTILITIES,
      CONFIG.SHEETS.UTILITY_BILLS,
      CONFIG.SHEETS.INTERNET_SERVICES,
      CONFIG.SHEETS.OPERATING_EXPENSES,

      CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS,

      CONFIG.SHEETS.AUDIT_LOG,
    ];
  }

  function checkRequiredSheets(findings) {
    const spreadsheet = BaseRepository.getSpreadsheet();

    const existing = new Set(
      spreadsheet

        .getSheets()

        .map((sheet) => sheet.getName()),
    );

    getRequiredSheets().forEach((sheetName) => {
      if (!existing.has(sheetName)) {
        addError(
          findings,

          "REQUIRED_SHEET",

          "Missing required sheet: " + sheetName,
        );
      }
    });

    addInfo(
      findings,

      "REQUIRED_SHEET",

      "Required sheet check completed.",
    );
  }

  /**

   * ----------------------------------------------------------

   * REQUIRED HEADERS

   * ----------------------------------------------------------

   */

  function getRequiredHeaders() {
    return {
      [CONFIG.SHEETS.PROPERTIES]: [
        "property_id",

        "property_code",

        "name",

        "property_type",

        "location_id",

        "status",
      ],

      [CONFIG.SHEETS.UNITS]: [
        "unit_id",

        "property_id",

        "unit_code",

        "unit_name",

        "unit_type",

        "status",
      ],

      [CONFIG.SHEETS.CUSTOMERS]: ["customer_id"],

      [CONFIG.SHEETS.GUESTS]: ["guest_id"],

      [CONFIG.SHEETS.STAFF]: [
        "staff_id",

        "name",

        "role",

        "property_id",

        "status",
      ],

      [CONFIG.SHEETS.HOUSEKEEPING_TASKS]: [
        "task_id",

        "unit_id",

        "reservation_id",

        "task_type",

        "priority",

        "scheduled_date",

        "scheduled_start",

        "scheduled_end",

        "assigned_to",

        "status",

        "started_at",

        "completed_at",

        "inspection_required",

        "notes",
      ],

      [CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES]: [
        "schedule_id",

        "unit_id",

        "task_type",

        "frequency",

        "interval_value",

        "day_of_week",

        "day_of_month",

        "last_completed",

        "next_due",

        "assigned_to",

        "active",
      ],

      [CONFIG.SHEETS.MAINTENANCE_ASSETS]: [
        "asset_id",
        "unit_id",
        "asset_type",
        "name",
        "brand",
        "model",
        "serial_number",
        "purchase_date",
        "warranty_until",
        "expected_life_years",
        "status",
      ],

      [CONFIG.SHEETS.MAINTENANCE_SCHEDULES]: [
        "schedule_id",
        "asset_id",
        "maintenance_type",
        "frequency",
        "interval_value",
        "last_completed",
        "next_due",
        "assigned_to",
        "estimated_duration",
        "estimated_cost",
        "active",
      ],

      [CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS]: [
        "work_order_id",
        "unit_id",
        "asset_id",
        "reservation_id",
        "source",
        "issue_type",
        "description",
        "priority",
        "assigned_to",
        "scheduled_date",
        "status",
        "started_at",
        "completed_at",
        "cost",
        "resolution",
      ],

      [CONFIG.SHEETS.INSPECTIONS]: [
        "inspection_id",
        "unit_id",
        "reservation_id",
        "inspection_type",
        "scheduled_at",
        "inspector_id",
        "status",
        "cleanliness_score",
        "maintenance_score",
        "overall_result",
        "notes",
      ],

      [CONFIG.SHEETS.INSPECTION_CHECKLIST]: [
        "checklist_item_id",
        "inspection_id",
        "category",
        "item",
        "result",
        "notes",
      ],

      [CONFIG.SHEETS.INVENTORY_ITEMS]: [
        "item_id",
        "item_code",
        "name",
        "category",
        "unit_of_measure",
        "item_type",
        "reorder_level",
        "target_stock_level",
        "unit_cost",
        "preferred_vendor_id",
        "active",
        "notes",
        "created_at",
        "updated_at",
      ],

      [CONFIG.SHEETS.INVENTORY_LOCATIONS]: [
        "location_id",
        "property_id",
        "unit_id",
        "name",
        "location_type",
        "active",
        "notes",
        "created_at",
        "updated_at",
      ],

      [CONFIG.SHEETS.INVENTORY_STOCK]: [
        "stock_id",
        "item_id",
        "location_id",
        "quantity_on_hand",
        "reserved_quantity",
        "minimum_quantity",
        "maximum_quantity",
        "last_counted_at",
        "updated_at",
      ],

      [CONFIG.SHEETS.INVENTORY_TRANSACTIONS]: [
        "transaction_id",
        "item_id",
        "transaction_type",
        "quantity",
        "from_location_id",
        "to_location_id",
        "unit_id",
        "reservation_id",
        "housekeeping_task_id",
        "maintenance_work_order_id",
        "reference_type",
        "reference_id",
        "unit_cost",
        "notes",
        "performed_by",
        "transaction_at",
      ],

      [CONFIG.SHEETS.UNIT_OPERATIONAL_STATUS]: [
        "unit_id",

        "operational_status",
      ],

      [CONFIG.SHEETS.RESERVATIONS]: [
        "reservation_id",

        "unit_id",

        "customer_id",

        "booking_source",

        "check_in_date",

        "check_out_date",

        "status",
      ],

      [CONFIG.SHEETS.RESERVATION_GUESTS]: [
        "reservation_guest_id",

        "reservation_id",

        "guest_id",

        "role",
      ],

      [CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS]: [
        "external_event_id",

        "unit_id",

        "source",

        "external_uid",

        "start_date",

        "end_date",

        "status",
      ],

      [CONFIG.SHEETS.OTA_BLOCKS]: [
        "ota_block_id",

        "reservation_id",

        "unit_id",

        "source",

        "start_date",

        "end_date",

        "status",
      ],

      [CONFIG.SHEETS.UTILITIES]: [
        "utility_id",
        "property_id",
        "unit_id",
        "utility_type",
        "provider",
        "account_number",
        "meter_number",
        "billing_frequency",
        "currency",
        "status",
      ],

      [CONFIG.SHEETS.UTILITY_BILLS]: [
        "bill_id",
        "utility_id",
        "billing_period_start",
        "billing_period_end",
        "bill_date",
        "due_date",
        "amount",
        "tax_amount",
        "total_amount",
        "payment_status",
        "paid_date",
        "notes",
      ],

      [CONFIG.SHEETS.INTERNET_SERVICES]: [
        "internet_service_id",
        "property_id",
        "unit_id",
        "provider",
        "account_number",
        "package_name",
        "monthly_fee",
        "installation_fee",
        "billing_cycle",
        "contract_start",
        "contract_end",
        "status",
      ],

      [CONFIG.SHEETS.OPERATING_EXPENSES]: [
        "expense_id",
        "property_id",
        "unit_id",
        "reservation_id",
        "expense_date",
        "category",
        "description",
        "amount",
        "currency",
        "payment_method",
        "vendor",
        "receipt_url",
        "notes",
      ],

      [CONFIG.SHEETS.AUDIT_LOG]: ["audit_id"],
    };
  }

  function checkRequiredHeaders(findings) {
    const requirements = getRequiredHeaders();

    Object.keys(requirements)

      .forEach((sheetName) => {
        let headers;

        try {
          headers = getSheetHeaders(sheetName);
        } catch (err) {
          return;
        }

        requirements[sheetName].forEach((header) => {
          if (!headers.includes(header)) {
            addError(
              findings,

              "REQUIRED_HEADER",

              'Missing required header "' + header + '" in ' + sheetName,
            );
          }
        });
      });

    addInfo(
      findings,

      "REQUIRED_HEADER",

      "Required header check completed.",
    );
  }

  /**

   * ----------------------------------------------------------

   * REFERENCE DATA

   * ----------------------------------------------------------

   */

  function checkReferenceCategories(findings) {
    const categories = [
      "PROPERTY_TYPE",

      "UNIT_TYPE",

      "UNIT_STATUS",

      "STAFF_ROLE",

      "OPERATIONAL_STATUS",

      "RESERVATION_STATUS",

      "BOOKING_SOURCE",

      "INVENTORY_ITEM_TYPE",

      "INVENTORY_CATEGORY",

      "INVENTORY_LOCATION_TYPE",

      "INVENTORY_TRANSACTION_TYPE",

      "INVENTORY_UOM",
      "EXPENSE_CATEGORY",
      "CURRENCY",
      "PAYMENT_METHOD",
      "UTILITY_TYPE",
      "FREQUENCY",
      "PAYMENT_STATUS",
    ];

    categories.forEach((category) => {
      try {
        const values = ValidationService.getReferenceValues(category);

        if (!values || values.length === 0) {
          addError(
            findings,

            "REFERENCE_DATA",

            "Reference category has no active values: " + category,
          );
        } else {
          addInfo(
            findings,

            "REFERENCE_DATA",

            category + ": " + values.length + " active value(s).",
          );
        }
      } catch (err) {
        addError(
          findings,

          "REFERENCE_DATA",

          "Unable to read reference category " + category + ": " + err.message,
        );
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * ID DEFINITIONS

   * ----------------------------------------------------------

   */

  function getIdEntities() {
    return [
      {
        entity_type: "PROPERTY",

        sheet: CONFIG.SHEETS.PROPERTIES,

        id_field: "property_id",
      },

      {
        entity_type: "UNIT",

        sheet: CONFIG.SHEETS.UNITS,

        id_field: "unit_id",
      },

      {
        entity_type: "LOCATION",

        sheet: CONFIG.SHEETS.LOCATIONS,

        id_field: "location_id",
      },

      {
        entity_type: "CUSTOMER",

        sheet: CONFIG.SHEETS.CUSTOMERS,

        id_field: "customer_id",
      },

      {
        entity_type: "GUEST",

        sheet: CONFIG.SHEETS.GUESTS,

        id_field: "guest_id",
      },

      {
        entity_type: "STAFF",

        sheet: CONFIG.SHEETS.STAFF,

        id_field: "staff_id",
      },

      {
        entity_type: "HOUSEKEEPING_TASK",

        sheet: CONFIG.SHEETS.HOUSEKEEPING_TASKS,

        id_field: "task_id",
      },

      {
        entity_type: "HOUSEKEEPING_SCHEDULE",

        sheet: CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES,

        id_field: "schedule_id",
      },
      {
        entity_type: "MAINTENANCE_ASSET",

        sheet: CONFIG.SHEETS.MAINTENANCE_ASSETS,

        id_field: "asset_id",
      },

      {
        entity_type: "MAINTENANCE_SCHEDULE",

        sheet: CONFIG.SHEETS.MAINTENANCE_SCHEDULES,

        id_field: "schedule_id",
      },

      {
        entity_type: "MAINTENANCE_WORK_ORDER",

        sheet: CONFIG.SHEETS.MAINTENANCE_WORK_ORDERS,

        id_field: "work_order_id",
      },

      {
        entity_type: "INSPECTION",

        sheet: CONFIG.SHEETS.INSPECTIONS,

        id_field: "inspection_id",
      },

      {
        entity_type: "INSPECTION_CHECKLIST_ITEM",

        sheet: CONFIG.SHEETS.INSPECTION_CHECKLIST,

        id_field: "checklist_item_id",
      },

      {
        entity_type: "INVENTORY_ITEM",

        sheet: CONFIG.SHEETS.INVENTORY_ITEMS,

        id_field: "item_id",
      },

      {
        entity_type: "INVENTORY_LOCATION",

        sheet: CONFIG.SHEETS.INVENTORY_LOCATIONS,

        id_field: "location_id",
      },

      {
        entity_type: "INVENTORY_STOCK",

        sheet: CONFIG.SHEETS.INVENTORY_STOCK,

        id_field: "stock_id",
      },

      {
        entity_type: "INVENTORY_TRANSACTION",

        sheet: CONFIG.SHEETS.INVENTORY_TRANSACTIONS,

        id_field: "transaction_id",
      },

      {
        entity_type: "OPERATING_EXPENSE",
        sheet: CONFIG.SHEETS.OPERATING_EXPENSES,
        id_field: "expense_id",
      },
      {
        entity_type: "UTILITY",
        sheet: CONFIG.SHEETS.UTILITIES,
        id_field: "utility_id",
      },
      {
        entity_type: "UTILITY_BILL",
        sheet: CONFIG.SHEETS.UTILITY_BILLS,
        id_field: "bill_id",
      },
      {
        entity_type: "INTERNET_SERVICE",
        sheet: CONFIG.SHEETS.INTERNET_SERVICES,
        id_field: "internet_service_id",
      },

      {
        entity_type: "RESERVATION",

        sheet: CONFIG.SHEETS.RESERVATIONS,

        id_field: "reservation_id",
      },

      {
        entity_type: "RESERVATION_GUEST",

        sheet: CONFIG.SHEETS.RESERVATION_GUESTS,

        id_field: "reservation_guest_id",
      },

      {
        entity_type: "EXTERNAL_CALENDAR_EVENT",

        sheet: CONFIG.SHEETS.EXTERNAL_CALENDAR_EVENTS,

        id_field: "external_event_id",
      },

      {
        entity_type: "OTA_BLOCK",

        sheet: CONFIG.SHEETS.OTA_BLOCKS,

        id_field: "ota_block_id",
      },

      {
        entity_type: "AUDIT",

        sheet: CONFIG.SHEETS.AUDIT_LOG,

        id_field: "audit_id",
      },
    ];
  }

  function checkMissingIds(findings) {
    getIdEntities().forEach((entity) => {
      const rows = safeFindAll(entity.sheet);

      rows.forEach((row, index) => {
        if (isBlank(row[entity.id_field])) {
          addError(
            findings,

            "MISSING_ID",

            entity.sheet + " row " + (index + 2) + " has no " + entity.id_field,
          );
        }
      });
    });
  }

  function checkDuplicateIds(findings) {
    getIdEntities().forEach((entity) => {
      const seen = new Set();

      safeFindAll(entity.sheet).forEach((row) => {
        const id = normalizeText(row[entity.id_field]);

        if (!id) {
          return;
        }

        if (seen.has(id)) {
          addError(
            findings,

            "DUPLICATE_ID",

            "Duplicate ID " + id + " in " + entity.sheet,
          );
        }

        seen.add(id);
      });
    });
  }

  function checkIdFormats(findings) {
    getIdEntities().forEach((entity) => {
      let prefix;

      try {
        prefix = CONFIG.ID_PREFIXES[entity.entity_type];
      } catch (err) {
        prefix = null;
      }

      if (!prefix) {
        return;
      }

      const regex = new RegExp(
        "^" + prefix + "-\\\d{" + CONFIG.ID.PADDING + "}$",
      );

      safeFindAll(entity.sheet).forEach((row) => {
        const id = normalizeText(row[entity.id_field]);

        if (id && !regex.test(id)) {
          addError(
            findings,

            "ID_FORMAT",

            "Invalid ID format: " + id + " in " + entity.sheet,
          );
        }
      });
    });
  }

  function checkIdSequences(findings) {
    getIdEntities().forEach((entity) => {
      try {
        const status = IdService.getSequenceStatus(
          entity.entity_type,

          entity.sheet,

          entity.id_field,
        );

        if (!status.valid) {
          addError(
            findings,

            "ID_SEQUENCE",

            entity.entity_type + " sequence is behind sheet data.",

            status,
          );
        } else {
          addInfo(
            findings,

            "ID_SEQUENCE",

            entity.entity_type + " sequence valid.",

            status,
          );
        }
      } catch (err) {
        addError(
          findings,

          "ID_SEQUENCE",

          "Unable to validate sequence for " +
            entity.entity_type +
            ": " +
            err.message,
        );
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * PROPERTY INTEGRITY

   * ----------------------------------------------------------

   */

  function checkProperties(findings) {
    safeFindAll(CONFIG.SHEETS.PROPERTIES).forEach((property) => {
      try {
        ValidationService.validateReference(
          "PROPERTY_TYPE",

          property.property_type,
        );
      } catch (err) {
        addError(
          findings,

          "PROPERTY",

          property.property_id + ": " + err.message,
        );
      }

      try {
        ValidationService.validateActiveInactiveStatus(property.status);
      } catch (err) {
        addError(
          findings,

          "PROPERTY",

          property.property_id + ": " + err.message,
        );
      }

      if (!isBlank(property.location_id)) {
        try {
          ValidationService.validateLocationExists(property.location_id);
        } catch (err) {
          addError(
            findings,

            "PROPERTY",

            property.property_id + ": " + err.message,
          );
        }
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * UNIT INTEGRITY

   * ----------------------------------------------------------

   */

  function checkUnits(findings) {
    safeFindAll(CONFIG.SHEETS.UNITS).forEach((unit) => {
      try {
        ValidationService.validatePropertyExists(unit.property_id);
      } catch (err) {
        addError(
          findings,

          "UNIT",

          unit.unit_id + ": " + err.message,
        );
      }

      try {
        ValidationService.validateReference(
          "UNIT_TYPE",

          unit.unit_type,
        );
      } catch (err) {
        addError(
          findings,

          "UNIT",

          unit.unit_id + ": " + err.message,
        );
      }

      try {
        ValidationService.validateReference(
          "UNIT_STATUS",

          unit.status,
        );
      } catch (err) {
        addError(
          findings,

          "UNIT",

          unit.unit_id + ": " + err.message,
        );
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * CUSTOMER INTEGRITY

   * ----------------------------------------------------------

   */

  function checkCustomers(findings) {
    const customers = safeFindAll(CONFIG.SHEETS.CUSTOMERS);

    const emails = new Set();

    const phones = new Set();

    customers.forEach((customer) => {
      const email = normalizeText(customer.email).toLowerCase();

      const phone = normalizeText(customer.phone);

      if (email) {
        if (emails.has(email)) {
          addError(
            findings,

            "CUSTOMER",

            "Duplicate customer email: " + email,
          );
        }

        emails.add(email);
      }

      if (phone) {
        if (phones.has(phone)) {
          addError(
            findings,

            "CUSTOMER",

            "Duplicate customer phone: " + phone,
          );
        }

        phones.add(phone);
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * STAFF INTEGRITY

   * ----------------------------------------------------------

   */

  function checkStaff(findings) {
    safeFindAll(CONFIG.SHEETS.STAFF).forEach((staff) => {
      try {
        ValidationService.validatePropertyExists(staff.property_id);
      } catch (err) {
        addError(
          findings,

          "STAFF",

          staff.staff_id + ": " + err.message,
        );
      }

      try {
        ValidationService.validateReference(
          "STAFF_ROLE",

          staff.role,
        );
      } catch (err) {
        addError(
          findings,

          "STAFF",

          staff.staff_id + ": " + err.message,
        );
      }
    });
  }

  /**

   * ----------------------------------------------------------

   * OPERATIONAL STATUS

   * ----------------------------------------------------------

   */

  function checkOperationalStatuses(findings) {
    try {
      OperationalStatusService.findUnitsWithoutStatus()

        .forEach((unit) => {
          addError(
            findings,

            "OPERATIONAL_STATUS",

            "Unit has no operational status: " + unit.unit_id,
          );
        });

      OperationalStatusService.findOrphanStatuses()

        .forEach((status) => {
          addError(
            findings,

            "OPERATIONAL_STATUS",

            "Operational status references missing unit: " + status.unit_id,
          );
        });

      OperationalStatusService.findDuplicateStatuses()

        .forEach((item) => {
          addError(
            findings,

            "OPERATIONAL_STATUS",

            "Multiple operational status rows for unit: " +
              (item.unit_id || JSON.stringify(item)),

            item,
          );
        });

      OperationalStatusService.findInvalidStatuses()

        .forEach((status) => {
          addError(
            findings,

            "OPERATIONAL_STATUS",

            "Invalid operational status for unit " +
              status.unit_id +
              ": " +
              status.operational_status,
          );
        });
    } catch (err) {
      addError(
        findings,

        "OPERATIONAL_STATUS",

        err.message,
      );
    }
  }

  /**

   * ----------------------------------------------------------

   * EXTERNAL CALENDAR EVENTS

   * ----------------------------------------------------------

   */

  function checkExternalCalendarEvents(findings) {
    try {
      ExternalCalendarService.findOrphanEvents()

        .forEach((event) => {
          addError(
            findings,

            "EXTERNAL_CALENDAR",

            "External event references missing unit: " +
              event.external_event_id,

            event,
          );
        });

      ExternalCalendarService.findDuplicateEvents()

        .forEach((event) => {
          addError(
            findings,

            "EXTERNAL_CALENDAR",

            "Duplicate external calendar event detected.",

            event,
          );
        });

      ExternalCalendarService.findInvalidDateRanges()

        .forEach((event) => {
          addError(
            findings,

            "EXTERNAL_CALENDAR",

            "Invalid external event date range: " + event.external_event_id,

            event,
          );
        });

      ExternalCalendarService.findInvalidStatuses()

        .forEach((event) => {
          addError(
            findings,

            "EXTERNAL_CALENDAR",

            "Invalid external event status: " + event.external_event_id,

            event,
          );
        });

      ExternalCalendarService.findMissingNaturalKeys()

        .forEach((event) => {
          addError(
            findings,

            "EXTERNAL_CALENDAR",

            "External event missing natural key fields.",

            event,
          );
        });
    } catch (err) {
      addError(
        findings,

        "EXTERNAL_CALENDAR",

        err.message,
      );
    }
  }

  /**

   * ----------------------------------------------------------

   * RESERVATIONS

   * ----------------------------------------------------------

   */

  function checkReservations(findings) {
    const reservations = safeFindAll(CONFIG.SHEETS.RESERVATIONS);

    reservations.forEach((reservation) => {
      const id = reservation.reservation_id;

      /*

         * Unit FK

         */

      try {
        ValidationService.validateUnitExists(reservation.unit_id);
      } catch (err) {
        addError(
          findings,

          "RESERVATION",

          id + ": " + err.message,
        );
      }

      /*

         * Customer FK

         */

      if (!isBlank(reservation.customer_id)) {
        try {
          ValidationService.validateCustomerExists(reservation.customer_id);
        } catch (err) {
          addError(
            findings,

            "RESERVATION",

            id + ": " + err.message,
          );
        }
      }

      /*

         * Booking source

         */

      try {
        ValidationService.validateReference(
          "BOOKING_SOURCE",

          reservation.booking_source,
        );
      } catch (err) {
        addError(
          findings,

          "RESERVATION",

          id + ": invalid booking source " + reservation.booking_source,
        );
      }

      /*

         * Reservation status

         */

      try {
        ValidationService.validateReference(
          "RESERVATION_STATUS",

          reservation.status,
        );
      } catch (err) {
        addError(
          findings,

          "RESERVATION",

          id + ": invalid reservation status " + reservation.status,
        );
      }

      /*

         * Date range

         */

      try {
        AvailabilityService.validateDateRange(
          reservation.check_in_date,

          reservation.check_out_date,
        );
      } catch (err) {
        addError(
          findings,

          "RESERVATION",

          id + ": invalid reservation date range.",

          {
            check_in_date: reservation.check_in_date,

            check_out_date: reservation.check_out_date,
          },
        );
      }
    });

    addInfo(
      findings,

      "RESERVATION",

      reservations.length + " reservation(s) checked.",
    );
  }

  /**

   * ----------------------------------------------------------

   * RESERVATION GUESTS - PHASE 3

   * ----------------------------------------------------------

   */

  function checkReservationGuests(findings) {
    let assignments;

    try {
      assignments = ReservationGuestService.getAll();
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to read reservation guest relationships: " + err.message,
      );

      return;
    }

    /*

     * Orphan reservation references.

     */

    try {
      ReservationGuestService.findOrphanReservationLinks()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Reservation guest relationship references missing reservation: " +
              record.reservation_id,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check reservation guest reservation references: " +
          err.message,
      );
    }

    /*

     * Orphan guest references.

     */

    try {
      ReservationGuestService.findOrphanGuestLinks()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Reservation guest relationship references missing guest: " +
              record.guest_id,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check reservation guest guest references: " + err.message,
      );
    }

    /*

     * Duplicate natural keys.

     */

    try {
      ReservationGuestService.findDuplicateAssignments()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Duplicate reservation/guest assignment: " + record.key,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check duplicate reservation guest assignments: " +
          err.message,
      );
    }

    try {
      ReservationGuestService.findInvalidRoles()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Invalid reservation guest role: " +
              record.reservation_guest_id +
              " / " +
              record.role,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check reservation guest roles: " + err.message,
      );
    }

    /*

     * Multiple primary guests.

     */

    try {
      ReservationGuestService.findReservationsWithMultiplePrimaryGuests()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Reservation has multiple primary guests: " + record.reservation_id,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check multiple primary guests: " + err.message,
      );
    }

    /*

     * A reservation that has guest assignments should have

     * exactly one primary guest.

     */

    try {
      ReservationGuestService.findReservationsWithoutPrimaryGuest()

        .forEach((record) => {
          addError(
            findings,

            "RESERVATION_GUEST",

            "Reservation has guests but no primary guest: " +
              record.reservation_id,

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "RESERVATION_GUEST",

        "Unable to check primary guest integrity: " + err.message,
      );
    }

    addInfo(
      findings,

      "RESERVATION_GUEST",

      assignments.length + " reservation guest relationship(s) checked.",
    );
  }

  /**

   * ----------------------------------------------------------

   * OTA BLOCKS - PHASE 2 + PHASE 3

   * ----------------------------------------------------------

   */

  function checkOTABlocks(findings) {
    let blocks;

    try {
      blocks = OTABlockService.getAll();
    } catch (err) {
      /*

       * Fallback allows integrity checking before service

       * initialization problems are resolved.

       */

      blocks = safeFindAll(CONFIG.SHEETS.OTA_BLOCKS);
    }

    /*

     * Basic status validation.

     */

    blocks.forEach((block) => {
      const status = normalize(block.status);

      if (!["PENDING", "BLOCKED", "CANCELLED"].includes(status)) {
        addError(
          findings,

          "OTA_BLOCK",

          "Invalid OTA block status: " +
            block.ota_block_id +
            " / " +
            block.status,
        );
      }

      /*

       * Unit FK

       */

      try {
        ValidationService.validateUnitExists(block.unit_id);
      } catch (err) {
        addError(
          findings,

          "OTA_BLOCK",

          block.ota_block_id + ": " + err.message,
        );
      }

      /*

       * Date range

       */

      try {
        AvailabilityService.validateDateRange(
          block.start_date,

          block.end_date,
        );
      } catch (err) {
        addError(
          findings,

          "OTA_BLOCK",

          block.ota_block_id + ": invalid date range.",

          block,
        );
      }
    });

    /*

     * Phase 3 reservation relationship.

     */

    try {
      OTABlockService.findOrphanReservationLinks()

        .forEach((block) => {
          addError(
            findings,

            "OTA_BLOCK",

            "OTA block references missing reservation: " +
              block.ota_block_id +
              " -> " +
              block.reservation_id,

            block,
          );
        });
    } catch (err) {
      addError(
        findings,

        "OTA_BLOCK",

        "Unable to check OTA block reservation relationships: " + err.message,
      );
    }

    /*

     * Duplicate blocking records.

     */

    try {
      OTABlockService.findDuplicateBlockingBlocks()

        .forEach((block) => {
          addError(
            findings,

            "OTA_BLOCK",

            "Duplicate active OTA block relationship detected.",

            block,
          );
        });
    } catch (err) {
      addError(
        findings,

        "OTA_BLOCK",

        "Unable to check duplicate OTA blocks: " + err.message,
      );
    }

    /*

     * Reservation-linked OTA block consistency.

     */

    blocks.forEach((block) => {
      if (isBlank(block.reservation_id)) {
        /*

         * Existing Phase 2 records may predate the

         * reservation_id relationship.

         */

        return;
      }

      const reservation = ReservationService.getById(block.reservation_id);

      if (!reservation) {
        return;
      }

      /*

       * Unit must match reservation.

       */

      if (normalizeText(block.unit_id) !== normalizeText(reservation.unit_id)) {
        addError(
          findings,

          "OTA_BLOCK",

          "OTA block unit does not match reservation unit: " +
            block.ota_block_id,

          {
            ota_block_unit: block.unit_id,

            reservation_unit: reservation.unit_id,

            reservation_id: reservation.reservation_id,
          },
        );
      }

      /*

       * Dates must match reservation.

       */

      if (
        String(block.start_date) !== String(reservation.check_in_date) ||
        String(block.end_date) !== String(reservation.check_out_date)
      ) {
        addError(
          findings,

          "OTA_BLOCK",

          "OTA block dates do not match reservation dates: " +
            block.ota_block_id,

          {
            ota_block_start: block.start_date,

            ota_block_end: block.end_date,

            reservation_start: reservation.check_in_date,

            reservation_end: reservation.check_out_date,
          },
        );
      }

      /*

       * DIRECT is the Phase 3 workflow that generates

       * reservation-linked OTA blocks.

       */

      if (normalize(reservation.booking_source) !== "DIRECT") {
        addWarning(
          findings,

          "OTA_BLOCK",

          "Reservation-linked OTA block belongs to a non-DIRECT reservation: " +
            block.ota_block_id,

          {
            reservation_id: reservation.reservation_id,

            booking_source: reservation.booking_source,
          },
        );
      }

      /*

       * Terminal reservation should not retain a blocking

       * OTA workflow record.

       */

      if (
        ReservationService.isTerminalStatus(reservation.status) &&
        OTABlockService.isBlockingStatus(block.status)
      ) {
        addError(
          findings,

          "OTA_BLOCK",

          "Terminal reservation still has blocking OTA record: " +
            block.ota_block_id,

          {
            reservation_id: reservation.reservation_id,

            reservation_status: reservation.status,

            ota_block_status: block.status,
          },
        );
      }
    });

    addInfo(
      findings,

      "OTA_BLOCK",

      blocks.length + " OTA block(s) checked.",
    );
  }

  /**

   * ----------------------------------------------------------

   * CALENDAR FEED CONFIGURATION

   * ----------------------------------------------------------

   */

  function checkCalendarFeedConfiguration(findings) {
    try {
      const configuration = CalendarSyncService.getSyncConfiguration();

      addInfo(
        findings,

        "CALENDAR_CONFIGURATION",

        "Calendar synchronization configuration checked.",

        configuration,
      );
    } catch (err) {
      addError(
        findings,

        "CALENDAR_CONFIGURATION",

        err.message,
      );
    }
  }

  /**

   * ----------------------------------------------------------

   * CALENDAR CONFLICTS

   * ----------------------------------------------------------

   *

   * Reservation vs external-calendar overlap is a WARNING.

   *

   * This can legitimately represent the same OTA booking in:

   *

   *   09_Reservations

   *

   * and

   *

   *   13_ExternalCalendarEvents

   *

   * ----------------------------------------------------------

   */

  function checkCalendarConflicts(findings) {
    const reservations = safeFindAll(CONFIG.SHEETS.RESERVATIONS).filter(
      (reservation) => {
        try {
          return AvailabilityService.isReservationBlocking(reservation.status);
        } catch (err) {
          return false;
        }
      },
    );

    reservations.forEach((reservation) => {
      let conflicts;

      try {
        conflicts = ExternalCalendarService.getConflictingEvents(
          reservation.unit_id,

          reservation.check_in_date,

          reservation.check_out_date,
        );
      } catch (err) {
        addError(
          findings,

          "CALENDAR_CONFLICT",

          "Unable to check reservation " +
            reservation.reservation_id +
            ": " +
            err.message,
        );

        return;
      }

      conflicts.forEach((event) => {
        addWarning(
          findings,

          "CALENDAR_CONFLICT",

          "Reservation overlaps external calendar event.",

          {
            reservation_id: reservation.reservation_id,

            unit_id: reservation.unit_id,

            reservation_source: reservation.booking_source,

            reservation_start: reservation.check_in_date,

            reservation_end: reservation.check_out_date,

            external_event_id: event.external_event_id,

            external_source: event.source,

            external_start: event.start_date,

            external_end: event.end_date,
          },
        );
      });
    });
  }

  /**

   * ----------------------------------------------------------

   * AUDIT LOG

   * ----------------------------------------------------------

   */

  function checkAuditLog(findings) {
    const rows = safeFindAll(CONFIG.SHEETS.AUDIT_LOG);

    rows.forEach((row, index) => {
      if (isBlank(row.audit_id)) {
        addError(
          findings,

          "AUDIT",

          "Audit row " + (index + 2) + " has no audit_id.",
        );
      }
    });

    addInfo(
      findings,

      "AUDIT",

      rows.length + " audit record(s) checked.",
    );
  }

  /**

 * ----------------------------------------------------------

 * HOUSEKEEPING TASKS - PHASE 4

 * ----------------------------------------------------------

 */

  function checkHousekeepingTasks(findings) {
    let tasks;

    try {
      tasks = HousekeepingService.getAll();
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to read housekeeping tasks: " + err.message,
      );

      return;
    }

    /*

   * --------------------------------------------------------

   * ORPHAN UNIT REFERENCES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findOrphanUnitLinks()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Housekeeping task references missing unit: " +
              task.task_id +
              " -> " +
              task.unit_id,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to check housekeeping unit references: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * ORPHAN RESERVATION REFERENCES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findOrphanReservationLinks()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Housekeeping task references missing reservation: " +
              task.task_id +
              " -> " +
              task.reservation_id,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to check housekeeping reservation references: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * ORPHAN STAFF REFERENCES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findOrphanStaffLinks()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Housekeeping task references missing staff: " +
              task.task_id +
              " -> " +
              task.assigned_to,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to check housekeeping staff references: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID TASK TYPES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findInvalidTaskTypes()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Invalid housekeeping task type: " +
              task.task_id +
              " / " +
              task.task_type,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to validate housekeeping task types: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID PRIORITIES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findInvalidPriorities()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Invalid housekeeping priority: " +
              task.task_id +
              " / " +
              task.priority,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to validate housekeeping priorities: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID STATUSES

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findInvalidStatuses()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Invalid housekeeping status: " +
              task.task_id +
              " / " +
              task.status,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to validate housekeeping statuses: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID STAFF ASSIGNMENTS

   * --------------------------------------------------------

   *

   * Examples:

   * - inactive staff

   * - TECHNICIAN assigned to housekeeping

   */

    /*

  try {



    HousekeepingService

      .findInvalidStaffAssignments()

      .forEach(task => {



        addError(

          findings,

          'HOUSEKEEPING',

          'Invalid housekeeping staff assignment: ' +

            task.task_id +

            ' -> ' +

            task.assigned_to,

          task

        );



      });



  } catch (err) {



    addError(

      findings,

      'HOUSEKEEPING',

      'Unable to validate housekeeping staff assignments: ' +

        err.message

    );



  }

*/

    /*

 * --------------------------------------------------------

 * INVALID STAFF ASSIGNMENTS

 * --------------------------------------------------------

 *

 * Valid housekeeping assignees:

 * - ACTIVE HOUSEKEEPER

 * - ACTIVE SUPERVISOR

 *

 * Unassigned tasks are valid.

 */

    try {
      const staff = StaffService.getAllStaff();

      const staffById = new Map(
        staff.map((member) => [normalizeText(member.staff_id), member]),
      );

      tasks

        .filter((task) => {
          const staffId = normalizeText(task.assigned_to);

          /*

       * Unassigned housekeeping task is valid.

       */

          if (!staffId) {
            return false;
          }

          const member = staffById.get(staffId);

          /*

       * Missing staff is already reported by

       * findOrphanStaffLinks().

       *

       * Do not report the same problem twice.

       */

          if (!member) {
            return false;
          }

          const role = normalize(member.role);

          const status = normalize(member.status);

          return (
            status !== "ACTIVE" || !["HOUSEKEEPER", "SUPERVISOR"].includes(role)
          );
        })

        .forEach((task) => {
          const member = staffById.get(normalizeText(task.assigned_to));

          addError(
            findings,

            "HOUSEKEEPING",

            "Invalid housekeeping staff assignment: " +
              task.task_id +
              " -> " +
              task.assigned_to +
              " (role=" +
              normalize(member.role) +
              ", status=" +
              normalize(member.status) +
              ")",

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to validate housekeeping staff assignments: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * COMPLETED WITHOUT COMPLETION TIMESTAMP

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findCompletedWithoutTimestamp()

        .forEach((task) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Completed housekeeping task has no completed_at: " + task.task_id,

            task,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to validate housekeeping completion timestamps: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * IN_PROGRESS WITHOUT START TIMESTAMP

   * --------------------------------------------------------

   *

   * Do this directly because this is a persisted-state

   * invariant independent of service transitions.

   */

    tasks

      .filter((task) => {
        return (
          normalize(task.status) === "IN_PROGRESS" && isBlank(task.started_at)
        );
      })

      .forEach((task) => {
        addError(
          findings,

          "HOUSEKEEPING",

          "IN_PROGRESS housekeeping task has no started_at: " + task.task_id,

          task,
        );
      });

    /*

   * --------------------------------------------------------

   * INVALID SCHEDULED TIME RANGE

   * --------------------------------------------------------

   */

    tasks

      .filter((task) => {
        const start = normalizeText(task.scheduled_start);

        const end = normalizeText(task.scheduled_end);

        if (!start || !end) {
          return false;
        }

        return end <= start;
      })

      .forEach((task) => {
        addError(
          findings,

          "HOUSEKEEPING",

          "Invalid housekeeping scheduled time range: " +
            task.task_id +
            " (" +
            task.scheduled_start +
            " - " +
            task.scheduled_end +
            ")",

          task,
        );
      });

    /*

   * --------------------------------------------------------

   * DUPLICATE ACTIVE TASKS

   * --------------------------------------------------------

   */

    try {
      HousekeepingService.findDuplicateActiveTasks()

        .forEach((record) => {
          addError(
            findings,

            "HOUSEKEEPING",

            "Duplicate active housekeeping task detected.",

            record,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING",

        "Unable to check duplicate active housekeeping tasks: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * SUMMARY

   * --------------------------------------------------------

   */

    addInfo(
      findings,

      "HOUSEKEEPING",

      tasks.length + " housekeeping task(s) checked.",
    );
  }

  /**

 * ----------------------------------------------------------

 * HOUSEKEEPING SCHEDULE INTEGRITY

 * ----------------------------------------------------------

 */

  function checkHousekeepingSchedules(findings) {
    const schedules = safeFindAll(CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES);

    /*

   * --------------------------------------------------------

   * ORPHAN UNIT LINKS

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findOrphanUnitLinks()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Housekeeping schedule references missing unit: " +
              schedule.schedule_id +
              " -> " +
              schedule.unit_id,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule unit links: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * ORPHAN STAFF LINKS

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findOrphanStaffLinks()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Housekeeping schedule references missing staff: " +
              schedule.schedule_id +
              " -> " +
              schedule.assigned_to,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule staff links: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID STAFF ASSIGNMENTS

   * --------------------------------------------------------

   *

   * Valid:

   *

   * ACTIVE HOUSEKEEPER

   * ACTIVE SUPERVISOR

   *

   * Blank assigned_to is allowed.

   */

    try {
      HousekeepingScheduleService.findInvalidStaffAssignments()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule staff assignment: " +
              schedule.schedule_id +
              " -> " +
              schedule.assigned_to,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule staff assignments: " +
          err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID TASK TYPES

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidTaskTypes()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule task type: " +
              schedule.schedule_id +
              " -> " +
              schedule.task_type,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule task types: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID FREQUENCIES

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidFrequencies()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule frequency: " +
              schedule.schedule_id +
              " -> " +
              schedule.frequency,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule frequencies: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID INTERVAL VALUES

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidIntervals()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule interval: " +
              schedule.schedule_id +
              " -> " +
              schedule.interval_value,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule intervals: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID DAY OF WEEK

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidDaysOfWeek()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule day_of_week: " +
              schedule.schedule_id +
              " -> " +
              schedule.day_of_week,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule day_of_week: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID DAY OF MONTH

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidDaysOfMonth()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule day_of_month: " +
              schedule.schedule_id +
              " -> " +
              schedule.day_of_month,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule day_of_month: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * INVALID DATES

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findInvalidDates()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Invalid housekeeping schedule date: " + schedule.schedule_id,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule dates: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * DUPLICATE ACTIVE SCHEDULES

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findDuplicateActiveSchedules()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Duplicate active housekeeping schedule detected: " +
              schedule.schedule_id,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate duplicate housekeeping schedules: " + err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * ACTIVE SCHEDULES WITHOUT NEXT DUE

   * --------------------------------------------------------

   */

    try {
      HousekeepingScheduleService.findActiveSchedulesWithoutNextDue()

        .forEach((schedule) => {
          addError(
            findings,

            "HOUSEKEEPING_SCHEDULE",

            "Active housekeeping schedule has no next_due: " +
              schedule.schedule_id,

            schedule,
          );
        });
    } catch (err) {
      addError(
        findings,

        "HOUSEKEEPING_SCHEDULE",

        "Unable to validate housekeeping schedule next_due values: " +
          err.message,
      );
    }

    /*

   * --------------------------------------------------------

   * SUMMARY

   * --------------------------------------------------------

   */

    addInfo(
      findings,

      "HOUSEKEEPING_SCHEDULE",

      schedules.length + " housekeeping schedule(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * MAINTENANCE ASSETS - PHASE 4
   * ----------------------------------------------------------
   */

  function checkMaintenanceAssets(findings) {
    let assets;

    try {
      assets = MaintenanceService.getAssets();
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_ASSET",
        "Unable to read maintenance assets: " + err.message,
      );

      return;
    }

    /*
     * Orphan unit references.
     */

    try {
      MaintenanceService.findOrphanAssetUnitLinks().forEach((asset) => {
        addError(
          findings,
          "MAINTENANCE_ASSET",
          "Maintenance asset references missing unit: " +
            asset.asset_id +
            " -> " +
            asset.unit_id,
          asset,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_ASSET",
        "Unable to validate maintenance asset unit links: " + err.message,
      );
    }

    /*
     * Invalid statuses.
     */

    try {
      MaintenanceService.findInvalidAssetStatuses().forEach((asset) => {
        addError(
          findings,
          "MAINTENANCE_ASSET",
          "Invalid maintenance asset status: " +
            asset.asset_id +
            " / " +
            asset.status,
          asset,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_ASSET",
        "Unable to validate maintenance asset statuses: " + err.message,
      );
    }

    /*
     * Invalid dates.
     */

    try {
      MaintenanceService.findInvalidAssetDates().forEach((asset) => {
        addError(
          findings,
          "MAINTENANCE_ASSET",
          "Invalid maintenance asset date values: " + asset.asset_id,
          asset,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_ASSET",
        "Unable to validate maintenance asset dates: " + err.message,
      );
    }

    /*
     * Duplicate serial numbers.
     */

    try {
      MaintenanceService.findDuplicateAssetSerialNumbers().forEach((record) => {
        addError(
          findings,
          "MAINTENANCE_ASSET",
          "Duplicate maintenance asset serial number detected.",
          record,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_ASSET",
        "Unable to validate maintenance asset serial numbers: " + err.message,
      );
    }

    addInfo(
      findings,
      "MAINTENANCE_ASSET",
      assets.length + " maintenance asset(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * MAINTENANCE SCHEDULES - PHASE 4
   * ----------------------------------------------------------
   */

  function checkMaintenanceSchedules(findings) {
    let schedules;

    try {
      schedules = MaintenanceService.getSchedules();
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to read maintenance schedules: " + err.message,
      );

      return;
    }

    try {
      MaintenanceService.findOrphanScheduleAssetLinks().forEach((schedule) => {
        addError(
          findings,
          "MAINTENANCE_SCHEDULE",
          "Maintenance schedule references missing asset: " +
            schedule.schedule_id +
            " -> " +
            schedule.asset_id,
          schedule,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule asset links: " + err.message,
      );
    }

    try {
      MaintenanceService.findOrphanScheduleStaffLinks().forEach((schedule) => {
        addError(
          findings,
          "MAINTENANCE_SCHEDULE",
          "Maintenance schedule references missing staff: " +
            schedule.schedule_id +
            " -> " +
            schedule.assigned_to,
          schedule,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule staff links: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidScheduleStaffAssignments().forEach(
        (schedule) => {
          addError(
            findings,
            "MAINTENANCE_SCHEDULE",
            "Invalid maintenance technician assignment: " +
              schedule.schedule_id +
              " -> " +
              schedule.assigned_to,
            schedule,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule staff assignments: " +
          err.message,
      );
    }

    try {
      MaintenanceService.findInvalidScheduleFrequencies().forEach(
        (schedule) => {
          addError(
            findings,
            "MAINTENANCE_SCHEDULE",
            "Invalid maintenance schedule frequency: " +
              schedule.schedule_id +
              " / " +
              schedule.frequency,
            schedule,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule frequencies: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidScheduleIntervals().forEach((schedule) => {
        addError(
          findings,
          "MAINTENANCE_SCHEDULE",
          "Invalid maintenance schedule interval: " +
            schedule.schedule_id +
            " / " +
            schedule.interval_value,
          schedule,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule intervals: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidScheduleDates().forEach((schedule) => {
        addError(
          findings,
          "MAINTENANCE_SCHEDULE",
          "Invalid maintenance schedule dates: " + schedule.schedule_id,
          schedule,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule dates: " + err.message,
      );
    }

    try {
      MaintenanceService.findActiveSchedulesWithoutNextDue().forEach(
        (schedule) => {
          addError(
            findings,
            "MAINTENANCE_SCHEDULE",
            "Active maintenance schedule has no next_due: " +
              schedule.schedule_id,
            schedule,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate maintenance schedule next_due values: " +
          err.message,
      );
    }

    try {
      MaintenanceService.findDuplicateActiveSchedules().forEach((record) => {
        addError(
          findings,
          "MAINTENANCE_SCHEDULE",
          "Duplicate active maintenance schedule detected.",
          record,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_SCHEDULE",
        "Unable to validate duplicate maintenance schedules: " + err.message,
      );
    }

    addInfo(
      findings,
      "MAINTENANCE_SCHEDULE",
      schedules.length + " maintenance schedule(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * MAINTENANCE WORK ORDERS - PHASE 4
   * ----------------------------------------------------------
   */

  function checkMaintenanceWorkOrders(findings) {
    let workOrders;

    try {
      workOrders = MaintenanceService.getWorkOrders();
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to read maintenance work orders: " + err.message,
      );

      return;
    }

    /*
     * Foreign-key integrity.
     */

    try {
      MaintenanceService.findOrphanWorkOrderUnitLinks().forEach((workOrder) => {
        addError(
          findings,
          "MAINTENANCE_WORK_ORDER",
          "Maintenance work order references missing unit: " +
            workOrder.work_order_id +
            " -> " +
            workOrder.unit_id,
          workOrder,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order unit links: " + err.message,
      );
    }

    try {
      MaintenanceService.findOrphanWorkOrderAssetLinks().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Maintenance work order references missing asset: " +
              workOrder.work_order_id +
              " -> " +
              workOrder.asset_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order asset links: " + err.message,
      );
    }

    try {
      MaintenanceService.findWorkOrderAssetUnitMismatches().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Maintenance work order asset does not belong to work order unit: " +
              workOrder.work_order_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order asset/unit consistency: " + err.message,
      );
    }

    try {
      MaintenanceService.findOrphanWorkOrderReservationLinks().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Maintenance work order references missing reservation: " +
              workOrder.work_order_id +
              " -> " +
              workOrder.reservation_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order reservation links: " + err.message,
      );
    }

    try {
      MaintenanceService.findReservationUnitMismatches().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Maintenance work order reservation does not belong to work order unit: " +
              workOrder.work_order_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order reservation/unit consistency: " +
          err.message,
      );
    }

    try {
      MaintenanceService.findOrphanWorkOrderStaffLinks().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Maintenance work order references missing staff: " +
              workOrder.work_order_id +
              " -> " +
              workOrder.assigned_to,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order staff links: " + err.message,
      );
    }

    /*
     * Technician assignment.
     */

    try {
      MaintenanceService.findInvalidWorkOrderStaffAssignments().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Invalid maintenance technician assignment: " +
              workOrder.work_order_id +
              " -> " +
              workOrder.assigned_to,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order staff assignments: " + err.message,
      );
    }

    /*
     * Domain values.
     */

    try {
      MaintenanceService.findInvalidWorkOrderSources().forEach((workOrder) => {
        addError(
          findings,
          "MAINTENANCE_WORK_ORDER",
          "Invalid maintenance work order source: " +
            workOrder.work_order_id +
            " / " +
            workOrder.source,
          workOrder,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order sources: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidWorkOrderPriorities().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Invalid maintenance work order priority: " +
              workOrder.work_order_id +
              " / " +
              workOrder.priority,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order priorities: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidWorkOrderStatuses().forEach((workOrder) => {
        addError(
          findings,
          "MAINTENANCE_WORK_ORDER",
          "Invalid maintenance work order status: " +
            workOrder.work_order_id +
            " / " +
            workOrder.status,
          workOrder,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order statuses: " + err.message,
      );
    }

    /*
     * Lifecycle timestamps/state.
     */

    try {
      MaintenanceService.findScheduledWithoutDate().forEach((workOrder) => {
        addError(
          findings,
          "MAINTENANCE_WORK_ORDER",
          "SCHEDULED maintenance work order has no scheduled_date: " +
            workOrder.work_order_id,
          workOrder,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate scheduled work order dates: " + err.message,
      );
    }

    try {
      MaintenanceService.findInProgressWithoutStartedAt().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "IN_PROGRESS maintenance work order has no started_at: " +
              workOrder.work_order_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order start timestamps: " + err.message,
      );
    }

    try {
      MaintenanceService.findCompletedWithoutTimestamp().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "COMPLETED maintenance work order has no completed_at: " +
              workOrder.work_order_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order completion timestamps: " + err.message,
      );
    }

    try {
      MaintenanceService.findCompletedWithoutResolution().forEach(
        (workOrder) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "COMPLETED maintenance work order has no resolution: " +
              workOrder.work_order_id,
            workOrder,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order resolutions: " + err.message,
      );
    }

    try {
      MaintenanceService.findInvalidWorkOrderDates().forEach((workOrder) => {
        addError(
          findings,
          "MAINTENANCE_WORK_ORDER",
          "Invalid maintenance work order date values: " +
            workOrder.work_order_id,
          workOrder,
        );
      });
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate work order dates: " + err.message,
      );
    }

    /*
     * Preventive duplicate protection.
     */

    try {
      MaintenanceService.findDuplicatePreventiveWorkOrders().forEach(
        (record) => {
          addError(
            findings,
            "MAINTENANCE_WORK_ORDER",
            "Duplicate preventive maintenance work order detected.",
            record,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "MAINTENANCE_WORK_ORDER",
        "Unable to validate duplicate preventive work orders: " + err.message,
      );
    }

    addInfo(
      findings,
      "MAINTENANCE_WORK_ORDER",
      workOrders.length + " maintenance work order(s) checked.",
    );
  }

  /**

   * ----------------------------------------------------------

   * RUN ALL

   * ----------------------------------------------------------

   */

  /**
   * ----------------------------------------------------------
   * INSPECTIONS - PHASE 4
   * ----------------------------------------------------------
   */

  function checkInspections(findings) {
    const inspections = safeFindAll(CONFIG.SHEETS.INSPECTIONS);

    const checks = [
      ["findOrphanUnitLinks", "Inspection references missing unit."],
      [
        "findOrphanReservationLinks",
        "Inspection references missing reservation.",
      ],
      [
        "findReservationUnitMismatches",
        "Inspection reservation/unit mismatch detected.",
      ],
      ["findOrphanInspectorLinks", "Inspection references missing inspector."],
      [
        "findInvalidInspectorAssignments",
        "Invalid inspection staff assignment detected.",
      ],
      ["findInvalidInspectionTypes", "Invalid inspection type detected."],
      ["findInvalidStatuses", "Invalid inspection status detected."],
      ["findInvalidScores", "Invalid inspection score detected."],
      [
        "findInvalidOverallResults",
        "Invalid inspection overall result detected.",
      ],
      [
        "findIncompleteWithResult",
        "Incomplete inspection has an overall result.",
      ],
      [
        "findInProgressWithoutInspector",
        "IN_PROGRESS inspection has no inspector.",
      ],
      [
        "findCompletedWithoutInspector",
        "COMPLETED inspection has no inspector.",
      ],
      [
        "findCompletedWithoutResult",
        "COMPLETED inspection has no overall result.",
      ],
      [
        "findCompletedWithIncompleteChecklist",
        "COMPLETED inspection has incomplete checklist items.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InspectionService[check[0]]().forEach((record) => {
          addError(findings, "INSPECTION", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INSPECTION",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    addInfo(
      findings,
      "INSPECTION",
      inspections.length + " inspection(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * INSPECTION CHECKLIST - PHASE 4
   * ----------------------------------------------------------
   */

  function checkInspectionChecklist(findings) {
    const items = safeFindAll(CONFIG.SHEETS.INSPECTION_CHECKLIST);

    const checks = [
      [
        "findOrphanChecklistInspectionLinks",
        "Inspection checklist item references missing inspection.",
      ],
      [
        "findInvalidChecklistCategories",
        "Invalid inspection checklist category detected.",
      ],
      [
        "findInvalidChecklistResults",
        "Invalid inspection checklist result detected.",
      ],
      [
        "findChecklistItemsWithoutDescription",
        "Inspection checklist item has no description.",
      ],
      [
        "findDuplicateChecklistItems",
        "Duplicate inspection checklist item detected.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InspectionService[check[0]]().forEach((record) => {
          addError(findings, "INSPECTION_CHECKLIST", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INSPECTION_CHECKLIST",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    addInfo(
      findings,
      "INSPECTION_CHECKLIST",
      items.length + " inspection checklist item(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * INVENTORY ITEMS - PHASE 4
   * ----------------------------------------------------------
   */
  function checkInventoryItems(findings) {
    const items = safeFindAll(CONFIG.SHEETS.INVENTORY_ITEMS);

    const checks = [
      ["findDuplicateItemCodes", "Duplicate inventory item_code detected."],
      ["findItemsWithoutCode", "Inventory item has no item_code."],
      ["findItemsWithoutName", "Inventory item has no name."],
      ["findInvalidItemTypes", "Invalid inventory item type detected."],
      [
        "findInvalidItemNumbers",
        "Invalid inventory item numeric value detected.",
      ],
      [
        "findOrphanPreferredVendors",
        "Inventory item references missing preferred vendor.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InventoryService[check[0]]().forEach((record) => {
          addError(findings, "INVENTORY_ITEM", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INVENTORY_ITEM",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    addInfo(
      findings,
      "INVENTORY_ITEM",
      items.length + " inventory item(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * INVENTORY LOCATIONS - PHASE 4
   * ----------------------------------------------------------
   */
  function checkInventoryLocations(findings) {
    const locations = safeFindAll(CONFIG.SHEETS.INVENTORY_LOCATIONS);

    const checks = [
      [
        "findOrphanLocationProperties",
        "Inventory location references missing property.",
      ],
      [
        "findOrphanLocationUnits",
        "Inventory location references missing unit.",
      ],
      [
        "findLocationPropertyUnitMismatches",
        "Inventory location property/unit mismatch detected.",
      ],
      ["findInvalidLocationTypes", "Invalid inventory location type detected."],
      [
        "findInvalidUnitLocationLinks",
        "Invalid inventory UNIT-location linkage detected.",
      ],
      [
        "findDuplicateUnitLocations",
        "Duplicate UNIT inventory location detected.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InventoryService[check[0]]().forEach((record) => {
          addError(findings, "INVENTORY_LOCATION", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INVENTORY_LOCATION",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    addInfo(
      findings,
      "INVENTORY_LOCATION",
      locations.length + " inventory location(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * INVENTORY STOCK - PHASE 4
   * ----------------------------------------------------------
   */
  function checkInventoryStock(findings) {
    const stock = safeFindAll(CONFIG.SHEETS.INVENTORY_STOCK);

    const checks = [
      ["findOrphanStockItems", "Inventory stock references missing item."],
      [
        "findOrphanStockLocations",
        "Inventory stock references missing location.",
      ],
      [
        "findDuplicateStockRecords",
        "Duplicate inventory item/location stock record detected.",
      ],
      [
        "findInvalidStockQuantities",
        "Invalid inventory stock quantity detected.",
      ],
      [
        "findReservedGreaterThanOnHand",
        "Inventory reserved quantity exceeds quantity on hand.",
      ],
      [
        "findInvalidStockThresholds",
        "Invalid inventory minimum/maximum threshold detected.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InventoryService[check[0]]().forEach((record) => {
          addError(findings, "INVENTORY_STOCK", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INVENTORY_STOCK",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    addInfo(
      findings,
      "INVENTORY_STOCK",
      stock.length + " inventory stock record(s) checked.",
    );
  }

  /**
   * ----------------------------------------------------------
   * INVENTORY TRANSACTIONS - PHASE 4
   * ----------------------------------------------------------
   */
  function checkInventoryTransactions(findings) {
    const transactions = safeFindAll(CONFIG.SHEETS.INVENTORY_TRANSACTIONS);

    const checks = [
      ["findOrphanItemLinks", "Inventory transaction references missing item."],
      [
        "findOrphanFromLocations",
        "Inventory transaction references missing source location.",
      ],
      [
        "findOrphanToLocations",
        "Inventory transaction references missing destination location.",
      ],
      [
        "findInvalidTransactionTypes",
        "Invalid inventory transaction type detected.",
      ],
      [
        "findInvalidQuantities",
        "Invalid inventory transaction quantity detected.",
      ],
      [
        "findInvalidLocationRules",
        "Inventory transaction violates location-direction rules.",
      ],
      ["findOrphanUnitLinks", "Inventory transaction references missing unit."],
      [
        "findOrphanReservationLinks",
        "Inventory transaction references missing reservation.",
      ],
      [
        "findOrphanHousekeepingTaskLinks",
        "Inventory transaction references missing housekeeping task.",
      ],
      [
        "findOrphanMaintenanceWorkOrderLinks",
        "Inventory transaction references missing maintenance work order.",
      ],
      [
        "findInvalidUnitLocationLinks",
        "Inventory transaction UNIT location does not match unit_id.",
      ],
    ];

    checks.forEach((check) => {
      try {
        InventoryTransactionService[check[0]]().forEach((record) => {
          addError(findings, "INVENTORY_TRANSACTION", check[1], record);
        });
      } catch (err) {
        addError(
          findings,
          "INVENTORY_TRANSACTION",
          "Unable to execute " + check[0] + ": " + err.message,
        );
      }
    });

    try {
      InventoryTransactionService.findStockLedgerMismatches().forEach(
        (record) => {
          addError(
            findings,
            "INVENTORY_RECONCILIATION",
            "Inventory stock projection does not match immutable transaction ledger.",
            record,
          );
        },
      );
    } catch (err) {
      addError(
        findings,
        "INVENTORY_RECONCILIATION",
        "Unable to reconcile inventory stock against transaction ledger: " +
          err.message,
      );
    }

    addInfo(
      findings,
      "INVENTORY_TRANSACTION",
      transactions.length + " inventory transaction(s) checked.",
    );
  }

  function runServiceIntegrityChecks(findings, service, checkName, checks) {
    checks.forEach((check) => {
      const methodName = check[0];
      const message = check[1];
      try {
        if (!service || typeof service[methodName] !== "function") {
          addError(
            findings,
            checkName,
            "Missing integrity helper: " + methodName + "().",
          );
          return;
        }
        (service[methodName]() || []).forEach((record) => {
          addError(findings, checkName, message, record);
        });
      } catch (err) {
        addError(
          findings,
          checkName,
          "Unable to execute " + methodName + ": " + err.message,
        );
      }
    });
  }

  function checkOperatingExpenses(findings) {
    const rows = safeFindAll(CONFIG.SHEETS.OPERATING_EXPENSES);
    runServiceIntegrityChecks(findings, ExpenseService, "OPERATING_EXPENSE", [
      [
        "findOrphanPropertyLinks",
        "Operating expense references missing property.",
      ],
      ["findOrphanUnitLinks", "Operating expense references missing unit."],
      [
        "findPropertyUnitMismatches",
        "Operating expense unit does not belong to property.",
      ],
      [
        "findOrphanReservationLinks",
        "Operating expense references missing reservation.",
      ],
      [
        "findReservationUnitMismatches",
        "Operating expense reservation context does not match unit/property.",
      ],
      ["findInvalidCategories", "Invalid operating expense category detected."],
      ["findInvalidAmounts", "Invalid operating expense amount detected."],
      ["findInvalidCurrencies", "Invalid operating expense currency detected."],
      [
        "findInvalidPaymentMethods",
        "Invalid operating expense payment method detected.",
      ],
      ["findInvalidDates", "Invalid operating expense date detected."],
      ["findMissingDescriptions", "Operating expense description is missing."],
      ["findDuplicateExpenseIds", "Duplicate operating expense ID detected."],
    ]);
    try {
      ExpenseService.findUnknownVendorNames().forEach((record) =>
        addWarning(
          findings,
          "OPERATING_EXPENSE_VENDOR",
          "Operating expense vendor does not match a known vendor name.",
          record,
        ),
      );
      ExpenseService.findInactiveKnownVendors().forEach((record) =>
        addWarning(
          findings,
          "OPERATING_EXPENSE_VENDOR",
          "Operating expense references a known inactive vendor.",
          record,
        ),
      );
    } catch (err) {
      addError(
        findings,
        "OPERATING_EXPENSE_VENDOR",
        "Unable to validate operating expense vendor names: " + err.message,
      );
    }
    addInfo(
      findings,
      "OPERATING_EXPENSE",
      rows.length + " operating expense(s) checked.",
    );
  }

  function checkUtilities(findings) {
    const rows = safeFindAll(CONFIG.SHEETS.UTILITIES);
    runServiceIntegrityChecks(findings, UtilityService, "UTILITY", [
      [
        "findOrphanUtilityPropertyLinks",
        "Utility references missing property.",
      ],
      ["findOrphanUtilityUnitLinks", "Utility references missing unit."],
      [
        "findUtilityPropertyUnitMismatches",
        "Utility unit does not belong to property.",
      ],
      ["findInvalidUtilityTypes", "Invalid utility type detected."],
      [
        "findInvalidUtilityFrequencies",
        "Invalid utility billing frequency detected.",
      ],
      ["findInvalidUtilityCurrencies", "Invalid utility currency detected."],
      ["findInvalidUtilityStatuses", "Invalid utility status detected."],
      ["findDuplicateUtilityIds", "Duplicate utility ID detected."],
      [
        "findDuplicateUtilityAccountsOrMeters",
        "Duplicate utility account or meter detected.",
      ],
    ]);
    addInfo(findings, "UTILITY", rows.length + " utility record(s) checked.");
  }

  function checkUtilityBills(findings) {
    const rows = safeFindAll(CONFIG.SHEETS.UTILITY_BILLS);
    runServiceIntegrityChecks(findings, UtilityService, "UTILITY_BILL", [
      [
        "findOrphanBillUtilityLinks",
        "Utility bill references missing utility.",
      ],
      ["findInvalidBillingPeriods", "Invalid utility billing period detected."],
      [
        "findDuplicateBillPeriods",
        "Duplicate utility billing period detected.",
      ],
      [
        "findInvalidBillAmounts",
        "Invalid utility bill amount/tax/total detected.",
      ],
      [
        "findInvalidPaymentStatuses",
        "Invalid utility bill payment status detected.",
      ],
      ["findInvalidBillDates", "Invalid utility bill date/due date detected."],
      [
        "findPaymentDateInconsistencies",
        "Utility bill payment status and paid date are inconsistent.",
      ],
      ["findDuplicateBillIds", "Duplicate utility bill ID detected."],
    ]);
    addInfo(
      findings,
      "UTILITY_BILL",
      rows.length + " utility bill(s) checked.",
    );
  }

  function checkInternetServices(findings) {
    const rows = safeFindAll(CONFIG.SHEETS.INTERNET_SERVICES);
    runServiceIntegrityChecks(findings, InternetService, "INTERNET_SERVICE", [
      [
        "findOrphanPropertyLinks",
        "Internet service references missing property.",
      ],
      ["findOrphanUnitLinks", "Internet service references missing unit."],
      [
        "findPropertyUnitMismatches",
        "Internet service unit does not belong to property.",
      ],
      ["findMissingProviders", "Internet service provider is missing."],
      [
        "findMissingAccountNumbers",
        "Internet service account number is missing.",
      ],
      ["findMissingPackageNames", "Internet service package name is missing."],
      ["findInvalidFees", "Invalid Internet service fee detected."],
      [
        "findInvalidBillingCycles",
        "Invalid Internet service billing cycle detected.",
      ],
      ["findInvalidStatuses", "Invalid Internet service status detected."],
      [
        "findInvalidContractDates",
        "Invalid Internet service contract dates detected.",
      ],
      ["findDuplicateIds", "Duplicate Internet service ID detected."],
      [
        "findDuplicateProviderAccounts",
        "Duplicate Internet provider/account detected.",
      ],
    ]);
    try {
      InternetService.findActiveExpiredContracts().forEach((record) =>
        addWarning(
          findings,
          "INTERNET_SERVICE",
          "ACTIVE Internet service has an expired contract.",
          record,
        ),
      );
    } catch (err) {
      addError(
        findings,
        "INTERNET_SERVICE",
        "Unable to check active expired Internet contracts: " + err.message,
      );
    }
    addInfo(
      findings,
      "INTERNET_SERVICE",
      rows.length + " Internet service record(s) checked.",
    );
  }

  function runAll() {
    const started = new Date();

    const findings = [];

    /*

     * Structural checks first.

     */

    checkRequiredSheets(findings);

    checkRequiredHeaders(findings);

    checkReferenceCategories(findings);

    /*

     * IDs.

     */

    checkMissingIds(findings);

    checkDuplicateIds(findings);

    checkIdFormats(findings);

    checkIdSequences(findings);

    /*

     * Master data.

     */

    checkProperties(findings);

    checkUnits(findings);

    checkCustomers(findings);

    checkStaff(findings);

    checkOperationalStatuses(findings);

    /*

     * Phase 2.

     */

    checkExternalCalendarEvents(findings);

    checkCalendarFeedConfiguration(findings);

    /*

     * Phase 3.

     */

    checkReservations(findings);

    checkReservationGuests(findings);

    checkOTABlocks(findings);

    /*
     * Phase 4 - Stay & Operations.
     */

    checkHousekeepingTasks(findings);

    checkHousekeepingSchedules(findings);

    checkMaintenanceAssets(findings);

    checkMaintenanceSchedules(findings);

    checkMaintenanceWorkOrders(findings);

    checkInspections(findings);

    checkInspectionChecklist(findings);

    checkInventoryItems(findings);

    checkInventoryLocations(findings);

    checkInventoryStock(findings);

    checkInventoryTransactions(findings);

    /*
     * Phase 5 - Finance & Reporting.
     */
    checkOperatingExpenses(findings);
    checkUtilities(findings);
    checkUtilityBills(findings);
    checkInternetServices(findings);

    /*

     * Cross-domain calendar conflicts.

     */

    checkCalendarConflicts(findings);

    /*

     * Audit last.

     */

    checkAuditLog(findings);

    const errors = findings.filter((finding) => finding.severity === "ERROR");

    const warnings = findings.filter(
      (finding) => finding.severity === "WARNING",
    );

    const infos = findings.filter((finding) => finding.severity === "INFO");

    const finished = new Date();

    return {
      passed: errors.length === 0,

      errors: errors.length,

      warnings: warnings.length,

      infos: infos.length,

      findings: findings,

      duration_ms: finished.getTime() - started.getTime(),

      generated_at: Utilities.formatDate(
        finished,

        CONFIG.TIMEZONE,

        CONFIG.DATE_FORMATS.DATETIME,
      ),
    };
  }

  /**

   * ----------------------------------------------------------

   * PRINT REPORT

   * ----------------------------------------------------------

   */

  function printReport(report) {
    report = report || runAll();

    Logger.log("============================================================");

    Logger.log("INTEGRITY CHECK REPORT");

    Logger.log("============================================================");

    Logger.log("PASSED: " + report.passed);

    Logger.log("ERRORS: " + report.errors);

    Logger.log("WARNINGS: " + report.warnings);

    Logger.log("INFO: " + report.infos);

    Logger.log("DURATION: " + report.duration_ms + " ms");

    Logger.log("------------------------------------------------------------");

    report.findings.forEach((finding, index) => {
      Logger.log(
        index +
          1 +
          ". [" +
          finding.severity +
          "] [" +
          finding.check +
          "] " +
          finding.message,
      );

      if (finding.details !== undefined && finding.details !== null) {
        Logger.log(
          JSON.stringify(
            finding.details,

            null,

            2,
          ),
        );
      }
    });

    Logger.log("============================================================");

    return report;
  }

  /**

   * ----------------------------------------------------------

   * PUBLIC API

   * ----------------------------------------------------------

   */

  return {
    runAll,
    printReport,
    getIdEntities,
    checkRequiredSheets,
    checkRequiredHeaders,
    checkReferenceCategories,
    checkMissingIds,
    checkDuplicateIds,
    checkIdFormats,
    checkIdSequences,
    checkProperties,
    checkUnits,
    checkCustomers,
    checkStaff,
    checkOperationalStatuses,
    checkExternalCalendarEvents,
    checkReservations,
    checkReservationGuests,
    /*
    checkOTABlocks,
    checkHousekeepingTasks,
    checkHousekeepingSchedules,
    checkCalendarFeedConfiguration,
*/

    checkOTABlocks,

    checkHousekeepingTasks,

    checkHousekeepingSchedules,
    checkMaintenanceAssets,
    checkMaintenanceSchedules,
    checkMaintenanceWorkOrders,
    checkInspections,
    checkInspectionChecklist,
    checkInventoryItems,
    checkInventoryLocations,
    checkInventoryStock,
    checkInventoryTransactions,
    checkOperatingExpenses,
    checkUtilities,
    checkUtilityBills,
    checkInternetServices,
    checkCalendarFeedConfiguration,

    checkCalendarConflicts,

    checkAuditLog,
  };
})();

function runIntegrityCheck() {
  const report = IntegrityCheckService.runAll();

  IntegrityCheckService.printReport(report);

  return report;
}
