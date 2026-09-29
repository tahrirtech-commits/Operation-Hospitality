/**
 * ============================================================
 * 42_OTABlockService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 3 - OTA BLOCK WORKFLOW
 * ============================================================
 *
 * Responsibilities:
 * - Create OTA block requests
 * - Create block requests for DIRECT reservations
 * - Track PENDING -> BLOCKED workflow
 * - Cancel obsolete block requests
 * - Query outstanding OTA work
 * - Prevent duplicate active block requests
 * - Validate reservation / unit relationships
 * - Audit lifecycle changes
 *
 * Workflow:
 *
 * DIRECT reservation
 *        |
 *        v
 * OTA block request created
 *        |
 *        v
 * PENDING
 *        |
 *        | Admin manually blocks dates on Airbnb /
 *        | Booking.com / other OTA
 *        v
 * BLOCKED
 *
 * If reservation/block becomes irrelevant:
 *
 * PENDING/BLOCKED -> CANCELLED
 *
 * Availability semantics:
 *
 * PENDING   = BLOCKING
 * BLOCKED   = BLOCKING
 * CANCELLED = NON-BLOCKING
 *
 * Sheet:
 *   14_OTABlocks
 *
 * Required headers:
 *
 *   ota_block_id
 *   unit_id
 *   source
 *   start_date
 *   end_date
 *   status
 *
 * Recommended additional headers:
 *
 *   reservation_id
 *   blocked_at
 *   cancelled_at
 *   notes
 *   created_at
 *   updated_at
 *   updated_by
 *
 * ============================================================
 */

