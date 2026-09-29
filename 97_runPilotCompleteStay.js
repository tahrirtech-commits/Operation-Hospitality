/**
 * ============================================================================
 * 97_runPilotCompleteStay.js
 * RENTAL OPERATIONS MVP
 * ============================================================================
 * Controlled, idempotent PILOT milestone:
 * CHECKED_IN -> COMPLETED and OCCUPIED -> DIRTY -> integrity.
 * ============================================================================
 */

function runPilotCompleteStay() {
  const actorId = CONFIG.DEFAULTS.ACTOR_ID || 'SYSTEM';
  const marker = 'PILOT-FIRST-RESERVATION';
  const report = {
    complete_stay: null,
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

  if (currentStatus !== 'CHECKED_IN' && currentStatus !== 'COMPLETED') {
    throw new Error(
      'Pilot reservation must be CHECKED_IN or already COMPLETED. Current status: ' +
      currentStatus
    );
  }

  // Complete only once. A rerun validates/reuses the terminal state.
  if (currentStatus === 'CHECKED_IN') {
    report.complete_stay = ReservationWorkflowService.completeStay(
      reservationId,
      actorId
    );
  } else {
    report.complete_stay = {
      success: true,
      action: 'REUSED_COMPLETED',
      reservation: ReservationService.getById(reservationId),
      operational_status: OperationalStatusService.getStatus(
        reservation.unit_id
      )
    };
  }

  // Re-read authoritative persisted state.
  const authoritativeReservation = ReservationService.getById(reservationId);
  const operationalStatus = OperationalStatusService.getStatus(
    authoritativeReservation.unit_id
  );

  if (
    String(authoritativeReservation.status || '').trim().toUpperCase() !==
    'COMPLETED'
  ) {
    throw new Error(
      'Pilot complete-stay validation failed: reservation is not COMPLETED.'
    );
  }

  if (
    String(operationalStatus.operational_status || '').trim().toUpperCase() !==
    'DIRTY'
  ) {
    throw new Error(
      'Pilot complete-stay validation failed: unit is not DIRTY.'
    );
  }

  report.workflow = ReservationWorkflowService.getReservationWorkflow(
    reservationId
  );

  report.integrity = IntegrityCheckService.runAll();

  if (report.integrity && report.integrity.passed === false) {
    throw new Error(
      'Pilot stay completion succeeded, but integrity check reported ' +
      String(report.integrity.errors || 0) +
      ' error(s).'
    );
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
