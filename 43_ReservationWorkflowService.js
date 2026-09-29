/**
 * ============================================================
 * 43_ReservationWorkflowService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 3 - RESERVATION WORKFLOW ORCHESTRATION
 * ============================================================
 *
 * Responsibilities:
 *
 * - Coordinate reservation creation
 * - Prevent concurrent booking races
 * - Create OTA block requests for DIRECT bookings
 * - Coordinate reservation cancellation + OTA block cancellation
 * - Coordinate guest assignment
 * - Apply compensating rollback when possible
 *
 * IMPORTANT:
 *
 * Google Sheets does not provide database transactions.
 *
 * Therefore:
 *
 *   validate
 *      ↓
 *   acquire ScriptLock
 *      ↓
 *   re-check availability
 *      ↓
 *   create reservation
 *      ↓
 *   create dependent records
 *      ↓
 *   rollback dependent work if required
 *
 * ============================================================
 */

const ReservationWorkflowService = (() => {
  const LOCK_TIMEOUT_MS = 30000;

  /**
   * ----------------------------------------------------------
   * HELPERS
   * ----------------------------------------------------------
   */

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function normalize(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim().toUpperCase();
  }

  function normalizeText(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  function normalizeActorId(actorId) {
    return normalizeText(actorId) || CONFIG.DEFAULTS.ACTOR_ID;
  }

  /**
   * ----------------------------------------------------------
   * LOCK
   * ----------------------------------------------------------
   */

  function executeWithLock(callback) {
    const lock = LockService.getScriptLock();

    let acquired = false;

    try {
      lock.waitLock(LOCK_TIMEOUT_MS);

      acquired = true;
    } catch (err) {
      throw new Error(
        "Reservation workflow could not obtain system lock: " + err.message,
      );
    }

    try {
      return callback();
    } finally {
      if (acquired) {
        lock.releaseLock();
      }
    }
  }

  /**
   * ----------------------------------------------------------
   * OTA SOURCE NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeOTASources(sources) {
    if (sources === undefined || sources === null) {
      return [];
    }

    if (!Array.isArray(sources)) {
      throw new Error("ota_sources must be an array.");
    }

    return Array.from(new Set(sources.map(normalize).filter(Boolean)));
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE DIRECT BOOKING REQUEST
   * ----------------------------------------------------------
   */

  function validateCreateRequest(request) {
    if (!request || typeof request !== "object") {
      throw new Error("Reservation workflow request is required.");
    }

    if (!request.reservation || typeof request.reservation !== "object") {
      throw new Error("request.reservation is required.");
    }

    const source = normalize(request.reservation.booking_source);

    const otaSources = normalizeOTASources(request.ota_sources);

    /*
     * OTA blocks only belong to DIRECT bookings.
     */

    if (source !== "DIRECT" && otaSources.length > 0) {
      throw new Error(
        "ota_sources can only be supplied for DIRECT reservations.",
      );
    }

    return {
      booking_source: source,

      ota_sources: otaSources,
    };
  }

  /**
   * ----------------------------------------------------------
   * CREATE RESERVATION WORKFLOW
   * ----------------------------------------------------------
   *
   * Request:
   *
   * {
   *   reservation: {...},
   *
   *   guests: [
   *     {
   *       guest_id: 'GST-000001',
   *       is_primary: true
   *     }
   *   ],
   *
   *   ota_sources: [
   *     'AIRBNB',
   *     'BOOKING_COM'
   *   ]
   * }
   *
   * ----------------------------------------------------------
   */

  function createReservation(request, actorId) {
    actorId = normalizeActorId(actorId);

    const validation = validateCreateRequest(request);

    const guests = Array.isArray(request.guests) ? request.guests : [];

    return executeWithLock(() => {
      /*
       * ----------------------------------------------------
       * STEP 1
       * Re-check availability INSIDE the lock.
       *
       * This is essential.
       *
       * Two administrators could otherwise both check the
       * same unit before either reservation is written.
       * ----------------------------------------------------
       */

      const reservationInput = Object.assign({}, request.reservation);

      const status = normalize(reservationInput.status || "PENDING");

      if (ReservationService.isBlockingStatus(status)) {
        ReservationService.assertAvailable(
          reservationInput.unit_id,
          reservationInput.check_in_date,
          reservationInput.check_out_date,
          null,
        );
      }

      /*
       * ----------------------------------------------------
       * STEP 2
       * Create reservation.
       * ----------------------------------------------------
       */

      const reservation = ReservationService.createReservation(
        reservationInput,
        actorId,
      );

      const createdBlocks = [];

      const assignedGuests = [];

      try {
        /*
         * --------------------------------------------------
         * STEP 3
         * Assign guests.
         * --------------------------------------------------
         */

        guests.forEach((guestInput) => {
          if (!guestInput || !guestInput.guest_id) {
            throw new Error("Each guest assignment requires guest_id.");
          }

          const assignment = ReservationGuestService.assignGuest(
            reservation.reservation_id,
            guestInput.guest_id,
            guestInput.role || "COMPANION",
            actorId,
          );

          assignedGuests.push(assignment);
        });
        /*
         * --------------------------------------------------
         * STEP 4
         * DIRECT booking → OTA block requests.
         *
         * Internal inventory is already protected by the
         * reservation itself.
         *
         * OTA blocks represent the operational task of
         * manually blocking the OTA channels.
         * --------------------------------------------------
         */

        if (validation.booking_source === "DIRECT") {
          validation.ota_sources.forEach((source) => {
            const block = OTABlockService.createForReservation(
              reservation.reservation_id,

              source,

              actorId,
            );

            createdBlocks.push(block);
          });
        }

        /*
         * --------------------------------------------------
         * SUCCESS
         * --------------------------------------------------
         */

        return {
          success: true,

          reservation: reservation,

          guests: assignedGuests,

          ota_blocks: createdBlocks,
        };
      } catch (err) {
        /*
         * --------------------------------------------------
         * COMPENSATING ROLLBACK
         * --------------------------------------------------
         *
         * Do not delete the reservation.
         *
         * A generated reservation and audit trail already
         * exist.
         *
         * Instead, transition the reservation to CANCELLED,
         * which releases inventory while preserving history.
         * --------------------------------------------------
         */

        /*
         * Cancel OTA blocks that were successfully created
         * before the failure.
         */

        createdBlocks
          .slice()
          .reverse()
          .forEach((block) => {
            try {
              if (OTABlockService.isBlockingStatus(block.status)) {
                OTABlockService.cancelBlock(
                  block.ota_block_id,

                  actorId,

                  "Workflow rollback after reservation creation failure.",
                );
              }
            } catch (rollbackError) {
              Logger.log(
                "OTA block rollback failed for " +
                  block.ota_block_id +
                  ": " +
                  rollbackError.message,
              );
            }
          });

        /*
         * Remove guest assignments created by this workflow.
         */

        assignedGuests
          .slice()
          .reverse()
          .forEach((assignment) => {
            try {
              ReservationGuestService.removeGuest(
                reservation.reservation_id,

                assignment.guest_id,

                actorId,
              );
            } catch (rollbackError) {
              Logger.log(
                "Guest rollback failed for " +
                  assignment.guest_id +
                  ": " +
                  rollbackError.message,
              );
            }
          });

        /*
         * Release inventory by cancelling reservation.
         */

        try {
          if (ReservationService.isBlockingStatus(reservation.status)) {
            ReservationService.cancelReservation(
              reservation.reservation_id,

              actorId,
            );
          }
        } catch (rollbackError) {
          Logger.log(
            "Reservation rollback failed for " +
              reservation.reservation_id +
              ": " +
              rollbackError.message,
          );
        }

        throw new Error(
          "Reservation workflow failed after reservation " +
            reservation.reservation_id +
            " was created. Compensating rollback attempted. " +
            "Cause: " +
            err.message,
        );
      }
    });
  }

  /**
   * ----------------------------------------------------------
   * DIRECT RESERVATION CONVENIENCE METHOD
   * ----------------------------------------------------------
   */

  function createDirectReservation(reservation, guests, otaSources, actorId) {
    const input = Object.assign({}, reservation, {
      booking_source: "DIRECT",
    });

    return createReservation(
      {
        reservation: input,

        guests: guests || [],

        ota_sources: otaSources || [],
      },

      actorId,
    );
  }

  /**
   * ----------------------------------------------------------
   * CANCEL RESERVATION WORKFLOW
   * ----------------------------------------------------------
   *
   * Reservation cancellation must also cancel outstanding
   * OTA block records.
   * ----------------------------------------------------------
   */

  function cancelReservation(reservationId, actorId, reason) {
    actorId = normalizeActorId(actorId);

    reservationId = normalizeText(reservationId);

    return executeWithLock(() => {
      const reservation = ReservationService.requireReservation(reservationId);

      if (normalize(reservation.status) === "CANCELLED") {
        return {
          success: true,

          already_cancelled: true,

          reservation: reservation,

          ota_blocks: [],
        };
      }

      /*
       * Cancel reservation first.
       *
       * This immediately releases internal inventory.
       */

      const cancelledReservation = ReservationService.cancelReservation(
        reservationId,
        actorId,
      );

      /*
       * Cancel outstanding OTA workflow records.
       */

      const cancelledBlocks = OTABlockService.cancelForReservation(
        reservationId,

        actorId,

        reason || "Reservation " + reservationId + " cancelled.",
      );

      return {
        success: true,

        already_cancelled: false,

        reservation: cancelledReservation,

        ota_blocks: cancelledBlocks,
      };
    });
  }

  /**
   * ----------------------------------------------------------
   * CONFIRM RESERVATION
   * ----------------------------------------------------------
   */

  function confirmReservation(reservationId, actorId) {
    actorId = normalizeActorId(actorId);

    return executeWithLock(() => {
      const reservation = ReservationService.confirmReservation(
        reservationId,
        actorId,
      );

      return {
        success: true,

        reservation: reservation,
      };
    });
  }

  /**
   * ----------------------------------------------------------
   * CHECK-IN WORKFLOW
   * ----------------------------------------------------------
   *
   * Reservation:
   *
   * CONFIRMED -> CHECKED_IN
   *
   * Unit:
   *
   * READY -> OCCUPIED
   * ----------------------------------------------------------
   */

  function checkIn(reservationId, actorId) {
    actorId = normalizeActorId(actorId);

    return executeWithLock(() => {
      const reservation = ReservationService.requireReservation(reservationId);

      /*
       * Change reservation first.
       */

      const checkedIn = ReservationService.checkInReservation(
        reservationId,
        actorId,
      );

      try {
        const operationalStatus = OperationalStatusService.changeStatus(
          reservation.unit_id,

          "OCCUPIED",

          "Reservation " + reservationId + " checked in",
          actorId,

          "",
        );

        return {
          success: true,

          reservation: checkedIn,

          operational_status: operationalStatus,
        };
      } catch (err) {
        /*
         * Reservation status transitions do not currently
         * support CHECKED_IN -> CONFIRMED rollback.
         *
         * Therefore do not attempt a silent reverse
         * transition here.
         *
         * Surface the partial failure loudly.
         */

        throw new Error(
          "Reservation " +
            reservationId +
            " was marked CHECKED_IN, but unit operational " +
            "status could not be changed to OCCUPIED. " +
            "Manual reconciliation required. Cause: " +
            err.message,
        );
      }
    });
  }

  /**
   * ----------------------------------------------------------
   * COMPLETE STAY WORKFLOW
   * ----------------------------------------------------------
   *
   * Reservation:
   *
   * CHECKED_IN -> COMPLETED
   *
   * Unit:
   *
   * OCCUPIED -> DIRTY
   *
   * This prepares Phase 4 housekeeping workflow.
   * ----------------------------------------------------------
   */

  function completeStay(reservationId, actorId) {
    actorId = normalizeActorId(actorId);

    return executeWithLock(() => {
      const reservation = ReservationService.requireReservation(reservationId);

      const completed = ReservationService.completeReservation(
        reservationId,
        actorId,
      );

      try {
        const operationalStatus = OperationalStatusService.changeStatus(
          reservation.unit_id,

          "DIRTY",

          "Reservation " + reservationId + " completed",
          actorId,

          "",
        );

        return {
          success: true,

          reservation: completed,

          operational_status: operationalStatus,
        };
      } catch (err) {
        throw new Error(
          "Reservation " +
            reservationId +
            " was marked COMPLETED, but unit operational " +
            "status could not be changed to DIRTY. " +
            "Manual reconciliation required. Cause: " +
            err.message,
        );
      }
    });
  }

  /**
   * ----------------------------------------------------------
   * NO-SHOW WORKFLOW
   * ----------------------------------------------------------
   */

  function markNoShow(reservationId, actorId) {
    actorId = normalizeActorId(actorId);

    return executeWithLock(() => {
      const reservation = ReservationService.markNoShow(reservationId, actorId);

      /*
       * OTA blocks remain operational records, but they no
       * longer need to block inventory after a no-show.
       */

      const cancelledBlocks = OTABlockService.cancelForReservation(
        reservationId,

        actorId,

        "Reservation marked NO_SHOW.",
      );

      return {
        success: true,

        reservation: reservation,

        ota_blocks: cancelledBlocks,
      };
    });
  }

  /**
   * ----------------------------------------------------------
   * RESERVATION WORKFLOW SUMMARY
   * ----------------------------------------------------------
   */

  function getReservationWorkflow(reservationId) {
    const reservation = ReservationService.requireReservation(reservationId);

    const guests = ReservationGuestService.getReservationGuests(reservationId);

    const otaBlocks = OTABlockService.getByReservation(reservationId);

    const operationalStatus = OperationalStatusService.getStatus(
      reservation.unit_id,
    );

    return {
      reservation: reservation,

      guests: guests,

      ota_blocks: otaBlocks,

      operational_status: operationalStatus,
    };
  }

  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {
    createReservation,

    createDirectReservation,

    cancelReservation,

    confirmReservation,

    checkIn,

    completeStay,

    markNoShow,

    getReservationWorkflow,

    validateCreateRequest,

    normalizeOTASources,
  };
})();
