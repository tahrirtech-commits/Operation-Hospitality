/**
 * ============================================================
 * 13_StaffService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Domain service for Staff.
 *
 * Responsibilities:
 *
 * - Create staff members
 * - Read/search staff members
 * - Update staff members
 * - Change staff master status
 * - Query staff by property and role
 *
 * Data source:
 *
 * 15_Staff
 *
 * Staff master status:
 *
 * ACTIVE
 * INACTIVE
 *
 * Staff roles are controlled by:
 *
 * 00_ReferenceData
 * category = STAFF_ROLE
 *
 * Expected Phase 1 roles:
 *
 * ADMIN
 * SUPERVISOR
 * HOUSEKEEPER
 * TECHNICIAN
 *
 * IMPORTANT:
 *
 * Staff status is NOT unit operational status.
 *
 * ============================================================
 */

const StaffService = (() => {
  const ENTITY_TYPE = "STAFF";

  const DEFAULT_STATUS = CONFIG.DEFAULTS.STAFF_STATUS || "ACTIVE";

  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * TIMESTAMP
   * ----------------------------------------------------------
   */

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE ACTOR
   * ----------------------------------------------------------
   */

  function normalizeActorId(actorId) {
    if (
      actorId === undefined ||
      actorId === null ||
      String(actorId).trim() === ""
    ) {
      return CONFIG.DEFAULTS.ACTOR_ID;
    }

    return String(actorId).trim();
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE STAFF
   * ----------------------------------------------------------
   */

  function normalizeStaff(data) {
    const staff = Object.assign({}, data || {});

    if (staff.name !== undefined && staff.name !== null) {
      staff.name = String(staff.name).trim();
    }

    if (staff.role !== undefined && staff.role !== null) {
      staff.role = String(staff.role).trim().toUpperCase();
    }

    if (staff.property_id !== undefined && staff.property_id !== null) {
      staff.property_id = String(staff.property_id).trim();
    }

    if (staff.phone !== undefined && staff.phone !== null) {
      staff.phone = String(staff.phone).trim();
    }

    if (staff.email !== undefined && staff.email !== null) {
      staff.email = String(staff.email).trim().toLowerCase();
    }

    if (staff.status !== undefined && staff.status !== null) {
      staff.status = String(staff.status).trim().toUpperCase();
    }

    return staff;
  }

  /**
   * ----------------------------------------------------------
   * REQUIRE STAFF
   * ----------------------------------------------------------
   *
   * Returns staff when found.
   * Throws when not found.
   */

  function requireStaff(staffId) {
    if (
      staffId === undefined ||
      staffId === null ||
      String(staffId).trim() === ""
    ) {
      throw new Error("staffId is required.");
    }

    const normalizedId = String(staffId).trim();

    const staff = BaseRepository.findById(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      normalizedId,
    );

    if (!staff) {
      throw new Error("Staff member not found: " + normalizedId);
    }

    return staff;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE STAFF UPDATE
   * ----------------------------------------------------------
   */

  function validateUpdate(staff) {
    ValidationService.requireFields(staff, [
      "staff_id",
      "name",
      "role",
      "property_id",
      "status",
    ]);

    /*
     * Property must exist.
     */

    ValidationService.validatePropertyExists(staff.property_id);

    /*
     * Staff role must exist in ReferenceData.
     */

    ValidationService.validateReference("STAFF_ROLE", staff.role);

    /*
     * Staff master status.
     */

    ValidationService.validateActiveInactiveStatus(
      staff.status,
      "Staff status",
    );

    /*
     * Phone uniqueness.
     */

    if (!ValidationService.isBlank(staff.phone)) {
      ValidationService.validateUniqueExcept(
        CONFIG.SHEETS.STAFF,
        "phone",
        staff.phone,
        "staff_id",
        staff.staff_id,
        "Staff phone",
      );
    }

    /*
     * Email validation.
     *
     * Email is optional in Phase 1.
     */

    if (!ValidationService.isBlank(staff.email)) {
      ValidationService.validateEmail(staff.email);

      ValidationService.validateUniqueExcept(
        CONFIG.SHEETS.STAFF,
        "email",
        staff.email,
        "staff_id",
        staff.staff_id,
        "Staff email",
      );
    }

    return true;
  }

  /**
   * ==========================================================
   * CREATE
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CREATE STAFF
   * ----------------------------------------------------------
   *
   * Flow:
   *
   * Input
   *   ↓
   * Normalize
   *   ↓
   * Apply default ACTIVE
   *   ↓
   * Validate
   *   ↓
   * Generate STF ID
   *   ↓
   * Insert
   *   ↓
   * Audit
   */

  function createStaff(data, actorId) {
    if (!data || typeof data !== "object") {
      throw new Error("Staff data is required.");
    }

    const normalizedActorId = normalizeActorId(actorId);

    let staff = normalizeStaff(data);

    /*
     * Apply default status.
     */

    if (ValidationService.isBlank(staff.status)) {
      staff.status = DEFAULT_STATUS;
    }

    /*
     * Validate BEFORE generating the ID.
     */

    ValidationService.validateStaffCreate(staff);

    /*
     * Additional email validation.
     *
     * ValidationService.validateStaffCreate currently handles
     * the core Phase 1 staff fields and phone uniqueness.
     */

    if (!ValidationService.isBlank(staff.email)) {
      ValidationService.validateEmail(staff.email);

      ValidationService.validateUnique(
        CONFIG.SHEETS.STAFF,
        "email",
        staff.email,
        "Staff email",
      );
    }

    /*
     * Generate stable ID.
     */

    staff.staff_id = IdService.nextId(ENTITY_TYPE);

    const now = timestamp();

    staff.created_at = staff.created_at || now;

    staff.updated_at = now;

    /*
     * Persist.
     */

    const inserted = BaseRepository.insert(CONFIG.SHEETS.STAFF, staff);

    /*
     * Audit.
     */

    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.staff_id,
      inserted,
      normalizedActorId,
    );

    return inserted;
  }

  /**
   * ==========================================================
   * READ
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * GET STAFF BY ID
   * ----------------------------------------------------------
   *
   * Returns null when not found.
   */

  function getStaffById(staffId) {
    if (
      staffId === undefined ||
      staffId === null ||
      String(staffId).trim() === ""
    ) {
      throw new Error("staffId is required.");
    }

    return BaseRepository.findById(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      String(staffId).trim(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET STAFF BY PHONE
   * ----------------------------------------------------------
   */

  function getStaffByPhone(phone) {
    if (phone === undefined || phone === null || String(phone).trim() === "") {
      return null;
    }

    return BaseRepository.findOneByField(
      CONFIG.SHEETS.STAFF,
      "phone",
      String(phone).trim(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET STAFF BY EMAIL
   * ----------------------------------------------------------
   */

  function getStaffByEmail(email) {
    if (email === undefined || email === null || String(email).trim() === "") {
      return null;
    }

    return BaseRepository.findOneByField(
      CONFIG.SHEETS.STAFF,
      "email",
      String(email).trim().toLowerCase(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET ALL STAFF
   * ----------------------------------------------------------
   */

  function getAllStaff() {
    return BaseRepository.findAll(CONFIG.SHEETS.STAFF);
  }

  /**
   * ----------------------------------------------------------
   * GET STAFF BY PROPERTY
   * ----------------------------------------------------------
   */

  function getStaffByProperty(propertyId) {
    ValidationService.validatePropertyExists(propertyId);

    return BaseRepository.findByField(
      CONFIG.SHEETS.STAFF,
      "property_id",
      String(propertyId).trim(),
    );
  }

  /**
   * ----------------------------------------------------------
   * GET STAFF BY ROLE
   * ----------------------------------------------------------
   */

  function getStaffByRole(role) {
    if (role === undefined || role === null || String(role).trim() === "") {
      throw new Error("role is required.");
    }

    const normalizedRole = String(role).trim().toUpperCase();

    ValidationService.validateReference("STAFF_ROLE", normalizedRole);

    return BaseRepository.findByField(
      CONFIG.SHEETS.STAFF,
      "role",
      normalizedRole,
    );
  }

  /**
   * ----------------------------------------------------------
   * GET STAFF BY PROPERTY AND ROLE
   * ----------------------------------------------------------
   */

  function getStaffByPropertyAndRole(propertyId, role) {
    ValidationService.validatePropertyExists(propertyId);

    const normalizedRole = String(role || "")
      .trim()
      .toUpperCase();

    ValidationService.validateReference("STAFF_ROLE", normalizedRole);

    const staff = BaseRepository.findByField(
      CONFIG.SHEETS.STAFF,
      "property_id",
      String(propertyId).trim(),
    );

    return staff.filter(
      (member) =>
        String(member.role || "")
          .trim()
          .toUpperCase() === normalizedRole,
    );
  }

  /**
   * ----------------------------------------------------------
   * GET ACTIVE STAFF
   * ----------------------------------------------------------
   */

  function getActiveStaff() {
    return BaseRepository.findByField(CONFIG.SHEETS.STAFF, "status", "ACTIVE");
  }

  /**
   * ----------------------------------------------------------
   * GET INACTIVE STAFF
   * ----------------------------------------------------------
   */

  function getInactiveStaff() {
    return BaseRepository.findByField(
      CONFIG.SHEETS.STAFF,
      "status",
      "INACTIVE",
    );
  }

  /**
   * ----------------------------------------------------------
   * GET ACTIVE STAFF BY PROPERTY
   * ----------------------------------------------------------
   */

  function getActiveStaffByProperty(propertyId) {
    return getStaffByProperty(propertyId).filter(
      (member) =>
        String(member.status || "")
          .trim()
          .toUpperCase() === "ACTIVE",
    );
  }

  /**
   * ----------------------------------------------------------
   * GET ACTIVE STAFF BY ROLE
   * ----------------------------------------------------------
   */

  function getActiveStaffByRole(role) {
    return getStaffByRole(role).filter(
      (member) =>
        String(member.status || "")
          .trim()
          .toUpperCase() === "ACTIVE",
    );
  }

  /**
   * ----------------------------------------------------------
   * STAFF EXISTS
   * ----------------------------------------------------------
   */

  function exists(staffId) {
    if (
      staffId === undefined ||
      staffId === null ||
      String(staffId).trim() === ""
    ) {
      return false;
    }

    return BaseRepository.exists(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      String(staffId).trim(),
    );
  }

  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * UPDATE STAFF
   * ----------------------------------------------------------
   *
   * Protected fields:
   *
   * staff_id
   * created_at
   */

  function updateStaff(staffId, changes, actorId) {
    if (!changes || typeof changes !== "object") {
      throw new Error("Staff changes are required.");
    }

    const existing = requireStaff(staffId);

    const normalizedActorId = normalizeActorId(actorId);

    /*
     * Merge existing state with requested changes.
     */

    let updated = Object.assign({}, existing, changes);

    /*
     * Protect immutable fields.
     */

    updated.staff_id = existing.staff_id;

    updated.created_at = existing.created_at;

    /*
     * Normalize resulting record.
     */

    updated = normalizeStaff(updated);

    /*
     * Validate complete resulting state.
     */

    validateUpdate(updated);

    updated.updated_at = timestamp();

    /*
     * Persist.
     */

    const persisted = BaseRepository.update(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      existing.staff_id,
      updated,
    );

    /*
     * Audit.
     */

    AuditService.logUpdate(
      ENTITY_TYPE,
      existing.staff_id,
      existing,
      persisted,
      normalizedActorId,
    );

    return persisted;
  }

  /**
   * ==========================================================
   * STATUS MANAGEMENT
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CHANGE STAFF STATUS
   * ----------------------------------------------------------
   *
   * Changes:
   *
   * 15_Staff.status
   *
   * Valid values:
   *
   * ACTIVE
   * INACTIVE
   */

  function changeStaffStatus(staffId, newStatus, actorId) {
    const existing = requireStaff(staffId);

    const normalizedStatus = String(newStatus || "")
      .trim()
      .toUpperCase();

    ValidationService.validateActiveInactiveStatus(
      normalizedStatus,
      "Staff status",
    );

    /*
     * No-op if already in requested state.
     */

    if (
      String(existing.status || "")
        .trim()
        .toUpperCase() === normalizedStatus
    ) {
      return existing;
    }

    const normalizedActorId = normalizeActorId(actorId);

    const persisted = BaseRepository.update(
      CONFIG.SHEETS.STAFF,
      "staff_id",
      existing.staff_id,
      {
        status: normalizedStatus,

        updated_at: timestamp(),
      },
    );

    AuditService.logStatusChange(
      ENTITY_TYPE,
      existing.staff_id,
      existing.status,
      normalizedStatus,
      normalizedActorId,
    );

    return persisted;
  }

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * SEARCH STAFF
   * ----------------------------------------------------------
   *
   * Phase 1 in-memory search across:
   *
   * staff_id
   * name
   * role
   * email
   * phone
   * property_id
   */

  function searchStaff(searchText) {
    if (
      searchText === undefined ||
      searchText === null ||
      String(searchText).trim() === ""
    ) {
      return [];
    }

    const query = String(searchText).trim().toLowerCase();

    return getAllStaff().filter((staff) => {
      const values = [
        staff.staff_id,

        staff.name,

        staff.role,

        staff.email,

        staff.phone,

        staff.property_id,
      ];

      return values.some((value) => {
        if (value === undefined || value === null) {
          return false;
        }

        return String(value).toLowerCase().includes(query);
      });
    });
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    createStaff,

    getStaffById,

    getStaffByPhone,

    getStaffByEmail,

    getAllStaff,

    getStaffByProperty,

    getStaffByRole,

    getStaffByPropertyAndRole,

    getActiveStaff,

    getInactiveStaff,

    getActiveStaffByProperty,

    getActiveStaffByRole,

    exists,

    updateStaff,

    changeStaffStatus,

    searchStaff,
  };
})();
