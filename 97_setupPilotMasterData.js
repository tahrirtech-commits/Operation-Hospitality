/**
 * ============================================================================
 * 97_setupPilotMasterData.js
 * RENTAL OPERATIONS MVP
 * ============================================================================
 *
 * Idempotent bootstrap for the first real PILOT master-data set.
 *
 * Creates, when missing:
 * - Somabay location
 * - Somabreeze property
 * - Somabreeze 1BR Sea View unit
 * - Initial READY operational status (created automatically by UnitService)
 * - Mohamed Elersh ADMIN staff record
 *
 * Existing records are reused and never overwritten.
 * Run only after setupPilotDatabase().
 * ============================================================================
 */

function setupPilotMasterData() {
  const actorId = CONFIG.DEFAULTS.ACTOR_ID || 'SYSTEM';
  const report = {
    location: null,
    property: null,
    unit: null,
    operational_status: null,
    staff: null,
    integrity: null
  };

  // --------------------------------------------------------------------------
  // 1. Location
  // No LocationService currently exists, so use repository + ID + audit layer.
  // Natural key for this pilot bootstrap: name + city + country.
  // --------------------------------------------------------------------------
  const locations = BaseRepository.findAll(CONFIG.SHEETS.LOCATIONS);
  let location = locations.find(row =>
    normalizePilotText_(row.name) === 'SOMABAY' &&
    normalizePilotText_(row.city) === 'SAFAGA' &&
    normalizePilotText_(row.country) === 'EGYPT'
  );

  if (!location) {
    location = {
      location_id: IdService.nextId('LOCATION'),
      name: 'Somabay',
      city: 'Safaga',
      region: 'Red Sea',
      country: 'Egypt',
      latitude: '',
      longitude: '',
      active: true,
      notes: 'Somabay resort destination'
    };

    location = BaseRepository.insert(CONFIG.SHEETS.LOCATIONS, location);

    AuditService.logCreate(
      'LOCATION',
      location.location_id,
      location,
      actorId
    );

    report.location = { action: 'CREATED', record: location };
  } else {
    report.location = { action: 'REUSED', record: location };
  }

  // --------------------------------------------------------------------------
  // 2. Property
  // PropertyService persists "name", while current ValidationService requires
  // "property_name" during create. Supplying both keeps this bootstrap compatible
  // without bypassing PropertyService validation.
  // --------------------------------------------------------------------------
  let property = PropertyService.getPropertyByCode('SOMABREEZE');

  if (!property) {
    property = PropertyService.createProperty(
      {
        property_code: 'SOMABREEZE',
        name: 'Somabreeze Apartment',
        property_name: 'Somabreeze Apartment',
        property_type: 'APARTMENT',
        location_id: location.location_id,
        address: 'Somabreeze, Somabay',
        city: 'Safaga',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        currency: 'EGP',
        check_in_time: '15:00',
        check_out_time: '11:00',
        min_nights: 2,
        max_nights: 30,
        status: 'ACTIVE',
        notes: 'Serviced holiday apartment in Somabay'
      },
      actorId
    );

    report.property = { action: 'CREATED', record: property };
  } else {
    report.property = { action: 'REUSED', record: property };
  }

  // --------------------------------------------------------------------------
  // 3. Unit
  // UnitService automatically creates the initial operational-status row.
  // --------------------------------------------------------------------------
  let unit = UnitService.getUnitByCode('SOMABREEZE-01');

  if (!unit) {
    unit = UnitService.createUnit(
      {
        property_id: property.property_id,
        unit_code: 'SOMABREEZE-01',
        unit_name: 'Somabreeze 1BR Sea View',
        unit_type: 'ONE_BEDROOM',
        bedrooms: 1,
        bathrooms: 1,
        max_guests: 4,
        floor: '',
        view_type: 'SEA_VIEW',
        status: 'ACTIVE',
        notes: '80 m² one-bedroom sea-view apartment'
      },
      actorId
    );

    report.unit = { action: 'CREATED', record: unit };
  } else {
    if (String(unit.property_id || '').trim() !== String(property.property_id).trim()) {
      throw new Error(
        'PILOT_DATA_CONFLICT: SOMABREEZE-01 already belongs to another property.'
      );
    }

    report.unit = { action: 'REUSED', record: unit };
  }

  // --------------------------------------------------------------------------
  // 4. Operational status
  // UnitService.createUnit() normally creates this automatically.
  // Repair a missing status only; never overwrite an existing status.
  // --------------------------------------------------------------------------
  let operationalStatus = OperationalStatusService.getStatus(unit.unit_id);

  if (!operationalStatus) {
    operationalStatus = OperationalStatusService.createInitialStatus(
      unit.unit_id,
      actorId
    );

    report.operational_status = {
      action: 'CREATED',
      record: operationalStatus
    };
  } else {
    report.operational_status = {
      action: 'REUSED',
      record: operationalStatus
    };
  }

  // --------------------------------------------------------------------------
  // 5. Pilot admin
  // Phone/email are intentionally blank. With no stable contact identifier,
  // identify this bootstrap record by exact name + property + ADMIN role.
  // --------------------------------------------------------------------------
  const staffRows = StaffService.getAllStaff();
  let staff = staffRows.find(row =>
    normalizePilotText_(row.name) === 'MOHAMED ELERSH' &&
    String(row.property_id || '').trim() === String(property.property_id).trim() &&
    normalizePilotText_(row.role) === 'ADMIN'
  );

  if (!staff) {
    staff = StaffService.createStaff(
      {
        name: 'Mohamed Elersh',
        role: 'ADMIN',
        property_id: property.property_id,
        phone: '',
        email: '',
        status: 'ACTIVE'
      },
      actorId
    );

    report.staff = { action: 'CREATED', record: staff };
  } else {
    report.staff = { action: 'REUSED', record: staff };
  }

  // --------------------------------------------------------------------------
  // 6. Final integrity verification
  // --------------------------------------------------------------------------
  if (
    typeof IntegrityCheckService !== 'undefined' &&
    IntegrityCheckService &&
    typeof IntegrityCheckService.runAll === 'function'
  ) {
    report.integrity = IntegrityCheckService.runAll();

    if (report.integrity && report.integrity.passed === false) {
      throw new Error(
        'Pilot master data was created, but IntegrityCheckService reported ' +
        String(report.integrity.errors || 0) + ' error(s).'
      );
    }
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function normalizePilotText_(value) {
  return String(value || '').trim().toUpperCase();
}
