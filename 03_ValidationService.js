/**
 * ============================================================
 * 03_ValidationService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Central validation service.
 *
 * Responsibilities:
 *
 * - Required field validation
 * - Reference-data validation
 * - Foreign-key validation
 * - Uniqueness validation
 * - Numeric validation
 * - Email validation
 * - Phase 1 entity validation
 *
 * IMPORTANT:
 *
 * ValidationService does NOT:
 *
 * - Generate IDs
 * - Insert/update records
 * - Write audit records
 * - Change operational status
 *
 * Those responsibilities belong to their respective services.
 *
 * ============================================================
 */

const ValidationService = (() => {
  /**
   * ==========================================================
   * BASIC FIELD VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * IS BLANK
   * ----------------------------------------------------------
   */

  function isBlank(value) {
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  /**
   * ----------------------------------------------------------
   * REQUIRE FIELD
   * ----------------------------------------------------------
   */

  function requireField(data, fieldName) {
    if (!data || typeof data !== "object") {
      throw new Error("Data object is required.");
    }

    if (isBlank(data[fieldName])) {
      throw new Error("Required field missing: " + fieldName);
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * REQUIRE MULTIPLE FIELDS
   * ----------------------------------------------------------
   */

  function requireFields(data, fields) {
    if (!Array.isArray(fields)) {
      throw new Error("fields must be an array.");
    }

    fields.forEach((fieldName) => {
      requireField(data, fieldName);
    });

    return true;
  }

  /**
   * ==========================================================
   * REFERENCE DATA VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CHECK WHETHER REFERENCE RECORD IS ACTIVE
   * ----------------------------------------------------------
   *
   * Google Sheets may return:
   *
   * true
   * "TRUE"
   * "true"
   * 1
   *
   * depending on how the cell was populated.
   */

  function isActiveReference(value) {
    if (value === true) {
      return true;
    }

    if (value === 1) {
      return true;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toUpperCase();

      return (
        normalized === "TRUE" || normalized === "YES" || normalized === "1"
      );
    }

    return false;
  }

  /**
   * ----------------------------------------------------------
   * GET ACTIVE REFERENCE VALUES
   * ----------------------------------------------------------
   *
   * Expected ReferenceData structure:
   *
   * category
   * code
   * label
   * active
   *
   * Example:
   *
   * UNIT_TYPE | ONE_BEDROOM | One Bedroom | TRUE
   */

  function getReferenceValues(category) {
    if (isBlank(category)) {
      throw new Error("Reference category is required.");
    }

    const normalizedCategory = String(category).trim().toUpperCase();

    const records = BaseRepository.findByField(
      CONFIG.SHEETS.REFERENCE_DATA,
      "category",
      normalizedCategory,
    );

    return records
      .filter((record) => isActiveReference(record.active))
      .map((record) => String(record.code).trim().toUpperCase());
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE REFERENCE VALUE
   * ----------------------------------------------------------
   */

  function validateReference(category, value) {
    if (isBlank(category)) {
      throw new Error("Reference category is required.");
    }

    if (isBlank(value)) {
      throw new Error("Reference value is required for category: " + category);
    }

    const normalizedCategory = String(category).trim().toUpperCase();

    const normalizedValue = String(value).trim().toUpperCase();

    const allowedValues = getReferenceValues(normalizedCategory);

    if (allowedValues.length === 0) {
      throw new Error(
        "No active reference values found for category: " + normalizedCategory,
      );
    }

    if (!allowedValues.includes(normalizedValue)) {
      throw new Error(
        'Invalid value "' +
          normalizedValue +
          '" for reference category "' +
          normalizedCategory +
          '". Allowed values: ' +
          allowedValues.join(", "),
      );
    }

    return true;
  }

  /**
   * ==========================================================
   * FOREIGN KEY VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GENERIC FOREIGN KEY VALIDATION
   * ----------------------------------------------------------
   */

  function validateForeignKey(sheetName, idColumn, id, entityName) {
    if (isBlank(id)) {
      throw new Error((entityName || "Entity") + " ID is required.");
    }

    const normalizedId = String(id).trim();

    const exists = BaseRepository.exists(sheetName, idColumn, normalizedId);

    if (!exists) {
      throw new Error((entityName || "Entity") + " not found: " + normalizedId);
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * PROPERTY EXISTS
   * ----------------------------------------------------------
   */

  function validatePropertyExists(propertyId) {
    return validateForeignKey(
      CONFIG.SHEETS.PROPERTIES,
      "property_id",
      propertyId,
      "Property",
    );
  }

  /**
   * ----------------------------------------------------------
   * UNIT EXISTS
   * ----------------------------------------------------------
   */

  function validateUnitExists(unitId) {
    return validateForeignKey(CONFIG.SHEETS.UNITS, "unit_id", unitId, "Unit");
  }

  /**
   * ----------------------------------------------------------
   * LOCATION EXISTS
   * ----------------------------------------------------------
   */

  function validateLocationExists(locationId) {
    return validateForeignKey(
      CONFIG.SHEETS.LOCATIONS,
      "location_id",
      locationId,
      "Location",
    );
  }

  /**
   * ----------------------------------------------------------
   * CUSTOMER EXISTS
   * ----------------------------------------------------------
   */

  function validateCustomerExists(customerId) {
    return validateForeignKey(
      CONFIG.SHEETS.CUSTOMERS,
      "customer_id",
      customerId,
      "Customer",
    );
  }

  /**
   * ----------------------------------------------------------
   * GUEST EXISTS
   * ----------------------------------------------------------
   */

  function validateGuestExists(guestId) {
    return validateForeignKey(
      CONFIG.SHEETS.GUESTS,
      "guest_id",
      guestId,
      "Guest",
    );
  }

  /**
   * ----------------------------------------------------------
   * STAFF EXISTS
   * ----------------------------------------------------------
   */

  function validateStaffExists(staffId) {
    return validateForeignKey(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      staffId,
      "Staff",
    );
  }

  /**
   * ==========================================================
   * UNIQUENESS VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE UNIQUE FIELD
   * ----------------------------------------------------------
   *
   * Used primarily during CREATE operations.
   *
   * Blank optional values are ignored.
   */

  function validateUnique(sheetName, fieldName, value, displayName) {
    if (isBlank(value)) {
      return true;
    }

    const exists = BaseRepository.exists(sheetName, fieldName, value);

    if (exists) {
      throw new Error((displayName || fieldName) + " already exists: " + value);
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE UNIQUE EXCLUDING CURRENT RECORD
   * ----------------------------------------------------------
   *
   * Used during UPDATE operations.
   *
   * Example:
   *
   * Unit UNIT-000001 already has code SB-101.
   *
   * Updating another field should not cause SB-101 to fail
   * uniqueness merely because the current unit owns it.
   */

  function validateUniqueExcept(
    sheetName,
    fieldName,
    value,
    idColumn,
    currentId,
    displayName,
  ) {
    if (isBlank(value)) {
      return true;
    }

    const matches = BaseRepository.findByField(sheetName, fieldName, value);

    const conflict = matches.some((record) => {
      return String(record[idColumn]).trim() !== String(currentId).trim();
    });

    if (conflict) {
      throw new Error((displayName || fieldName) + " already exists: " + value);
    }

    return true;
  }

  /**
   * ==========================================================
   * NUMBER VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE NUMBER
   * ----------------------------------------------------------
   */

  function validateNumber(value, fieldName) {
    if (isBlank(value)) {
      return true;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error((fieldName || "Value") + " must be a valid number.");
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE NON-NEGATIVE NUMBER
   * ----------------------------------------------------------
   */

  function validateNonNegativeNumber(value, fieldName) {
    if (isBlank(value)) {
      return true;
    }

    validateNumber(value, fieldName);

    if (Number(value) < 0) {
      throw new Error(
        (fieldName || "Value") + " must be greater than or equal to 0.",
      );
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE POSITIVE NUMBER
   * ----------------------------------------------------------
   */

  function validatePositiveNumber(value, fieldName) {
    if (isBlank(value)) {
      return true;
    }

    validateNumber(value, fieldName);

    if (Number(value) <= 0) {
      throw new Error((fieldName || "Value") + " must be greater than 0.");
    }

    return true;
  }

  /**
   * ==========================================================
   * FORMAT VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE EMAIL
   * ----------------------------------------------------------
   *
   * This is intentionally a practical validation rather than
   * attempting full RFC email-address validation.
   */

  function validateEmail(email) {
    if (isBlank(email)) {
      return true;
    }

    const normalizedEmail = String(email).trim();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      throw new Error("Invalid email address: " + normalizedEmail);
    }

    return true;
  }

  /**
   * ==========================================================
   * PROPERTY VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE PROPERTY CREATE
   * ----------------------------------------------------------
   */

  function validatePropertyCreate(data) {
    requireFields(data, [
      "property_code",
      "property_name",
      "property_type",
      "location_id",
      "status",
    ]);

    validateReference("PROPERTY_TYPE", data.property_type);

    validateLocationExists(data.location_id);

    validateUnique(
      CONFIG.SHEETS.PROPERTIES,
      "property_code",
      data.property_code,
      "Property code",
    );

    validatePositiveNumber(data.min_nights, "min_nights");

    validatePositiveNumber(data.max_nights, "max_nights");

    if (
      !isBlank(data.min_nights) &&
      !isBlank(data.max_nights) &&
      Number(data.max_nights) < Number(data.min_nights)
    ) {
      throw new Error(
        "max_nights must be greater than or equal to min_nights.",
      );
    }

    /*
     * Property master status.
     *
     * Currently Phase 1 uses ACTIVE / INACTIVE directly.
     */

    validateActiveInactiveStatus(data.status, "Property status");

    return true;
  }

  /**
   * ==========================================================
   * UNIT VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE UNIT CREATE
   * ----------------------------------------------------------
   */

  function validateUnitCreate(data) {
    requireFields(data, [
      "property_id",
      "unit_code",
      "unit_name",
      "unit_type",
      "status",
    ]);

    validatePropertyExists(data.property_id);

    validateReference("UNIT_TYPE", data.unit_type);

    validateReference("UNIT_STATUS", data.status);

    validateUnique(
      CONFIG.SHEETS.UNITS,
      "unit_code",
      data.unit_code,
      "Unit code",
    );

    validateNonNegativeNumber(data.bedrooms, "bedrooms");

    validateNonNegativeNumber(data.bathrooms, "bathrooms");

    validateNonNegativeNumber(data.max_adults, "max_adults");

    validateNonNegativeNumber(data.max_children, "max_children");

    validateNonNegativeNumber(data.max_guests, "max_guests");

    validateNonNegativeNumber(data.area_sqm, "area_sqm");

    validateNonNegativeNumber(data.floor_number, "floor_number");

    return true;
  }

  /**
   * ==========================================================
   * CUSTOMER VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE CUSTOMER CREATE
   * ----------------------------------------------------------
   */

  function validateCustomerCreate(data) {
    requireFields(data, ["first_name", "last_name"]);

    /*
     * Customer must have at least one contact method.
     */

    if (isBlank(data.email) && isBlank(data.phone)) {
      throw new Error("Customer must have at least an email or phone number.");
    }

    if (!isBlank(data.email)) {
      validateEmail(data.email);

      validateUnique(
        CONFIG.SHEETS.CUSTOMERS,
        "email",
        data.email,
        "Customer email",
      );
    }

    if (!isBlank(data.phone)) {
      validateUnique(
        CONFIG.SHEETS.CUSTOMERS,
        "phone",
        data.phone,
        "Customer phone",
      );
    }

    /*
     * Validate status only when provided.
     */

    if (!isBlank(data.status)) {
      validateActiveInactiveStatus(data.status, "Customer status");
    }

    return true;
  }

  /**
   * ==========================================================
   * STAFF VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE STAFF CREATE
   * ----------------------------------------------------------
   */

  function validateStaffCreate(data) {
    requireFields(data, ["name", "role", "property_id", "status"]);

    validatePropertyExists(data.property_id);

    validateReference("STAFF_ROLE", data.role);

    /*
     * Staff status is a master-record status:
     *
     * ACTIVE / INACTIVE
     *
     * It is deliberately NOT an operational status.
     */

    validateActiveInactiveStatus(data.status, "Staff status");

    if (!isBlank(data.phone)) {
      validateUnique(CONFIG.SHEETS.STAFF, "phone", data.phone, "Staff phone");
    }

    return true;
  }

  /**
   * ==========================================================
   * OPERATIONAL STATUS VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE OPERATIONAL STATUS
   * ----------------------------------------------------------
   */

  function validateOperationalStatus(status) {
    return validateReference("OPERATIONAL_STATUS", status);
  }

  /**
   * ==========================================================
   * MASTER STATUS VALIDATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * ACTIVE / INACTIVE STATUS
   * ----------------------------------------------------------
   */

  function validateActiveInactiveStatus(status, displayName) {
    if (isBlank(status)) {
      throw new Error((displayName || "Status") + " is required.");
    }

    const normalized = String(status).trim().toUpperCase();

    const allowed = ["ACTIVE", "INACTIVE"];

    if (!allowed.includes(normalized)) {
      throw new Error(
        (displayName || "Status") + " must be ACTIVE or INACTIVE.",
      );
    }

    return true;
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    // Generic helpers

    isBlank,

    requireField,

    requireFields,

    // Reference data

    isActiveReference,

    getReferenceValues,

    validateReference,

    // Foreign keys

    validateForeignKey,

    validatePropertyExists,

    validateUnitExists,

    validateLocationExists,

    validateCustomerExists,

    validateGuestExists,

    validateStaffExists,

    // Uniqueness

    validateUnique,

    validateUniqueExcept,

    // Numbers

    validateNumber,

    validateNonNegativeNumber,

    validatePositiveNumber,

    // Formats

    validateEmail,

    // Entity validation

    validatePropertyCreate,

    validateUnitCreate,

    validateCustomerCreate,

    validateStaffCreate,

    validateOperationalStatus,

    // Master status

    validateActiveInactiveStatus,
  };
})();
