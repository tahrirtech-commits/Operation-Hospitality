/**

 * ============================================================================

 * 74_AdminReferenceService.gs

 * RENTAL OPERATIONS MVP

 * PHASE 6.7A - ADMIN REFERENCE / LOOKUP FACADE

 * ============================================================================

 *

 * Read-only application service for UI selectors and lookup data.

 *

 * RESPONSIBILITIES

 * - Properties for application context.

 * - Units scoped to a property.

 * - Customers for reservation workflows.

 * - Guests for reservation guest assignment.

 * - Active staff, optionally scoped by property and/or role.

 * - Active values from 00_ReferenceData.

 *

 * BOUNDARY

 * - READ ONLY.

 * - No creates, updates, deletes or status transitions.

 * - No generic repository method is exposed.

 * - Property / Unit / Customer / Staff reads delegate to their domain services.

 * - Guests and ReferenceData use narrow read-only repository access because the

 *   current frozen domain layer has no standalone GuestService / rich reference

 *   read model.

 *

 * ============================================================================

 */



const AdminReferenceService = (() => {



  const ACTIVE = 'ACTIVE';





  // ==========================================================================

  // HELPERS

  // ==========================================================================



  function isBlank(value) {

    return (

      value === undefined ||

      value === null ||

      String(value).trim() === ''

    );

  }





  function text(value) {

    return isBlank(value)

      ? ''

      : String(value).trim();

  }





  function upper(value) {

    return text(value).toUpperCase();

  }





  function normalizeBoolean(value) {

    if (value === true) {

      return true;

    }



    return (

      upper(value) === 'TRUE' ||

      text(value) === '1'

    );

  }





  function sortByLabel(rows) {

    return (rows || [])

      .slice()

      .sort((a, b) =>

        text(a.label)

          .localeCompare(

            text(b.label)

          )

      );

  }





  function requireProperty(propertyId) {

    propertyId = text(propertyId);



    if (!propertyId) {

      throw new Error(

        'property_id is required.'

      );

    }



    const property =

      PropertyService

        .getPropertyById(

          propertyId

        );



    if (!property) {

      throw new Error(

        'Property not found: ' +

        propertyId

      );

    }



    return property;

  }





  // ==========================================================================

  // MAPPERS

  // ==========================================================================



  function propertyOption(row) {

    return {

      property_id:

        text(row.property_id),



      property_code:

        text(row.property_code),



      name:

        text(row.name),



      property_type:

        text(row.property_type),



      status:

        upper(row.status),



      label:

        text(row.name) ||

        text(row.property_code) ||

        text(row.property_id)

    };

  }





  function unitOption(row) {

    return {

      unit_id:

        text(row.unit_id),



      property_id:

        text(row.property_id),



      unit_code:

        text(row.unit_code),



      unit_name:

        text(row.unit_name),



      unit_type:

        text(row.unit_type),



      status:

        upper(row.status),



      label:

        text(row.unit_name) ||

        text(row.unit_code) ||

        text(row.unit_id)

    };

  }





  function personName(row) {

    return (

      text(row.full_name) ||

      text(row.name) ||

      [

        text(row.first_name),

        text(row.last_name)

      ]

        .filter(Boolean)

        .join(' ') ||

      ''

    );

  }





  function customerOption(row) {

    const name =

      personName(row);



    return {

      customer_id:

        text(row.customer_id),



      first_name:

        text(row.first_name),



      last_name:

        text(row.last_name),



      email:

        text(row.email),



      phone:

        text(row.phone),



      status:

        upper(row.status),



      label:

        name ||

        text(row.email) ||

        text(row.phone) ||

        text(row.customer_id)

    };

  }





  function guestOption(row) {

    const name =

      personName(row);



    return {

      guest_id:

        text(row.guest_id),



      first_name:

        text(row.first_name),



      last_name:

        text(row.last_name),



      email:

        text(row.email),



      phone:

        text(row.phone),



      nationality:

        text(row.nationality),



      label:

        name ||

        text(row.email) ||

        text(row.phone) ||

        text(row.guest_id)

    };

  }





  function staffOption(row) {

    const name =

      personName(row);



    return {

      staff_id:

        text(row.staff_id),



      property_id:

        text(row.property_id),



      name:

        name,



      role:

        upper(row.role),



      phone:

        text(row.phone),



      email:

        text(row.email),



      status:

        upper(row.status),



      label:

        name ||

        text(row.staff_id)

    };

  }





  function referenceOption(row) {

    return {

      category:

        upper(row.category),



      code:

        upper(row.code),



      name:

        text(row.name),



      description:

        text(row.description),



      label:

        text(row.name) ||

        upper(row.code)

    };

  }





  // ==========================================================================

  // PROPERTIES

  // ==========================================================================



  function getProperties(options) {

    options = options || {};



    const activeOnly =

      options.active_only !== false;



    const rows =

      PropertyService

        .getAllProperties();



    return sortByLabel(

      rows

        .filter(row =>

          !activeOnly ||

          upper(row.status) === ACTIVE

        )

        .map(propertyOption)

    );

  }





  // ==========================================================================

  // UNITS

  // ==========================================================================



  function getUnits(propertyId, options) {

    options = options || {};



    const property =

      requireProperty(

        propertyId

      );



    const activeOnly =

      options.active_only !== false;



    const rows =

      UnitService

        .getUnitsByProperty(

          property.property_id

        );



    return sortByLabel(

      rows

        .filter(row =>

          !activeOnly ||

          upper(row.status) === ACTIVE

        )

        .map(unitOption)

    );

  }





  // ==========================================================================

  // CUSTOMERS

  // ==========================================================================



  function getCustomers(options) {

    options = options || {};



    const activeOnly =

      options.active_only !== false;



    const query =

      upper(

        options.query

      );



    let rows =

      CustomerService

        .getAllCustomers();



    if (activeOnly) {

      rows =

        rows.filter(row =>

          !text(row.status) ||

          upper(row.status) === ACTIVE

        );

    }



    if (query) {

      rows =

        rows.filter(row => {

          const haystack =

            [

              row.customer_id,

              row.first_name,

              row.last_name,

              row.full_name,

              row.email,

              row.phone

            ]

              .map(upper)

              .join(' ');



          return (

            haystack.indexOf(query) !== -1

          );

        });

    }



    return sortByLabel(

      rows.map(

        customerOption

      )

    );

  }





  // ==========================================================================

  // GUESTS

  // ==========================================================================



  function getGuests(options) {

    options = options || {};



    const query =

      upper(

        options.query

      );



    let rows =

      BaseRepository

        .findAll(

          CONFIG.SHEETS.GUESTS

        );



    if (query) {

      rows =

        rows.filter(row => {

          const haystack =

            [

              row.guest_id,

              row.first_name,

              row.last_name,

              row.full_name,

              row.email,

              row.phone,

              row.nationality

            ]

              .map(upper)

              .join(' ');



          return (

            haystack.indexOf(query) !== -1

          );

        });

    }



    return sortByLabel(

      rows.map(

        guestOption

      )

    );

  }





  // ==========================================================================

  // STAFF

  // ==========================================================================



  function getStaff(options) {

    options = options || {};



    const propertyId =

      text(

        options.property_id

      );



    const role =

      upper(

        options.role

      );



    let rows =

      StaffService

        .getActiveStaff();



    if (propertyId) {

      requireProperty(

        propertyId

      );



      rows =

        rows.filter(row =>

          text(row.property_id) ===

          propertyId

        );

    }



    if (role) {

      rows =

        rows.filter(row =>

          upper(row.role) ===

          role

        );

    }



    return sortByLabel(

      rows.map(

        staffOption

      )

    );

  }





  // ==========================================================================

  // REFERENCE DATA

  // ==========================================================================



  function getReferenceValues(category) {

    category =

      upper(category);



    if (!category) {

      throw new Error(

        'category is required.'

      );

    }



    const rows =

      BaseRepository

        .findByField(

          CONFIG.SHEETS

            .REFERENCE_DATA,

          'category',

          category

        )

        .filter(row =>

          normalizeBoolean(

            row.active

          )

        )

        .map(

          referenceOption

        );



    return sortByLabel(

      rows

    );

  }





  function getReferenceBundle(categories) {

    if (!Array.isArray(categories)) {

      throw new Error(

        'categories must be an array.'

      );

    }



    const result = {};



    categories

      .map(upper)

      .filter(Boolean)

      .filter(

        (value, index, all) =>

          all.indexOf(value) === index

      )

      .forEach(category => {

        result[category] =

          getReferenceValues(

            category

          );

      });



    return result;

  }





  // ==========================================================================

  // BOOTSTRAP

  // ==========================================================================



  /**

   * Lightweight application bootstrap for the admin shell.

   *

   * Keeps the initial property selector to one API call.

   * Additional screen-specific lookups remain lazy-loaded.

   */

  function getBootstrap() {
    const properties = getProperties({
      active_only: true
    });

    // Performance Patch 1:
    // Read active units once and choose the first active property that actually
    // owns active inventory. This removes browser-side reference.units probing
    // once per property during application startup.
    const activeUnits = UnitService.getActiveUnits();
    const propertyIdsWithUnits = new Set(
      (activeUnits || [])
        .map(unit => text(unit.property_id))
        .filter(Boolean)
    );

    const operationalProperty =
      properties.find(property =>
        propertyIdsWithUnits.has(
          text(property.property_id)
        )
      );

    return {
      properties: properties,
      default_property_id:
        operationalProperty
          ? operationalProperty.property_id
          : (
              properties.length > 0
                ? properties[0].property_id
                : ''
            )
    };
  }





  // ==========================================================================

  // PUBLIC API

  // ==========================================================================



  return {

    getBootstrap,

    getProperties,

    getUnits,

    getCustomers,

    getGuests,

    getStaff,

    getReferenceValues,

    getReferenceBundle

  };



})();
