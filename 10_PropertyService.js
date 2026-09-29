/**
 * ============================================================
 * 10_PropertyService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Domain service for Properties.
 *
 * Data source:
 *
 * 01_Properties
 *
 * Responsibilities:
 *
 * - Create properties
 * - Read properties
 * - Update properties
 * - Change property master status
 * - Validate property type
 * - Validate location FK
 * - Enforce property_code uniqueness
 * - Validate min/max night rules
 *
 * Property master status:
 *
 * ACTIVE
 * INACTIVE
 *
 * ============================================================
 */

const PropertyService = (() => {

  const ENTITY_TYPE =
    'PROPERTY';

  const DEFAULT_STATUS =
    CONFIG.DEFAULTS.PROPERTY_STATUS || 'ACTIVE';


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
      CONFIG.DATE_FORMATS.DATETIME
    );

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE ACTOR ID
   * ----------------------------------------------------------
   */

  function normalizeActorId(actorId) {

    if (
      actorId === undefined ||
      actorId === null ||
      String(actorId).trim() === ''
    ) {

      return CONFIG.DEFAULTS.ACTOR_ID;

    }


    return String(actorId).trim();

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE PROPERTY
   * ----------------------------------------------------------
   */

  function normalizeProperty(data) {

    const property =
      Object.assign(
        {},
        data || {}
      );


    if (
      property.property_code !== undefined &&
      property.property_code !== null
    ) {

      property.property_code =
        String(
          property.property_code
        )
          .trim()
          .toUpperCase();

    }


    if (
      property.name !== undefined &&
      property.name !== null
    ) {

      property.name =
        String(
          property.name
        ).trim();

    }


    if (
      property.property_type !== undefined &&
      property.property_type !== null
    ) {

      property.property_type =
        String(
          property.property_type
        )
          .trim()
          .toUpperCase();

    }


    if (
      property.location_id !== undefined &&
      property.location_id !== null
    ) {

      property.location_id =
        String(
          property.location_id
        ).trim();

    }


    if (
      property.status !== undefined &&
      property.status !== null
    ) {

      property.status =
        String(
          property.status
        )
          .trim()
          .toUpperCase();

    }


    return property;

  }


  /**
   * ----------------------------------------------------------
   * REQUIRE PROPERTY
   * ----------------------------------------------------------
   */

  function requireProperty(propertyId) {

    if (
      propertyId === undefined ||
      propertyId === null ||
      String(propertyId).trim() === ''
    ) {

      throw new Error(
        'propertyId is required.'
      );

    }


    const normalizedId =
      String(
        propertyId
      ).trim();


    const property =
      BaseRepository.findById(
        CONFIG.SHEETS.PROPERTIES,
        'property_id',
        normalizedId
      );


    if (!property) {

      throw new Error(
        'Property not found: ' +
        normalizedId
      );

    }


    return property;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE NIGHT LIMITS
   * ----------------------------------------------------------
   */

  function validateNightLimits(property) {

    if (
      property.min_nights !== undefined &&
      property.min_nights !== null &&
      property.min_nights !== ''
    ) {

      ValidationService
        .validatePositiveNumber(
          property.min_nights,
          'min_nights'
        );

    }


    if (
      property.max_nights !== undefined &&
      property.max_nights !== null &&
      property.max_nights !== ''
    ) {

      ValidationService
        .validatePositiveNumber(
          property.max_nights,
          'max_nights'
        );

    }


    if (
      property.min_nights !== undefined &&
      property.min_nights !== null &&
      property.min_nights !== '' &&

      property.max_nights !== undefined &&
      property.max_nights !== null &&
      property.max_nights !== ''
    ) {

      if (
        Number(
          property.max_nights
        ) <
        Number(
          property.min_nights
        )
      ) {

        throw new Error(
          'max_nights cannot be less than min_nights.'
        );

      }

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE PROPERTY UPDATE
   * ----------------------------------------------------------
   */

  function validateUpdate(property) {

    ValidationService.requireFields(
      property,
      [
        'property_id',
        'property_code',
        'name',
        'property_type',
        'location_id',
        'status'
      ]
    );


    /*
     * Property type.
     */

    ValidationService
      .validateReference(
        'PROPERTY_TYPE',
        property.property_type
      );


    /*
     * Location FK.
     */

    ValidationService
      .validateLocationExists(
        property.location_id
      );


    /*
     * Property master status.
     */

    ValidationService
      .validateActiveInactiveStatus(
        property.status,
        'Property status'
      );


    /*
     * Property code uniqueness,
     * excluding current property.
     */

    ValidationService
      .validateUniqueExcept(
        CONFIG.SHEETS.PROPERTIES,
        'property_code',
        property.property_code,
        'property_id',
        property.property_id,
        'Property code'
      );


    /*
     * Stay limits.
     */

    validateNightLimits(
      property
    );


    return true;

  }


  /**
   * ==========================================================
   * CREATE
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * CREATE PROPERTY
   * ----------------------------------------------------------
   */

  function createProperty(
    data,
    actorId
  ) {

    if (
      !data ||
      typeof data !== 'object'
    ) {

      throw new Error(
        'Property data must be an object.'
      );

    }


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    let property =
      normalizeProperty(
        data
      );


    /*
     * Default master status.
     */

    if (
      ValidationService.isBlank(
        property.status
      )
    ) {

      property.status =
        DEFAULT_STATUS;

    }


    /*
     * Validate BEFORE consuming an ID.
     */

    ValidationService
      .validatePropertyCreate(
        property
      );


    /*
     * Preserve original PropertyService
     * min/max nights validation.
     */

    validateNightLimits(
      property
    );


    /*
     * Generate stable ID.
     */

    property.property_id =
      IdService.nextId(
        ENTITY_TYPE
      );


    const now =
      timestamp();


    property.created_at =
      now;


    property.updated_at =
      now;


    /*
     * Persist.
     */

    const inserted =
      BaseRepository.insert(
        CONFIG.SHEETS.PROPERTIES,
        property
      );


    /*
     * Audit.
     */

    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.property_id,
      inserted,
      normalizedActorId
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
   * GET PROPERTY BY ID
   * ----------------------------------------------------------
   *
   * Returns null when property does not exist.
   */

  function getPropertyById(propertyId) {

    if (
      propertyId === undefined ||
      propertyId === null ||
      String(propertyId).trim() === ''
    ) {

      throw new Error(
        'propertyId is required.'
      );

    }


    return BaseRepository.findById(
      CONFIG.SHEETS.PROPERTIES,
      'property_id',
      String(propertyId).trim()
    );

  }


  /**
   * ----------------------------------------------------------
   * GET PROPERTY BY CODE
   * ----------------------------------------------------------
   */

  function getPropertyByCode(
    propertyCode
  ) {

    if (
      propertyCode === undefined ||
      propertyCode === null ||
      String(propertyCode).trim() === ''
    ) {

      throw new Error(
        'propertyCode is required.'
      );

    }


    return BaseRepository.findOneByField(
      CONFIG.SHEETS.PROPERTIES,
      'property_code',
      String(propertyCode)
        .trim()
        .toUpperCase()
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ALL PROPERTIES
   * ----------------------------------------------------------
   */

  function getAllProperties() {

    return BaseRepository.findAll(
      CONFIG.SHEETS.PROPERTIES
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ACTIVE PROPERTIES
   * ----------------------------------------------------------
   */

  function getActiveProperties() {

    return BaseRepository.findByField(
      CONFIG.SHEETS.PROPERTIES,
      'status',
      'ACTIVE'
    );

  }


  /**
   * ----------------------------------------------------------
   * GET INACTIVE PROPERTIES
   * ----------------------------------------------------------
   */

  function getInactiveProperties() {

    return BaseRepository.findByField(
      CONFIG.SHEETS.PROPERTIES,
      'status',
      'INACTIVE'
    );

  }


  /**
   * ----------------------------------------------------------
   * PROPERTY EXISTS
   * ----------------------------------------------------------
   */

  function exists(propertyId) {

    if (
      propertyId === undefined ||
      propertyId === null ||
      String(propertyId).trim() === ''
    ) {

      return false;

    }


    return BaseRepository.exists(
      CONFIG.SHEETS.PROPERTIES,
      'property_id',
      String(propertyId).trim()
    );

  }


  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * UPDATE PROPERTY
   * ----------------------------------------------------------
   */

  function updateProperty(
    propertyId,
    changes,
    actorId
  ) {

    if (
      !changes ||
      typeof changes !== 'object'
    ) {

      throw new Error(
        'changes must be an object.'
      );

    }


    const existing =
      requireProperty(
        propertyId
      );


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    /*
     * Prevent attempts to change the stable ID.
     */

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          changes,
          'property_id'
        ) &&
      String(
        changes.property_id
      ).trim() !==
      String(
        existing.property_id
      ).trim()
    ) {

      throw new Error(
        'property_id cannot be changed.'
      );

    }


    /*
     * Merge existing state with changes.
     */

    let updated =
      Object.assign(
        {},
        existing,
        changes
      );


    /*
     * Protect immutable fields.
     */

    updated.property_id =
      existing.property_id;


    updated.created_at =
      existing.created_at;


    /*
     * Normalize resulting record.
     */

    updated =
      normalizeProperty(
        updated
      );


    /*
     * Validate complete resulting state.
     */

    validateUpdate(
      updated
    );


    updated.updated_at =
      timestamp();


    /*
     * Persist.
     */

    const persisted =
      BaseRepository.update(
        CONFIG.SHEETS.PROPERTIES,
        'property_id',
        existing.property_id,
        updated
      );


    /*
     * Audit status transitions separately.
     */

    const oldStatus =
      String(
        existing.status || ''
      )
        .trim()
        .toUpperCase();


    const newStatus =
      String(
        persisted.status || ''
      )
        .trim()
        .toUpperCase();


    if (
      oldStatus !==
      newStatus
    ) {

      AuditService.logStatusChange(
        ENTITY_TYPE,
        existing.property_id,
        existing.status,
        persisted.status,
        normalizedActorId
      );

    } else {

      AuditService.logUpdate(
        ENTITY_TYPE,
        existing.property_id,
        existing,
        persisted,
        normalizedActorId
      );

    }


    return persisted;

  }


  /**
   * ==========================================================
   * STATUS MANAGEMENT
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * CHANGE PROPERTY STATUS
   * ----------------------------------------------------------
   *
   * Changes:
   *
   * 01_Properties.status
   *
   * Valid Phase 1 values:
   *
   * ACTIVE
   * INACTIVE
   */

  function changePropertyStatus(
    propertyId,
    newStatus,
    actorId
  ) {

    const existing =
      requireProperty(
        propertyId
      );


    const normalizedStatus =
      String(
        newStatus || ''
      )
        .trim()
        .toUpperCase();


    ValidationService
      .validateActiveInactiveStatus(
        normalizedStatus,
        'Property status'
      );


    /*
     * Avoid unnecessary write/audit event.
     */

    if (
      String(
        existing.status || ''
      )
        .trim()
        .toUpperCase() ===
      normalizedStatus
    ) {

      return existing;

    }


    return updateProperty(
      existing.property_id,
      {
        status:
          normalizedStatus
      },
      actorId
    );

  }


  /**
   * ==========================================================
   * RELATIONSHIP HELPERS
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * GET PROPERTY UNITS
   * ----------------------------------------------------------
   */

  function getPropertyUnits(
    propertyId
  ) {

    requireProperty(
      propertyId
    );


    return BaseRepository.findByField(
      CONFIG.SHEETS.UNITS,
      'property_id',
      String(propertyId).trim()
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ACTIVE PROPERTY UNITS
   * ----------------------------------------------------------
   */

  function getActivePropertyUnits(
    propertyId
  ) {

    return getPropertyUnits(
      propertyId
    )
      .filter(
        unit =>
          String(
            unit.status || ''
          )
            .trim()
            .toUpperCase() ===
          'ACTIVE'
      );

  }


  /**
   * ----------------------------------------------------------
   * GET PROPERTY STAFF
   * ----------------------------------------------------------
   */

  function getPropertyStaff(
    propertyId
  ) {

    requireProperty(
      propertyId
    );


    return BaseRepository.findByField(
      CONFIG.SHEETS.STAFF,
      'property_id',
      String(propertyId).trim()
    );

  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {

    createProperty,

    getPropertyById,

    getPropertyByCode,

    getAllProperties,

    getActiveProperties,

    getInactiveProperties,

    exists,

    updateProperty,

    changePropertyStatus,

    getPropertyUnits,

    getActivePropertyUnits,

    getPropertyStaff

  };

})();