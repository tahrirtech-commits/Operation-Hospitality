/**
 * ============================================================
 * 12_CustomerService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Domain service for Customers.
 *
 * Responsibilities:
 *
 * - Create customers
 * - Read/search customers
 * - Update customers
 * - Change customer master status
 *
 * Customer data is stored in:
 *
 * 07_Customers
 *
 * Expected important columns:
 *
 * customer_id
 * first_name
 * last_name
 * email
 * phone
 * nationality
 * status
 * created_at
 * updated_at
 *
 * IMPORTANT:
 *
 * Customer != Guest.
 *
 * Customer:
 *   Person responsible for the reservation / commercial
 *   relationship.
 *
 * Guest:
 *   Person staying in the unit.
 *
 * One customer may later have multiple reservations and each
 * reservation may contain multiple guests.
 *
 * ============================================================
 */

const CustomerService = (() => {

  const ENTITY_TYPE =
    'CUSTOMER';

  const DEFAULT_STATUS =
    CONFIG.DEFAULTS.CUSTOMER_STATUS || 'ACTIVE';


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
   * NORMALIZE ACTOR
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
   * NORMALIZE CUSTOMER
   * ----------------------------------------------------------
   */

  function normalizeCustomer(data) {

    const customer =
      Object.assign(
        {},
        data || {}
      );


    if (
      customer.first_name !== undefined &&
      customer.first_name !== null
    ) {

      customer.first_name =
        String(
          customer.first_name
        ).trim();

    }


    if (
      customer.last_name !== undefined &&
      customer.last_name !== null
    ) {

      customer.last_name =
        String(
          customer.last_name
        ).trim();

    }


    if (
      customer.email !== undefined &&
      customer.email !== null
    ) {

      customer.email =
        String(
          customer.email
        )
          .trim()
          .toLowerCase();

    }


    if (
      customer.phone !== undefined &&
      customer.phone !== null
    ) {

      customer.phone =
        String(
          customer.phone
        ).trim();

    }


    if (
      customer.nationality !== undefined &&
      customer.nationality !== null
    ) {

      customer.nationality =
        String(
          customer.nationality
        )
          .trim()
          .toUpperCase();

    }


    if (
      customer.status !== undefined &&
      customer.status !== null
    ) {

      customer.status =
        String(
          customer.status
        )
          .trim()
          .toUpperCase();

    }


    return customer;

  }


  /**
   * ----------------------------------------------------------
   * REQUIRE CUSTOMER
   * ----------------------------------------------------------
   *
   * Unlike getCustomerById(), this method throws when the
   * customer does not exist.
   */

  function requireCustomer(customerId) {

    if (
      customerId === undefined ||
      customerId === null ||
      String(customerId).trim() === ''
    ) {

      throw new Error(
        'customerId is required.'
      );

    }


    const normalizedId =
      String(customerId).trim();


    const customer =
      BaseRepository.findById(
        CONFIG.SHEETS.CUSTOMERS,
        'customer_id',
        normalizedId
      );


    if (!customer) {

      throw new Error(
        'Customer not found: ' +
        normalizedId
      );

    }


    return customer;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE CUSTOMER UPDATE
   * ----------------------------------------------------------
   */

  function validateUpdate(customer) {

    ValidationService.requireFields(
      customer,
      [
        'customer_id',
        'first_name',
        'last_name'
      ]
    );


    /*
     * A customer must have at least one usable contact method.
     */

    if (
      ValidationService.isBlank(
        customer.email
      ) &&
      ValidationService.isBlank(
        customer.phone
      )
    ) {

      throw new Error(
        'Customer must have at least an email or phone number.'
      );

    }


    /*
     * Email
     */

    if (
      !ValidationService.isBlank(
        customer.email
      )
    ) {

      ValidationService.validateEmail(
        customer.email
      );


      ValidationService.validateUniqueExcept(
        CONFIG.SHEETS.CUSTOMERS,
        'email',
        customer.email,
        'customer_id',
        customer.customer_id,
        'Customer email'
      );

    }


    /*
     * Phone
     */

    if (
      !ValidationService.isBlank(
        customer.phone
      )
    ) {

      ValidationService.validateUniqueExcept(
        CONFIG.SHEETS.CUSTOMERS,
        'phone',
        customer.phone,
        'customer_id',
        customer.customer_id,
        'Customer phone'
      );

    }


    /*
     * Customer master status.
     */

    if (
      !ValidationService.isBlank(
        customer.status
      )
    ) {

      ValidationService
        .validateActiveInactiveStatus(
          customer.status,
          'Customer status'
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
   * CREATE CUSTOMER
   * ----------------------------------------------------------
   *
   * Flow:
   *
   * Input
   *   ↓
   * Normalize
   *   ↓
   * Default status
   *   ↓
   * Validate
   *   ↓
   * Generate ID
   *   ↓
   * Insert
   *   ↓
   * Audit
   */

  function createCustomer(
    data,
    actorId
  ) {

    if (
      !data ||
      typeof data !== 'object'
    ) {

      throw new Error(
        'Customer data is required.'
      );

    }


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    let customer =
      normalizeCustomer(
        data
      );


    /*
     * Apply default status before validation.
     */

    if (
      ValidationService.isBlank(
        customer.status
      )
    ) {

      customer.status =
        DEFAULT_STATUS;

    }


    /*
     * IMPORTANT:
     *
     * Validation occurs before ID generation.
     */

    ValidationService
      .validateCustomerCreate(
        customer
      );


    customer.customer_id =
      IdService.nextId(
        ENTITY_TYPE
      );


    const now =
      timestamp();


    customer.created_at =
      customer.created_at || now;


    customer.updated_at =
      now;


    const inserted =
      BaseRepository.insert(
        CONFIG.SHEETS.CUSTOMERS,
        customer
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.customer_id,
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
   * GET CUSTOMER BY ID
   * ----------------------------------------------------------
   *
   * Returns null if not found.
   */

  function getCustomerById(
    customerId
  ) {

    if (
      customerId === undefined ||
      customerId === null ||
      String(customerId).trim() === ''
    ) {

      throw new Error(
        'customerId is required.'
      );

    }


    return BaseRepository.findById(
      CONFIG.SHEETS.CUSTOMERS,
      'customer_id',
      String(customerId).trim()
    );

  }


  /**
   * ----------------------------------------------------------
   * GET CUSTOMER BY EMAIL
   * ----------------------------------------------------------
   */

  function getCustomerByEmail(
    email
  ) {

    if (
      email === undefined ||
      email === null ||
      String(email).trim() === ''
    ) {

      return null;

    }


    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();


    return BaseRepository.findOneByField(
      CONFIG.SHEETS.CUSTOMERS,
      'email',
      normalizedEmail
    );

  }


  /**
   * ----------------------------------------------------------
   * GET CUSTOMER BY PHONE
   * ----------------------------------------------------------
   */

  function getCustomerByPhone(
    phone
  ) {

    if (
      phone === undefined ||
      phone === null ||
      String(phone).trim() === ''
    ) {

      return null;

    }


    return BaseRepository.findOneByField(
      CONFIG.SHEETS.CUSTOMERS,
      'phone',
      String(phone).trim()
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ALL CUSTOMERS
   * ----------------------------------------------------------
   */

  function getAllCustomers() {

    return BaseRepository.findAll(
      CONFIG.SHEETS.CUSTOMERS
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ACTIVE CUSTOMERS
   * ----------------------------------------------------------
   */

  function getActiveCustomers() {

    return BaseRepository.findByField(
      CONFIG.SHEETS.CUSTOMERS,
      'status',
      'ACTIVE'
    );

  }


  /**
   * ----------------------------------------------------------
   * GET INACTIVE CUSTOMERS
   * ----------------------------------------------------------
   */

  function getInactiveCustomers() {

    return BaseRepository.findByField(
      CONFIG.SHEETS.CUSTOMERS,
      'status',
      'INACTIVE'
    );

  }


  /**
   * ----------------------------------------------------------
   * CUSTOMER EXISTS
   * ----------------------------------------------------------
   */

  function exists(customerId) {

    if (
      customerId === undefined ||
      customerId === null ||
      String(customerId).trim() === ''
    ) {

      return false;

    }


    return BaseRepository.exists(
      CONFIG.SHEETS.CUSTOMERS,
      'customer_id',
      String(customerId).trim()
    );

  }


  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * UPDATE CUSTOMER
   * ----------------------------------------------------------
   *
   * Protected fields:
   *
   * customer_id
   * created_at
   */

  function updateCustomer(
    customerId,
    changes,
    actorId
  ) {

    if (
      !changes ||
      typeof changes !== 'object'
    ) {

      throw new Error(
        'Customer changes are required.'
      );

    }


    const existing =
      requireCustomer(
        customerId
      );


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    /*
     * Merge current persisted state with requested changes.
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

    updated.customer_id =
      existing.customer_id;


    updated.created_at =
      existing.created_at;


    updated =
      normalizeCustomer(
        updated
      );


    validateUpdate(
      updated
    );


    updated.updated_at =
      timestamp();


    const persisted =
      BaseRepository.update(
        CONFIG.SHEETS.CUSTOMERS,
        'customer_id',
        existing.customer_id,
        updated
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      existing.customer_id,
      existing,
      persisted,
      normalizedActorId
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
   * CHANGE CUSTOMER STATUS
   * ----------------------------------------------------------
   *
   * Customer master status:
   *
   * ACTIVE
   * INACTIVE
   */

  function changeCustomerStatus(
    customerId,
    newStatus,
    actorId
  ) {

    const existing =
      requireCustomer(
        customerId
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
        'Customer status'
      );


    /*
     * Avoid unnecessary write/audit when there is no change.
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


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    const persisted =
      BaseRepository.update(
        CONFIG.SHEETS.CUSTOMERS,
        'customer_id',
        existing.customer_id,
        {

          status:
            normalizedStatus,

          updated_at:
            timestamp()

        }
      );


    AuditService.logStatusChange(
      ENTITY_TYPE,
      existing.customer_id,
      existing.status,
      normalizedStatus,
      normalizedActorId
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
   * SEARCH CUSTOMERS
   * ----------------------------------------------------------
   *
   * Simple Phase 1 search across:
   *
   * first_name
   * last_name
   * email
   * phone
   *
   * Intended for small/medium MVP datasets.
   *
   * Later, if customer volume becomes large, searching should
   * move to a more scalable persistence/search mechanism.
   */

  function searchCustomers(
    searchText
  ) {

    if (
      searchText === undefined ||
      searchText === null ||
      String(searchText).trim() === ''
    ) {

      return [];

    }


    const query =
      String(searchText)
        .trim()
        .toLowerCase();


    return getAllCustomers()
      .filter(
        customer => {

          const values = [

            customer.first_name,

            customer.last_name,

            customer.email,

            customer.phone

          ];


          return values.some(
            value => {

              if (
                value === undefined ||
                value === null
              ) {

                return false;

              }


              return String(value)
                .toLowerCase()
                .includes(
                  query
                );

            }
          );

        }
      );

  }


  /**
   * ----------------------------------------------------------
   * GET DISPLAY NAME
   * ----------------------------------------------------------
   */

  function getDisplayName(
    customer
  ) {

    if (!customer) {

      return '';

    }


    return [
      customer.first_name,
      customer.last_name
    ]
      .filter(
        value =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== ''
      )
      .map(
        value =>
          String(value).trim()
      )
      .join(' ');

  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {

    createCustomer,

    getCustomerById,

    getCustomerByEmail,

    getCustomerByPhone,

    getAllCustomers,

    getActiveCustomers,

    getInactiveCustomers,

    exists,

    updateCustomer,

    changeCustomerStatus,

    searchCustomers,

    getDisplayName

  };

})();