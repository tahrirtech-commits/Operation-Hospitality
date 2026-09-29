/**
 * ============================================================================
 * 97_runPilotCheckIn.js
 * RENTAL OPERATIONS MVP
 * ============================================================================
 * Controlled, idempotent PILOT milestone:
 * OTA block completion -> reservation check-in -> OCCUPIED -> integrity.
 * ============================================================================
 */

function runPilotCheckIn() {
  const actorId = CONFIG.DEFAULTS.ACTOR_ID || 'SYSTEM';
  const marker = 'PILOT-FIRST-RESERVATION';
  const report = {
    ota_blocks: [],
    check_in: null,
    workflow: null,
    integrity: null
  };

  const reservation = ReservationService.getAll().find(row =>
    String(row.notes || '').indexOf(marker) >= 0
  );

  if (!reservation) {
    throw new Error(
      'Pilot reservation not found. Run setupPilotReservation() first.'
    );
  }

  const reservationId = String(reservation.reservation_id || '').trim();
  const currentStatus = String(reservation.status || '').trim().toUpperCase();

  if (currentStatus !== 'CONFIRMED' && currentStatus !== 'CHECKED_IN') {
    throw new Error(
      'Pilot reservation must be CONFIRMED or already CHECKED_IN. Current status: ' +
      currentStatus
    );
  }

  // 1. Complete all OTA block work for this reservation.
  const blocks = OTABlockService.getByReservation(reservationId);

  if (blocks.length === 0) {
    throw new Error(
      'No OTA block records found for pilot reservation ' + reservationId
    );
  }

  blocks.forEach(block => {
    const status = String(block.status || '').trim().toUpperCase();

    if (status === 'PENDING') {
      const saved = OTABlockService.markBlocked(
        block.ota_block_id,
        actorId,
        'Pilot validation: OTA channel manually blocked.'
      );
      report.ota_blocks.push({ action: 'MARKED_BLOCKED', record: saved });
      return;
    }

    if (status === 'BLOCKED') {
      report.ota_blocks.push({ action: 'REUSED_BLOCKED', record: block });
      return;
    }

    throw new Error(
      'Unexpected OTA block status for ' +
      block.ota_block_id +
      ': ' +
      status
    );
  });

  // Verify this reservation has no pending OTA work.
  const pendingForReservation = OTABlockService
    .getByReservation(reservationId)
    .filter(block =>
      String(block.status || '').trim().toUpperCase() === 'PENDING'
    );

  if (pendingForReservation.length > 0) {
    throw new Error(
      'Pilot reservation still has ' +
      pendingForReservation.length +
      ' pending OTA block(s).'
    );
  }

  // 2. Check in only if not already checked in.
  let authoritativeReservation = ReservationService.getById(reservationId);

  if (
    String(authoritativeReservation.status || '').trim().toUpperCase() ===
    'CONFIRMED'
  ) {
    report.check_in = ReservationWorkflowService.checkIn(
      reservationId,
      actorId
    );
  } else {
    report.check_in = {
      success: true,
      action: 'REUSED_CHECKED_IN',
      reservation: authoritativeReservation,
      operational_status: OperationalStatusService.getStatus(
        authoritativeReservation.unit_id
      )
    };
  }

  // 3. Re-read authoritative state and assert coupled transition.
  authoritativeReservation = ReservationService.getById(reservationId);
  const operationalStatus = OperationalStatusService.getStatus(
    authoritativeReservation.unit_id
  );

  if (
    String(authoritativeReservation.status || '').trim().toUpperCase() !==
    'CHECKED_IN'
  ) {
    throw new Error(
      'Pilot check-in validation failed: reservation is not CHECKED_IN.'
    );
  }

  if (
    String(operationalStatus.operational_status || '').trim().toUpperCase() !==
    'OCCUPIED'
  ) {
    throw new Error(
      'Pilot check-in validation failed: unit is not OCCUPIED.'
    );
  }

  report.workflow = ReservationWorkflowService.getReservationWorkflow(
    reservationId
  );

  // 4. Final integrity verification.
  report.integrity = IntegrityCheckService.runAll();

  if (report.integrity && report.integrity.passed === false) {
    throw new Error(
      'Pilot check-in completed, but integrity check reported ' +
      String(report.integrity.errors || 0) +
      ' error(s).'
    );
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
