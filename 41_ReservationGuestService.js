/**
 * ============================================================
 * 41_ReservationGuestService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 3 - RESERVATION GUESTS
 * ============================================================
 *
 * Actual schema:
 *
 * 10_ReservationGuests
 *
 * reservation_guest_id
 * reservation_id
 * guest_id
 * role
 *
 * Supported roles currently observed:
 *
 * PRIMARY
 * COMPANION
 * CHILD
 *
 * Responsibilities:
 * - Assign guests to reservations
 * - Maintain guest roles
 * - Enforce one PRIMARY guest per reservation
 * - Prevent duplicate guest assignments
 * - Query reservation occupants
 * - Validate reservation/guest relationships
 * - Audit relationship changes
 *
 * ============================================================
 */

const ReservationGuestService = (() => {

  const ENTITY_TYPE =
    'RESERVATION_GUEST';


  const ROLE = {

    PRIMARY:
      'PRIMARY',

    COMPANION:
      'COMPANION',

    CHILD:
      'CHILD'

  };


  const VALID_ROLES =
    new Set([
      ROLE.PRIMARY,
      ROLE.COMPANION,
      ROLE.CHILD
    ]);


  /**
   * ----------------------------------------------------------
   * HELPERS
   * ----------------------------------------------------------
   */

  function isBlank(value) {

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );

  }


  function normalizeText(value) {

    if (isBlank(value)) {
      return '';
    }

    return String(value).trim();

  }


  function normalize(value) {

    return normalizeText(value)
      .toUpperCase();

  }


  function normalizeActorId(actorId) {

    return (
      normalizeText(actorId) ||
      CONFIG.DEFAULTS.ACTOR_ID
    );

  }


  function normalizeRole(role) {

    return normalize(role);

  }


  function validateRole(role) {

    role =
      normalizeRole(role);


    if (
      !VALID_ROLES.has(role)
    ) {

      throw new Error(
        'Invalid reservation guest role: ' +
          role
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * ENTITY VALIDATION
   * ----------------------------------------------------------
   */

  function requireReservation(
    reservationId
  ) {

    reservationId =
      normalizeText(
        reservationId
      );


    if (!reservationId) {

      throw new Error(
        'reservation_id is required.'
      );

    }


    return ReservationService
      .requireReservation(
        reservationId
      );

  }


  function getGuestById(
    guestId
  ) {

    guestId =
      normalizeText(
        guestId
      );


    if (!guestId) {
      return null;
    }


    return BaseRepository.findById(
      CONFIG.SHEETS.GUESTS,
      'guest_id',
      guestId
    );

  }


  function requireGuest(
    guestId
  ) {

    const guest =
      getGuestById(
        guestId
      );


    if (!guest) {

      throw new Error(
        'Guest not found: ' +
          guestId
      );

    }


    return guest;

  }


  /**
   * ----------------------------------------------------------
   * BASIC QUERIES
   * ----------------------------------------------------------
   */

  function getAll() {

    return BaseRepository.findAll(
      CONFIG.SHEETS
        .RESERVATION_GUESTS
    );

  }


  function getById(
    reservationGuestId
  ) {

    return BaseRepository.findById(
      CONFIG.SHEETS
        .RESERVATION_GUESTS,

      'reservation_guest_id',

      normalizeText(
        reservationGuestId
      )
    );

  }


  function exists(
    reservationGuestId
  ) {

    return !!getById(
      reservationGuestId
    );

  }


  function requireAssignment(
    reservationGuestId
  ) {

    const assignment =
      getById(
        reservationGuestId
      );


    if (!assignment) {

      throw new Error(
        'Reservation guest assignment not found: ' +
          reservationGuestId
      );

    }


    return assignment;

  }


  function getByReservation(
    reservationId
  ) {

    return BaseRepository.findByField(
      CONFIG.SHEETS
        .RESERVATION_GUESTS,

      'reservation_id',

      normalizeText(
        reservationId
      )
    );

  }


  function getByGuest(
    guestId
  ) {

    return BaseRepository.findByField(
      CONFIG.SHEETS
        .RESERVATION_GUESTS,

      'guest_id',

      normalizeText(
        guestId
      )
    );

  }


  /**
   * ----------------------------------------------------------
   * NATURAL RELATIONSHIP LOOKUP
   * ----------------------------------------------------------
   */

  function findAssignment(
    reservationId,
    guestId
  ) {

    reservationId =
      normalizeText(
        reservationId
      );


    guestId =
      normalizeText(
        guestId
      );


    const matches =
      getByReservation(
        reservationId
      )
      .filter(
        assignment =>
          normalizeText(
            assignment.guest_id
          ) === guestId
      );


    if (
      matches.length === 0
    ) {

      return null;

    }


    if (
      matches.length > 1
    ) {

      throw new Error(
        'Duplicate reservation/guest relationship detected: ' +
          reservationId +
          ' / ' +
          guestId
      );

    }


    return matches[0];

  }


  function relationshipExists(
    reservationId,
    guestId
  ) {

    return !!findAssignment(
      reservationId,
      guestId
    );

  }


  /**
   * ----------------------------------------------------------
   * PRIMARY GUEST
   * ----------------------------------------------------------
   */

  function getPrimaryGuestAssignment(
    reservationId
  ) {

    const primary =
      getByReservation(
        reservationId
      )
      .filter(
        assignment =>
          normalizeRole(
            assignment.role
          ) === ROLE.PRIMARY
      );


    if (
      primary.length === 0
    ) {

      return null;

    }


    if (
      primary.length > 1
    ) {

      throw new Error(
        'Multiple PRIMARY guests detected for reservation: ' +
          reservationId
      );

    }


    return primary[0];

  }


  function getPrimaryGuest(
    reservationId
  ) {

    const assignment =
      getPrimaryGuestAssignment(
        reservationId
      );


    if (!assignment) {
      return null;
    }


    return requireGuest(
      assignment.guest_id
    );

  }


  /**
   * ----------------------------------------------------------
   * CREATE ASSIGNMENT
   * ----------------------------------------------------------
   */

  function assignGuest(
    reservationId,
    guestId,
    role,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    reservationId =
      normalizeText(
        reservationId
      );


    guestId =
      normalizeText(
        guestId
      );


    role =
      normalizeRole(
        role || ROLE.COMPANION
      );


    requireReservation(
      reservationId
    );


    requireGuest(
      guestId
    );


    validateRole(
      role
    );


    if (
      relationshipExists(
        reservationId,
        guestId
      )
    ) {

      throw new Error(
        'Guest ' +
          guestId +
          ' is already assigned to reservation ' +
          reservationId +
          '.'
      );

    }


    const existingAssignments =
      getByReservation(
        reservationId
      );


    /*
     * First guest automatically becomes PRIMARY.
     */

    if (
      existingAssignments.length === 0
    ) {

      role =
        ROLE.PRIMARY;

    }


    /*
     * A reservation can have only one PRIMARY guest.
     */

    if (
      role ===
      ROLE.PRIMARY
    ) {

      const currentPrimary =
        getPrimaryGuestAssignment(
          reservationId
        );


      if (currentPrimary) {

        throw new Error(
          'Reservation ' +
            reservationId +
            ' already has PRIMARY guest ' +
            currentPrimary.guest_id +
            '. Change the existing guest role first.'
        );

      }

    }


    /*
     * Validate before consuming ID.
     */

    const reservationGuestId =
      IdService.nextId(
        ENTITY_TYPE
      );


    const record = {

      reservation_guest_id:
        reservationGuestId,

      reservation_id:
        reservationId,

      guest_id:
        guestId,

      role:
        role

    };


    const inserted =
      BaseRepository.insert(
        CONFIG.SHEETS
          .RESERVATION_GUESTS,

        record
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      reservationGuestId,
      inserted,
      actorId
    );


    return inserted;

  }


  /**
   * ----------------------------------------------------------
   * CHANGE ROLE
   * ----------------------------------------------------------
   */

  function changeRole(
    reservationGuestId,
    newRole,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireAssignment(
        reservationGuestId
      );


    newRole =
      normalizeRole(
        newRole
      );


    validateRole(
      newRole
    );


    const oldRole =
      normalizeRole(
        existing.role
      );


    if (
      oldRole ===
      newRole
    ) {

      return existing;

    }


    /*
     * Prevent multiple PRIMARY guests.
     */

    if (
      newRole ===
      ROLE.PRIMARY
    ) {

      const currentPrimary =
        getPrimaryGuestAssignment(
          existing.reservation_id
        );


      if (
        currentPrimary &&
        normalizeText(
          currentPrimary
            .reservation_guest_id
        ) !==
          normalizeText(
            reservationGuestId
          )
      ) {

        throw new Error(
          'Reservation ' +
            existing.reservation_id +
            ' already has PRIMARY guest ' +
            currentPrimary.guest_id +
            '.'
        );

      }

    }


    /*
     * Prevent removing the only PRIMARY while other
     * guests remain.
     */

    if (
      oldRole === ROLE.PRIMARY &&
      newRole !== ROLE.PRIMARY
    ) {

      const others =
        getByReservation(
          existing.reservation_id
        )
        .filter(
          assignment =>
            normalizeText(
              assignment
                .reservation_guest_id
            ) !==
              normalizeText(
                reservationGuestId
              )
        );


      if (
        others.length > 0
      ) {

        throw new Error(
          'Cannot change the only PRIMARY guest to ' +
            newRole +
            ' while other guests remain. ' +
            'Use setPrimaryGuest() instead.'
        );

      }

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          role:
            newRole
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .RESERVATION_GUESTS,

      'reservation_guest_id',

      reservationGuestId,

      updated
    );


    AuditService.logUpdate(
      ENTITY_TYPE,
      reservationGuestId,
      existing,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * SET PRIMARY GUEST
   * ----------------------------------------------------------
   *
   * Atomically changes:
   *
   * old PRIMARY -> COMPANION
   * selected guest -> PRIMARY
   * ----------------------------------------------------------
   */

  function setPrimaryGuest(
    reservationId,
    guestId,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    reservationId =
      normalizeText(
        reservationId
      );


    guestId =
      normalizeText(
        guestId
      );


    requireReservation(
      reservationId
    );


    const target =
      findAssignment(
        reservationId,
        guestId
      );


    if (!target) {

      throw new Error(
        'Guest ' +
          guestId +
          ' is not assigned to reservation ' +
          reservationId +
          '.'
      );

    }


    const currentPrimary =
      getPrimaryGuestAssignment(
        reservationId
      );


    if (
      currentPrimary &&
      normalizeText(
        currentPrimary.guest_id
      ) === guestId
    ) {

      return target;

    }


    /*
     * Demote current primary first.
     */

    if (currentPrimary) {

      const demoted =
        Object.assign(
          {},
          currentPrimary,
          {
            role:
              ROLE.COMPANION
          }
        );


      const savedDemoted =
        BaseRepository.update(
          CONFIG.SHEETS
            .RESERVATION_GUESTS,

          'reservation_guest_id',

          currentPrimary
            .reservation_guest_id,

          demoted
        );


      AuditService.logUpdate(
        ENTITY_TYPE,
        currentPrimary
          .reservation_guest_id,
        currentPrimary,
        savedDemoted,
        actorId
      );

    }


    /*
     * Promote selected guest.
     */

    const refreshedTarget =
      requireAssignment(
        target.reservation_guest_id
      );


    const promoted =
      Object.assign(
        {},
        refreshedTarget,
        {
          role:
            ROLE.PRIMARY
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .RESERVATION_GUESTS,

        'reservation_guest_id',

        target.reservation_guest_id,

        promoted
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      target.reservation_guest_id,
      refreshedTarget,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * REMOVE GUEST
   * ----------------------------------------------------------
   */

  function removeGuest(
    reservationId,
    guestId,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    reservationId =
      normalizeText(
        reservationId
      );


    guestId =
      normalizeText(
        guestId
      );


    const assignment =
      findAssignment(
        reservationId,
        guestId
      );


    if (!assignment) {

      throw new Error(
        'Guest ' +
          guestId +
          ' is not assigned to reservation ' +
          reservationId +
          '.'
      );

    }


    const assignments =
      getByReservation(
        reservationId
      );


    const remaining =
      assignments.filter(
        item =>
          normalizeText(
            item.reservation_guest_id
          ) !==
            normalizeText(
              assignment
                .reservation_guest_id
            )
      );


    const wasPrimary =
      normalizeRole(
        assignment.role
      ) === ROLE.PRIMARY;


    const rowNumber =
      BaseRepository
        .findRowNumberById(
          CONFIG.SHEETS
            .RESERVATION_GUESTS,

          'reservation_guest_id',

          assignment
            .reservation_guest_id
        );


    if (
      rowNumber < 2
    ) {

      throw new Error(
        'Reservation guest row not found: ' +
          assignment
            .reservation_guest_id
      );

    }


    const sheet =
      BaseRepository.getSheet(
        CONFIG.SHEETS
          .RESERVATION_GUESTS
      );


    sheet.deleteRow(
      rowNumber
    );


    AuditService.log(
      'DELETE',
      ENTITY_TYPE,
      assignment
        .reservation_guest_id,
      assignment,
      null,
      actorId,
      CONFIG.DEFAULTS.ACTOR_TYPE
    );


    /*
     * If primary was removed and other guests remain,
     * automatically promote the first remaining guest.
     */

    if (
      wasPrimary &&
      remaining.length > 0
    ) {

      const nextGuest =
        findAssignment(
          reservationId,
          remaining[0].guest_id
        );


      if (nextGuest) {

        const promoted =
          Object.assign(
            {},
            nextGuest,
            {
              role:
                ROLE.PRIMARY
            }
          );


        const saved =
          BaseRepository.update(
            CONFIG.SHEETS
              .RESERVATION_GUESTS,

            'reservation_guest_id',

            nextGuest
              .reservation_guest_id,

            promoted
          );


        AuditService.logUpdate(
          ENTITY_TYPE,
          nextGuest
            .reservation_guest_id,
          nextGuest,
          saved,
          actorId
        );

      }

    }


    return assignment;

  }


  /**
   * ----------------------------------------------------------
   * RESERVATION OCCUPANTS
   * ----------------------------------------------------------
   */

  function getReservationGuests(
    reservationId
  ) {

    requireReservation(
      reservationId
    );


    return getByReservation(
      reservationId
    )
    .map(assignment => {

      return {

        reservation_guest_id:
          assignment
            .reservation_guest_id,

        reservation_id:
          assignment
            .reservation_id,

        guest_id:
          assignment
            .guest_id,

        role:
          normalizeRole(
            assignment.role
          ),

        guest:
          requireGuest(
            assignment.guest_id
          )

      };

    });

  }


  function getGuestReservations(
    guestId
  ) {

    requireGuest(
      guestId
    );


    return getByGuest(
      guestId
    )
    .map(assignment => {

      return {

        reservation_guest_id:
          assignment
            .reservation_guest_id,

        role:
          normalizeRole(
            assignment.role
          ),

        reservation:
          ReservationService
            .getById(
              assignment
                .reservation_id
            )

      };

    });

  }


  function countGuests(
    reservationId
  ) {

    return getByReservation(
      reservationId
    ).length;

  }


  /**
   * ----------------------------------------------------------
   * INTEGRITY HELPERS
   * ----------------------------------------------------------
   */

  function findOrphanReservationLinks() {

    const reservationIds =
      new Set(
        ReservationService
          .getAll()
          .map(
            reservation =>
              normalizeText(
                reservation
                  .reservation_id
              )
          )
      );


    return getAll()
      .filter(
        assignment =>
          !reservationIds.has(
            normalizeText(
              assignment
                .reservation_id
            )
          )
      );

  }


  function findOrphanGuestLinks() {

    const guestIds =
      new Set(
        BaseRepository
          .findAll(
            CONFIG.SHEETS.GUESTS
          )
          .map(
            guest =>
              normalizeText(
                guest.guest_id
              )
          )
      );


    return getAll()
      .filter(
        assignment =>
          !guestIds.has(
            normalizeText(
              assignment.guest_id
            )
          )
      );

  }


  function findDuplicateAssignments() {

    const counts =
      {};


    getAll()
      .forEach(
        assignment => {

          const reservationId =
            normalizeText(
              assignment
                .reservation_id
            );


          const guestId =
            normalizeText(
              assignment.guest_id
            );


          if (
            !reservationId ||
            !guestId
          ) {

            return;

          }


          const key =
            reservationId +
            '::' +
            guestId;


          counts[key] =
            (counts[key] || 0) + 1;

        }
      );


    return Object.keys(counts)
      .filter(
        key =>
          counts[key] > 1
      )
      .map(
        key => ({
          key:
            key,

          count:
            counts[key]
        })
      );

  }


  function findInvalidRoles() {

    return getAll()
      .filter(
        assignment =>
          !VALID_ROLES.has(
            normalizeRole(
              assignment.role
            )
          )
      );

  }


  function findReservationsWithMultiplePrimaryGuests() {

    const grouped =
      {};


    getAll()
      .forEach(
        assignment => {

          if (
            normalizeRole(
              assignment.role
            ) !==
            ROLE.PRIMARY
          ) {

            return;

          }


          const reservationId =
            normalizeText(
              assignment
                .reservation_id
            );


          if (!reservationId) {
            return;
          }


          if (
            !grouped[
              reservationId
            ]
          ) {

            grouped[
              reservationId
            ] = [];

          }


          grouped[
            reservationId
          ].push(
            assignment
          );

        }
      );


    return Object.keys(grouped)
      .filter(
        reservationId =>
          grouped[
            reservationId
          ].length > 1
      )
      .map(
        reservationId => ({
          reservation_id:
            reservationId,

          count:
            grouped[
              reservationId
            ].length,

          assignments:
            grouped[
              reservationId
            ]
        })
      );

  }


  function findReservationsWithoutPrimaryGuest() {

    const grouped =
      {};


    getAll()
      .forEach(
        assignment => {

          const reservationId =
            normalizeText(
              assignment
                .reservation_id
            );


          if (!reservationId) {
            return;
          }


          if (
            !grouped[
              reservationId
            ]
          ) {

            grouped[
              reservationId
            ] = [];

          }


          grouped[
            reservationId
          ].push(
            assignment
          );

        }
      );


    return Object.keys(grouped)
      .filter(
        reservationId => {

          return !grouped[
            reservationId
          ].some(
            assignment =>
              normalizeRole(
                assignment.role
              ) ===
              ROLE.PRIMARY
          );

        }
      )
      .map(
        reservationId => ({
          reservation_id:
            reservationId,

          assignments:
            grouped[
              reservationId
            ]
        })
      );

  }


  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {

    assignGuest,

    changeRole,

    setPrimaryGuest,

    removeGuest,

    getAll,

    getById,

    exists,

    requireAssignment,

    getByReservation,

    getByGuest,

    findAssignment,

    relationshipExists,

    getPrimaryGuestAssignment,

    getPrimaryGuest,

    getReservationGuests,

    getGuestReservations,

    countGuests,

    validateRole,

    findOrphanReservationLinks,

    findOrphanGuestLinks,

    findDuplicateAssignments,

    findInvalidRoles,

    findReservationsWithMultiplePrimaryGuests,

    findReservationsWithoutPrimaryGuest

  };

})();