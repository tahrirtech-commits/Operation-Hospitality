/**
 * ============================================================================
 * 97_setupPilotReservation.js
 * RENTAL OPERATIONS MVP
 * ============================================================================
 * Controlled, idempotent first PILOT booking-path validation.
 *
 * Flow:
 * Availability -> Customer -> Guest -> DIRECT Reservation -> Guest assignment
 * -> OTA block work records -> Confirmation -> Integrity check
 *
 * Fixed test stay: 2026-10-20 to 2026-10-22 (checkout-exclusive).
 * Re-running reuses the reservation identified by PILOT-FIRST-RESERVATION.
 * ============================================================================
 */

function setupPilotReservation() {
  const actorId = CONFIG.DEFAULTS.ACTOR_ID || 'SYSTEM';
  const checkIn = '2026-10-20';
  const checkOut = '2026-10-22';
  const marker = 'PILOT-FIRST-RESERVATION';
  const report = {};

  const unit = UnitService.getUnitByCode('SOMABREEZE-01');
  if (!unit) {
    throw new Error('Pilot unit SOMABREEZE-01 not found. Run setupPilotMasterData() first.');
  }

  // Reuse an existing pilot reservation before checking availability.
  let reservation = ReservationService.getAll().find(row =>
    String(row.unit_id || '').trim() === String(unit.unit_id).trim() &&
    String(row.check_in_date || '').slice(0, 10) === checkIn &&
    String(row.check_out_date || '').slice(0, 10) === checkOut &&
    String(row.notes || '').indexOf(marker) >= 0
  );

  if (reservation) {
    report.reservation = { action: 'REUSED', record: reservation };
    report.workflow = ReservationWorkflowService.getReservationWorkflow(
      reservation.reservation_id
    );
    report.integrity = IntegrityCheckService.runAll();
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  // 1. Availability must pass before any booking data is created.
  const availability = AvailabilityService.checkAvailability(
    unit.unit_id,
    checkIn,
    checkOut
  );
  report.availability = availability;

  if (!availability.available) {
    throw new Error(
      'Pilot reservation window is unavailable: ' +
      JSON.stringify(availability.reasons || [])
    );
  }

  // 2. Customer via domain service.
  const customerEmail = 'pilot.guest@example.com';
  let customer = CustomerService.getCustomerByEmail(customerEmail);

  if (!customer) {
    customer = CustomerService.createCustomer(
      {
        first_name: 'Pilot',
        last_name: 'Guest',
        email: customerEmail,
        phone: '',
        nationality: 'Egyptian',
        status: 'ACTIVE'
      },
      actorId
    );
    report.customer = { action: 'CREATED', record: customer };
  } else {
    report.customer = { action: 'REUSED', record: customer };
  }

  // 3. Guest. There is currently no GuestService, so use repository + ID + audit.
  const guests = BaseRepository.findAll(CONFIG.SHEETS.GUESTS);
  let guest = guests.find(row =>
    String(row.email || '').trim().toLowerCase() === customerEmail
  );

  if (!guest) {
    guest = {
      guest_id: IdService.nextId('GUEST'),
      first_name: 'Pilot',
      last_name: 'Guest',
      email: customerEmail,
      phone: '',
      nationality: 'Egyptian',
      id_type: '',
      id_number: '',
      date_of_birth: '',
      created_at: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMATS.DATETIME),
      updated_at: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMATS.DATETIME)
    };

    guest = BaseRepository.insert(CONFIG.SHEETS.GUESTS, guest);
    AuditService.logCreate('GUEST', guest.guest_id, guest, actorId);
    report.guest = { action: 'CREATED', record: guest };
  } else {
    report.guest = { action: 'REUSED', record: guest };
  }

  // 4. Create DIRECT reservation through the workflow.
  const created = ReservationWorkflowService.createDirectReservation(
    {
      unit_id: unit.unit_id,
      customer_id: customer.customer_id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: 1,
      children: 0,
      status: 'PENDING',
      notes: marker + ' - controlled pilot booking-path validation'
    },
    [
      {
        guest_id: guest.guest_id,
        role: 'PRIMARY'
      }
    ],
    ['AIRBNB', 'BOOKING_COM'],
    actorId
  );

  reservation = created.reservation;
  report.create_workflow = created;

  // 5. Confirm through the workflow service, then re-read authoritative state.
  ReservationWorkflowService.confirmReservation(
    reservation.reservation_id,
    actorId
  );

  reservation = ReservationService.getById(reservation.reservation_id);

  if (String(reservation.status || '').trim().toUpperCase() !== 'CONFIRMED') {
    throw new Error(
      'Pilot reservation confirmation failed for ' + reservation.reservation_id
    );
  }

  report.reservation = { action: 'CREATED_AND_CONFIRMED', record: reservation };
  report.workflow = ReservationWorkflowService.getReservationWorkflow(
    reservation.reservation_id
  );

  // 6. Final integrity verification.
  report.integrity = IntegrityCheckService.runAll();

  if (report.integrity && report.integrity.passed === false) {
    throw new Error(
      'Pilot reservation created, but integrity check reported ' +
      String(report.integrity.errors || 0) + ' error(s).'
    );
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