const OTABlockService = (() => {

  const ENTITY_TYPE =
    'OTA_BLOCK';


  const STATUS = {

    PENDING:
      'PENDING',

    BLOCKED:
      'BLOCKED',

    CANCELLED:
      'CANCELLED'

  };


  const BLOCKING_STATUSES =
    new Set([
      STATUS.PENDING,
      STATUS.BLOCKED
    ]);


  const VALID_STATUSES =
    new Set([
      STATUS.PENDING,
      STATUS.BLOCKED,
      STATUS.CANCELLED
    ]);


  /**
   * ----------------------------------------------------------
   * GENERIC HELPERS
   * ----------------------------------------------------------
   */

  function isBlank(value) {

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );

  }


  function normalize(value) {

    if (isBlank(value)) {
      return '';
    }


    return String(value)
      .trim()
      .toUpperCase();

  }


  function normalizeText(value) {

    if (isBlank(value)) {
      return '';
    }


    return String(value).trim();

  }


  function timestamp() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME
    );

  }


  function normalizeActorId(actorId) {

    return (
      normalizeText(actorId) ||
      CONFIG.DEFAULTS.ACTOR_ID
    );

  }


  function cloneObject(value) {

    return Object.assign(
      {},
      value || {}
    );

  }


  /**
   * ----------------------------------------------------------
   * DATE NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeDate(value) {

    return AvailabilityService
      .normalizeDate(value);

  }


  /**
   * ----------------------------------------------------------
   * RECORD NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeBlock(input) {

    const block =
      cloneObject(input);


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'ota_block_id'
      )
    ) {

      block.ota_block_id =
        normalizeText(
          block.ota_block_id
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'reservation_id'
      )
    ) {

      block.reservation_id =
        normalizeText(
          block.reservation_id
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'unit_id'
      )
    ) {

      block.unit_id =
        normalizeText(
          block.unit_id
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'source'
      )
    ) {

      block.source =
        normalize(
          block.source
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'status'
      )
    ) {

      block.status =
        normalize(
          block.status
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'start_date'
      ) &&
      !isBlank(
        block.start_date
      )
    ) {

      block.start_date =
        normalizeDate(
          block.start_date
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'end_date'
      ) &&
      !isBlank(
        block.end_date
      )
    ) {

      block.end_date =
        normalizeDate(
          block.end_date
        );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        block,
        'notes'
      )
    ) {

      block.notes =
        normalizeText(
          block.notes
        );

    }


    return block;

  }


  /**
   * ----------------------------------------------------------
   * BASIC QUERIES
   * ----------------------------------------------------------
   */

  function getAll() {

    return BaseRepository.findAll(
      CONFIG.SHEETS.OTA_BLOCKS
    );

  }


  function getById(otaBlockId) {

    otaBlockId =
      normalizeText(
        otaBlockId
      );


    if (!otaBlockId) {
      return null;
    }


    return BaseRepository.findById(
      CONFIG.SHEETS.OTA_BLOCKS,
      'ota_block_id',
      otaBlockId
    );

  }


  function exists(otaBlockId) {

    return !!getById(
      otaBlockId
    );

  }


  function requireBlock(
    otaBlockId
  ) {

    const block =
      getById(
        otaBlockId
      );


    if (!block) {

      throw new Error(
        'OTA block not found: ' +
          otaBlockId
      );

    }


    return block;

  }


  function getByUnit(unitId) {

    return BaseRepository.findByField(
      CONFIG.SHEETS.OTA_BLOCKS,
      'unit_id',
      normalizeText(unitId)
    );

  }


  function getByReservation(
    reservationId
  ) {

    reservationId =
      normalizeText(
        reservationId
      );


    /*
     * reservation_id is a recommended Phase 3 column.
     *
     * If it has not been added yet, return [] rather
     * than silently using another field.
     */

    const headers =
      BaseRepository.getHeaders(
        CONFIG.SHEETS.OTA_BLOCKS
      );


    if (
      !headers.includes(
        'reservation_id'
      )
    ) {

      return [];

    }


    return BaseRepository.findByField(
      CONFIG.SHEETS.OTA_BLOCKS,
      'reservation_id',
      reservationId
    );

  }


  function getByStatus(status) {

    status =
      normalize(status);


    return getAll()
      .filter(
        block =>
          normalize(
            block.status
          ) === status
      );

  }


  function getBySource(source) {

    source =
      normalize(source);


    return getAll()
      .filter(
        block =>
          normalize(
            block.source
          ) === source
      );

  }


  /**
   * ----------------------------------------------------------
   * STATUS HELPERS
   * ----------------------------------------------------------
   */

  function isBlockingStatus(status) {

    return BLOCKING_STATUSES.has(
      normalize(status)
    );

  }


  function validateStatus(status) {

    status =
      normalize(status);


    if (
      !VALID_STATUSES.has(
        status
      )
    ) {

      throw new Error(
        'Invalid OTA block status: ' +
          status
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATION
   * ----------------------------------------------------------
   */

  function validateBlock(
    block
  ) {

    if (
      !block ||
      typeof block !== 'object'
    ) {

      throw new Error(
        'OTA block object is required.'
      );

    }


    ValidationService.requireFields(
      block,
      [
        'unit_id',
        'source',
        'start_date',
        'end_date',
        'status'
      ]
    );


    ValidationService
      .validateUnitExists(
        block.unit_id
      );


    validateStatus(
      block.status
    );


    AvailabilityService
      .validateDateRange(
        block.start_date,
        block.end_date
      );


    if (
      !isBlank(
        block.reservation_id
      )
    ) {

      ReservationService
        .requireReservation(
          block.reservation_id
        );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * DUPLICATE DETECTION
   * ----------------------------------------------------------
   *
   * Active duplicate:
   *
   * same reservation
   * same source
   * blocking status
   *
   * If reservation_id is unavailable, fallback to:
   *
   * unit + source + exact date range
   * ----------------------------------------------------------
   */

  function findExistingBlockingBlock(
    input
  ) {

    const block =
      normalizeBlock(input);


    return getAll()
      .find(existing => {

        if (
          !isBlockingStatus(
            existing.status
          )
        ) {

          return false;

        }


        if (
          normalize(
            existing.source
          ) !==
          normalize(
            block.source
          )
        ) {

          return false;

        }


        if (
          !isBlank(
            block.reservation_id
          ) &&
          !isBlank(
            existing.reservation_id
          )
        ) {

          return (
            normalizeText(
              existing.reservation_id
            ) ===
            normalizeText(
              block.reservation_id
            )
          );

        }


        return (
          normalizeText(
            existing.unit_id
          ) ===
            normalizeText(
              block.unit_id
            ) &&

          String(
            existing.start_date
          ) ===
            String(
              block.start_date
            ) &&

          String(
            existing.end_date
          ) ===
            String(
              block.end_date
            )
        );

      }) || null;

  }


  /**
   * ----------------------------------------------------------
   * CREATE BLOCK
   * ----------------------------------------------------------
   */

  function createBlock(
    input,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    let block =
      normalizeBlock(
        input
      );


    block.status =
      normalize(
        block.status ||
        STATUS.PENDING
      );


    validateBlock(
      block
    );


    const duplicate =
      findExistingBlockingBlock(
        block
      );


    if (duplicate) {

      throw new Error(
        'Active OTA block already exists: ' +
          duplicate.ota_block_id
      );

    }


    /*
     * Validate before consuming ID.
     */

    block.ota_block_id =
      IdService.nextId(
        ENTITY_TYPE
      );


    const now =
      timestamp();


    block.created_at =
      now;

    block.updated_at =
      now;

    block.updated_by =
      actorId;


    const inserted =
      BaseRepository.insert(
        CONFIG.SHEETS.OTA_BLOCKS,
        block
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.ota_block_id,
      inserted,
      actorId
    );


    return inserted;

  }


  /**
   * ----------------------------------------------------------
   * CREATE FOR RESERVATION
   * ----------------------------------------------------------
   *
   * Used by DIRECT booking workflow.
   *
   * A block is created separately for each OTA source.
   *
   * Example:
   *
   * createForReservation(
   *   'RES-000005',
   *   'AIRBNB'
   * )
   * ----------------------------------------------------------
   */

  function createForReservation(
    reservationId,
    source,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const reservation =
      ReservationService
        .requireReservation(
          reservationId
        );


    source =
      normalize(source);


    if (!source) {

      throw new Error(
        'OTA source is required.'
      );

    }


    /*
     * This workflow exists to protect DIRECT inventory.
     */

    if (
      normalize(
        reservation.booking_source
      ) !== 'DIRECT'
    ) {

      throw new Error(
        'OTA block requests can only be automatically created ' +
        'for DIRECT reservations. Reservation ' +
        reservationId +
        ' source is ' +
        reservation.booking_source +
        '.'
      );

    }


    if (
      !ReservationService
        .isBlockingStatus(
          reservation.status
        )
    ) {

      throw new Error(
        'Cannot create OTA block for non-blocking reservation ' +
          reservationId +
          ' with status ' +
          reservation.status +
          '.'
      );

    }


    return createBlock(
      {

        reservation_id:
          reservation.reservation_id,

        unit_id:
          reservation.unit_id,

        source:
          source,

        start_date:
          reservation.check_in_date,

        end_date:
          reservation.check_out_date,

        status:
          STATUS.PENDING,

        notes:
          'Created from direct reservation ' +
          reservation.reservation_id

      },

      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * CREATE BLOCKS FOR MULTIPLE OTA SOURCES
   * ----------------------------------------------------------
   */

  function createForReservationSources(
    reservationId,
    sources,
    actorId
  ) {

    if (
      !Array.isArray(sources) ||
      sources.length === 0
    ) {

      throw new Error(
        'At least one OTA source is required.'
      );

    }


    const uniqueSources =
      Array.from(
        new Set(
          sources
            .map(normalize)
            .filter(Boolean)
        )
      );


    const created =
      [];


    uniqueSources.forEach(
      source => {

        created.push(
          createForReservation(
            reservationId,
            source,
            actorId
          )
        );

      }
    );


    return created;

  }


  /**
   * ----------------------------------------------------------
   * STATUS TRANSITIONS
   * ----------------------------------------------------------
   */

  function getAllowedTransitions() {

    return {

      PENDING: [
        'BLOCKED',
        'CANCELLED'
      ],

      BLOCKED: [
        'CANCELLED'
      ],

      CANCELLED: []

    };

  }


  function assertTransition(
    currentStatus,
    newStatus
  ) {

    currentStatus =
      normalize(
        currentStatus
      );


    newStatus =
      normalize(
        newStatus
      );


    if (
      currentStatus ===
      newStatus
    ) {

      return true;

    }


    const allowed =
      getAllowedTransitions()[
        currentStatus
      ] || [];


    if (
      !allowed.includes(
        newStatus
      )
    ) {

      throw new Error(
        'Invalid OTA block status transition: ' +
          currentStatus +
          ' -> ' +
          newStatus
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * CHANGE STATUS
   * ----------------------------------------------------------
   */

  function changeStatus(
    otaBlockId,
    newStatus,
    actorId,
    notes
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireBlock(
        otaBlockId
      );


    newStatus =
      normalize(
        newStatus
      );


    validateStatus(
      newStatus
    );


    assertTransition(
      existing.status,
      newStatus
    );


    if (
      normalize(
        existing.status
      ) ===
      newStatus
    ) {

      return existing;

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          status:
            newStatus,

          updated_at:
            timestamp(),

          updated_by:
            actorId
        }
      );


    if (
      !isBlank(notes)
    ) {

      updated.notes =
        normalizeText(notes);

    }


    if (
      newStatus ===
      STATUS.BLOCKED
    ) {

      updated.blocked_at =
        timestamp();

    }


    if (
      newStatus ===
      STATUS.CANCELLED
    ) {

      updated.cancelled_at =
        timestamp();

    }


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS.OTA_BLOCKS,
        'ota_block_id',
        otaBlockId,
        updated
      );


    AuditService.logStatusChange(
      ENTITY_TYPE,
      otaBlockId,
      existing.status,
      newStatus,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * WORKFLOW CONVENIENCE METHODS
   * ----------------------------------------------------------
   */

  function markBlocked(
    otaBlockId,
    actorId,
    notes
  ) {

    return changeStatus(
      otaBlockId,
      STATUS.BLOCKED,
      actorId,
      notes
    );

  }


  function cancelBlock(
    otaBlockId,
    actorId,
    notes
  ) {

    return changeStatus(
      otaBlockId,
      STATUS.CANCELLED,
      actorId,
      notes
    );

  }


  /**
   * ----------------------------------------------------------
   * CANCEL BLOCKS FOR RESERVATION
   * ----------------------------------------------------------
   */

  function cancelForReservation(
    reservationId,
    actorId,
    notes
  ) {

    const blocks =
      getByReservation(
        reservationId
      );


    const cancelled =
      [];


    blocks.forEach(block => {

      if (
        isBlockingStatus(
          block.status
        )
      ) {

        cancelled.push(
          cancelBlock(
            block.ota_block_id,
            actorId,
            notes ||
              (
                'Reservation ' +
                reservationId +
                ' no longer requires OTA blocking.'
              )
          )
        );

      }

    });


    return cancelled;

  }


  /**
   * ----------------------------------------------------------
   * PENDING WORK QUEUE
   * ----------------------------------------------------------
   */

  function getPendingBlocks() {

    return getByStatus(
      STATUS.PENDING
    );

  }


  function getBlockedBlocks() {

    return getByStatus(
      STATUS.BLOCKED
    );

  }


  function getCancelledBlocks() {

    return getByStatus(
      STATUS.CANCELLED
    );

  }


  function getOutstandingWork() {

    return getPendingBlocks()
      .slice()
      .sort(
        (a, b) => {

          const aDate =
            String(
              a.start_date || ''
            );


          const bDate =
            String(
              b.start_date || ''
            );


          return aDate.localeCompare(
            bDate
          );

        }
      );

  }


  function getOutstandingCount() {

    return getPendingBlocks()
      .length;

  }


  /**
   * ----------------------------------------------------------
   * CONFLICT QUERY
   * ----------------------------------------------------------
   */

  function getConflictingBlocks(
    unitId,
    startDate,
    endDate,
    excludeBlockId
  ) {

    unitId =
      normalizeText(
        unitId
      );


    startDate =
      normalizeDate(
        startDate
      );


    endDate =
      normalizeDate(
        endDate
      );


    AvailabilityService
      .validateDateRange(
        startDate,
        endDate
      );


    excludeBlockId =
      normalizeText(
        excludeBlockId
      );


    return getByUnit(
      unitId
    )
    .filter(block => {

      if (
        excludeBlockId &&
        normalizeText(
          block.ota_block_id
        ) ===
          excludeBlockId
      ) {

        return false;

      }


      if (
        !isBlockingStatus(
          block.status
        )
      ) {

        return false;

      }


      try {

        return AvailabilityService
          .rangesOverlap(
            block.start_date,
            block.end_date,
            startDate,
            endDate
          );

      } catch (err) {

        return false;

      }

    });

  }


  /**
   * ----------------------------------------------------------
   * UPDATE BLOCK DETAILS
   * ----------------------------------------------------------
   *
   * Intended mainly for notes / source corrections.
   *
   * Status must go through changeStatus().
   * ----------------------------------------------------------
   */

  function updateBlock(
    otaBlockId,
    changes,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireBlock(
        otaBlockId
      );


    if (
      !changes ||
      typeof changes !== 'object'
    ) {

      throw new Error(
        'OTA block changes are required.'
      );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'ota_block_id'
      ) &&
      normalizeText(
        changes.ota_block_id
      ) !==
        normalizeText(
          existing.ota_block_id
        )
    ) {

      throw new Error(
        'ota_block_id cannot be changed.'
      );

    }


    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'status'
      ) &&
      normalize(
        changes.status
      ) !==
        normalize(
          existing.status
        )
    ) {

      throw new Error(
        'OTA block status must be changed using changeStatus().'
      );

    }


    let updated =
      Object.assign(
        {},
        existing,
        changes
      );


    updated.ota_block_id =
      existing.ota_block_id;


    if (
      Object.prototype.hasOwnProperty.call(
        existing,
        'created_at'
      )
    ) {

      updated.created_at =
        existing.created_at;

    }


    updated =
      normalizeBlock(
        updated
      );


    validateBlock(
      updated
    );


    /*
     * Prevent an update from accidentally creating a
     * duplicate blocking request.
     */

    if (
      isBlockingStatus(
        updated.status
      )
    ) {

      const duplicate =
        getAll()
          .find(block => {

            if (
              normalizeText(
                block.ota_block_id
              ) ===
                normalizeText(
                  otaBlockId
                )
            ) {

              return false;

            }


            if (
              !isBlockingStatus(
                block.status
              )
            ) {

              return false;

            }


            if (
              normalize(
                block.source
              ) !==
                normalize(
                  updated.source
                )
            ) {

              return false;

            }


            if (
              !isBlank(
                updated.reservation_id
              ) &&
              !isBlank(
                block.reservation_id
              )
            ) {

              return (
                normalizeText(
                  block.reservation_id
                ) ===
                normalizeText(
                  updated.reservation_id
                )
              );

            }


            return (
              normalizeText(
                block.unit_id
              ) ===
                normalizeText(
                  updated.unit_id
                ) &&

              String(
                block.start_date
              ) ===
                String(
                  updated.start_date
                ) &&

              String(
                block.end_date
              ) ===
                String(
                  updated.end_date
                )
            );

          });


      if (duplicate) {

        throw new Error(
          'Another active OTA block already exists: ' +
            duplicate.ota_block_id
        );

      }

    }


    updated.updated_at =
      timestamp();

    updated.updated_by =
      actorId;


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS.OTA_BLOCKS,
        'ota_block_id',
        otaBlockId,
        updated
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      otaBlockId,
      existing,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * INTEGRITY HELPERS
   * ----------------------------------------------------------
   */

  function findOrphanBlocks() {

    const units =
      new Set(
        UnitService
          .getAllUnits()
          .map(
            unit =>
              normalizeText(
                unit.unit_id
              )
          )
      );


    return getAll()
      .filter(
        block =>
          !units.has(
            normalizeText(
              block.unit_id
            )
          )
      );

  }


  function findInvalidStatuses() {

    return getAll()
      .filter(
        block =>
          !VALID_STATUSES.has(
            normalize(
              block.status
            )
          )
      );

  }


  function findInvalidDateRanges() {

    return getAll()
      .filter(block => {

        try {

          AvailabilityService
            .validateDateRange(
              block.start_date,
              block.end_date
            );


          return false;

        } catch (err) {

          return true;

        }

      });

  }


  function findOrphanReservationLinks() {

    const headers =
      BaseRepository.getHeaders(
        CONFIG.SHEETS.OTA_BLOCKS
      );


    if (
      !headers.includes(
        'reservation_id'
      )
    ) {

      return [];

    }


    return getAll()
      .filter(block => {

        if (
          isBlank(
            block.reservation_id
          )
        ) {

          return false;

        }


        return !ReservationService.exists(
          block.reservation_id
        );

      });

  }


  function findDuplicateBlockingBlocks() {

    const blocks =
      getAll()
        .filter(
          block =>
            isBlockingStatus(
              block.status
            )
        );


    const duplicates =
      [];


    for (
      let i = 0;
      i < blocks.length;
      i++
    ) {

      for (
        let j = i + 1;
        j < blocks.length;
        j++
      ) {

        const a =
          blocks[i];

        const b =
          blocks[j];


        if (
          normalize(
            a.source
          ) !==
            normalize(
              b.source
            )
        ) {

          continue;

        }


        let duplicate =
          false;


        if (
          !isBlank(
            a.reservation_id
          ) &&
          !isBlank(
            b.reservation_id
          )
        ) {

          duplicate =
            normalizeText(
              a.reservation_id
            ) ===
            normalizeText(
              b.reservation_id
            );

        } else {

          duplicate =
            (
              normalizeText(
                a.unit_id
              ) ===
                normalizeText(
                  b.unit_id
                )
            ) &&
            (
              String(
                a.start_date
              ) ===
                String(
                  b.start_date
                )
            ) &&
            (
              String(
                a.end_date
              ) ===
                String(
                  b.end_date
                )
            );

        }


        if (duplicate) {

          duplicates.push({

            first_block_id:
              a.ota_block_id,

            second_block_id:
              b.ota_block_id,

            reservation_id:
              a.reservation_id ||
              b.reservation_id ||
              '',

            unit_id:
              a.unit_id,

            source:
              a.source

          });

        }

      }

    }


    return duplicates;

  }


  /**
   * ----------------------------------------------------------
   * SUMMARY
   * ----------------------------------------------------------
   */

  function getStatusSummary() {

    const blocks =
      getAll();


    const summary = {

      total:
        blocks.length,

      pending:
        0,

      blocked:
        0,

      cancelled:
        0,

      blocking:
        0

    };


    blocks.forEach(block => {

      const status =
        normalize(
          block.status
        );


      if (
        status ===
        STATUS.PENDING
      ) {

        summary.pending++;

      }


      if (
        status ===
        STATUS.BLOCKED
      ) {

        summary.blocked++;

      }


      if (
        status ===
        STATUS.CANCELLED
      ) {

        summary.cancelled++;

      }


      if (
        isBlockingStatus(
          status
        )
      ) {

        summary.blocking++;

      }

    });


    return summary;

  }


  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {

    createBlock,

    createForReservation,

    createForReservationSources,

    updateBlock,

    changeStatus,

    markBlocked,

    cancelBlock,

    cancelForReservation,

    getAll,

    getById,

    exists,

    requireBlock,

    getByUnit,

    getByReservation,

    getByStatus,

    getBySource,

    getPendingBlocks,

    getBlockedBlocks,

    getCancelledBlocks,

    getOutstandingWork,

    getOutstandingCount,

    getConflictingBlocks,

    getStatusSummary,

    isBlockingStatus,

    validateStatus,

    validateBlock,

    getAllowedTransitions,

    assertTransition,

    findExistingBlockingBlock,

    findOrphanBlocks,

    findInvalidStatuses,

    findInvalidDateRanges,

    findOrphanReservationLinks,

    findDuplicateBlockingBlocks

  };

})();