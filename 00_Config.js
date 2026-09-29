/**
 * ============================================================
 * 00_Config.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Central application configuration.
 *
 * IMPORTANT:
 * - Do not hardcode sheet names inside services.
 * - Do not hardcode ID prefixes inside services.
 * - All services should reference CONFIG.
 *
 * Timezone:
 * Africa/Cairo
 *
 * ============================================================
 */

const CONFIG = {
  /**
   * ----------------------------------------------------------
   * APPLICATION
   * ----------------------------------------------------------
   */

  APP: {
    NAME: "Rental Operations MVP",

    VERSION: "1.0.0",

    PHASE: "PHASE_1",
  },

  /**
   * ----------------------------------------------------------
   * TIMEZONE
   * ----------------------------------------------------------
   */

  TIMEZONE: "Africa/Cairo",

  /**
   * ----------------------------------------------------------
   * GOOGLE SHEET NAMES
   * ----------------------------------------------------------
   */

  SHEETS: {
    // Reference / Master Data

    REFERENCE_DATA: "00_ReferenceData",

    PROPERTIES: "01_Properties",

    UNITS: "02_Units",

    AMENITIES: "03_Amenities",

    UNIT_AMENITIES: "04_UnitAmenities",

    MEDIA: "05_Media",

    LOCATIONS: "06_Locations",

    // Customers / Reservations

    CUSTOMERS: "07_Customers",

    GUESTS: "08_Guests",

    RESERVATIONS: "09_Reservations",

    RESERVATION_GUESTS: "10_ReservationGuests",

    RESERVATION_CHARGES: "11_ReservationCharges",

    PAYMENTS: "12_Payments",

    EXTERNAL_CALENDAR_EVENTS: "13_ExternalCalendarEvents",

    OTA_BLOCKS: "14_OTABlocks",

    // Operations

    STAFF: "15_Staff",

    HOUSEKEEPING_TASKS: "16_HousekeepingTasks",

    HOUSEKEEPING_SCHEDULES: "17_HousekeepingSchedules",

    MAINTENANCE_ASSETS: "18_MaintenanceAssets",

    MAINTENANCE_SCHEDULES: "19_MaintenanceSchedules",

    MAINTENANCE_WORK_ORDERS: "20_MaintenanceWorkOrders",

    INSPECTIONS: "21_Inspections",

    INSPECTION_CHECKLIST: "22_InspectionChecklist",

    UNIT_OPERATIONAL_STATUS: "23_UnitOperationalStatus",

    // Finance

    UTILITIES: "24_Utilities",

    UTILITY_BILLS: "25_UtilityBills",

    INTERNET_SERVICES: "26_InternetServices",

    OPERATING_EXPENSES: "27_OperatingExpenses",

    VENDORS: "28_Vendors",

    // System

    NOTIFICATIONS: "29_Notifications",

    AUDIT_LOG: "30_AuditLog",

    // Inventory

    INVENTORY_ITEMS: "31_InventoryItems",

    INVENTORY_LOCATIONS: "32_InventoryLocations",

    INVENTORY_STOCK: "33_InventoryStock",

    INVENTORY_TRANSACTIONS: "34_InventoryTransactions",
  },

  /**
   * ----------------------------------------------------------
   * ID PREFIXES
   * ----------------------------------------------------------
   *
   * Used by IdService.
   *
   * Format:
   *
   * PREFIX-000001
   *
   * Example:
   *
   * PROP-000001
   * UNIT-000001
   * RES-000001
   *
   * ----------------------------------------------------------
   */

  ID_PREFIXES: {
    PROPERTY: "PROP",

    UNIT: "UNIT",

    AMENITY: "AMN",

    MEDIA: "MED",

    LOCATION: "LOC",

    CUSTOMER: "CUST",

    GUEST: "GST",

    RESERVATION: "RES",

    EXTERNAL_CALENDAR_EVENT: "EXT",

    OTA_BLOCK: "OTAB",

    STAFF: "STF",

    HOUSEKEEPING_TASK: "TASK",

    MAINTENANCE_ASSET: "AST",

    MAINTENANCE_WORK_ORDER: "WO",

    INSPECTION: "INSP",

    UTILITY: "UTL",

    UTILITY_BILL: "BILL",

    INTERNET_SERVICE: "INT",

    OPERATING_EXPENSE: "EXP",

    VENDOR: "VND",

    NOTIFICATION: "NTF",

    AUDIT: "AUD",
    RESERVATION_GUEST: "RG",
    HOUSEKEEPING_SCHEDULE: "HS",
    INSPECTION: "INSP",
    INSPECTION_CHECKLIST_ITEM: "IC",
    MAINTENANCE_SCHEDULE: "MS",

    INVENTORY_ITEM: "ITEM",
    INVENTORY_LOCATION: "ILOC",
    INVENTORY_STOCK: "STK",
    INVENTORY_TRANSACTION: "ITX",
  },

  /**
   * ----------------------------------------------------------
   * ID SETTINGS
   * ----------------------------------------------------------
   */

  ID: {
    PADDING: 6,

    SEQUENCE_PROPERTY_PREFIX: "SEQ_",
  },

  /**
   * ----------------------------------------------------------
   * DEFAULT VALUES
   * ----------------------------------------------------------
   */

  DEFAULTS: {
    PROPERTY_STATUS: "ACTIVE",

    UNIT_STATUS: "ACTIVE",

    CUSTOMER_STATUS: "ACTIVE",

    STAFF_STATUS: "ACTIVE",

    OPERATIONAL_STATUS: "READY",

    ACTOR_ID: "SYSTEM",

    ACTOR_TYPE: "SYSTEM",
  },

  /**
   * ----------------------------------------------------------
   * DATE / TIME FORMATS
   * ----------------------------------------------------------
   */

  DATE_FORMATS: {
    DATE: "yyyy-MM-dd",

    DATETIME: "yyyy-MM-dd HH:mm:ss",

    TIME: "HH:mm",
  },

  /**
   * ----------------------------------------------------------
   * PHASE 1 REQUIRED SHEETS
   * ----------------------------------------------------------
   *
   * Used later by:
   *
   * - setupPhase1()
   * - IntegrityCheckService
   * - Phase 1 acceptance tests
   *
   * ----------------------------------------------------------
   */

  PHASE_1_REQUIRED_SHEETS: [
    "00_ReferenceData",

    "01_Properties",

    "02_Units",

    "06_Locations",

    "07_Customers",

    "08_Guests",

    "15_Staff",

    "23_UnitOperationalStatus",

    "30_AuditLog",
  ],

  /**
   * ----------------------------------------------------------
   * REQUIRED REFERENCE CATEGORIES
   * ----------------------------------------------------------
   */

  PHASE_1_REFERENCE_CATEGORIES: [
    "PROPERTY_TYPE",

    "UNIT_TYPE",

    "UNIT_STATUS",

    "STAFF_ROLE",

    "OPERATIONAL_STATUS",
  ],
};
