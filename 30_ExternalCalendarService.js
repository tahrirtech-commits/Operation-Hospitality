/**
 * ============================================================
 * 30_ExternalCalendarService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Phase 2 - Calendar & Availability
 *
 * Data source:
 *
 * 13_ExternalCalendarEvents
 *
 * Purpose:
 *
 * Store normalized calendar events imported from external
 * calendar feeds such as:
 *
 * AIRBNB
 * BOOKING_COM
 * OTHER
 *
 * IMPORTANT:
 *
 * This service does NOT:
 *
 * - Download iCal feeds
 * - Parse ICS files
 * - Calculate final availability
 *
 * Those responsibilities belong to:
 *
 * 31_ICalService.gs
 * 32_AvailabilityService.gs
 * 33_CalendarSyncService.gs
 *
 * ------------------------------------------------------------
 * DATE MODEL
 * ------------------------------------------------------------
 *
 * External calendar events use checkout-exclusive ranges:
 *
 * start_date = first blocked night
 * end_date   = checkout / first available day
 *
 * Example:
 *
 * start_date = 2026-10-10
 * end_date   = 2026-10-13
 *
 * Blocks nights:
 *
 * 10 Oct
 * 11 Oct
 * 12 Oct
 *
 * 13 Oct is NOT blocked by this event.
 *
 * Overlap rule:
 *
 * event.start_date < requestedEnd
 * AND
 * event.end_date > requestedStart
 *
 * ============================================================
 */

const ExternalCalendarService = (() => {

  const ENTITY_TYPE =
    'EXTERNAL_CALENDAR_EVENT';


  const STATUS_ACTIVE =
    'ACTIVE';


  const STATUS_INACTIVE =
    'INACTIVE';


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
   * TODAY
   * ----------------------------------------------------------
   */

  function today() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );

  }


  /**
   * ----------------------------------------------------------
   * IS BLANK
   * ----------------------------------------------------------
   */

  function isBlank(value) {

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE TEXT
   * ----------------------------------------------------------
   */

  function normalizeText(value) {

    if (isBlank(value)) {

      return '';

    }


    return String(value).trim();

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE UPPERCASE
   * ----------------------------------------------------------
   */

  function normalizeUpper(value) {

    return normalizeText(
      value
    ).toUpperCase();

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE ACTOR
   * ----------------------------------------------------------
   */

  function normalizeActorId(actorId) {

    if (isBlank(actorId)) {

      return CONFIG.DEFAULTS.ACTOR_ID;

    }


    return normalizeText(
      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE SOURCE
   * ----------------------------------------------------------
   */

  function normalizeSource(source) {

    const normalized =
      normalizeUpper(
        source
      );


    if (!normalized) {

      throw new Error(
        'source is required.'
      );

    }


    return normalized;

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE STATUS
   * ----------------------------------------------------------
   */

  function normalizeStatus(status) {

    const normalized =
      normalizeUpper(
        status
      );


    if (
      normalized !== STATUS_ACTIVE &&
      normalized !== STATUS_INACTIVE
    ) {

      throw new Error(
        'External calendar event status must be ' +
        'ACTIVE or INACTIVE.'
      );

    }


    return normalized;

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE DATE
   * ----------------------------------------------------------
   *
   * Accepts:
   *
   * Date
   * YYYY-MM-DD
   *
   * Returns:
   *
   * YYYY-MM-DD
   */

  function normalizeDate(
    value,
    fieldName
  ) {

    if (isBlank(value)) {

      throw new Error(
        fieldName +
        ' is required.'
      );

    }


    if (
      Object.prototype
        .toString
        .call(value) ===
      '[object Date]'
    ) {

      if (
        isNaN(
          value.getTime()
        )
      ) {

        throw new Error(
          fieldName +
          ' is not a valid date.'
        );

      }


      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE,
        CONFIG.DATE_FORMATS.DATE
      );

    }


    const text =
      normalizeText(
        value
      );


    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(text)
    ) {

      throw new Error(
        fieldName +
        ' must use YYYY-MM-DD format.'
      );

    }


    /*
     * Validate actual calendar date.
     */

    const parts =
      text.split('-');


    const year =
      Number(parts[0]);


    const month =
      Number(parts[1]);


    const day =
      Number(parts[2]);


    const date =
      new Date(
        year,
        month - 1,
        day
      );


    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {

      throw new Error(
        fieldName +
        ' is not a valid calendar date.'
      );

    }


    return text;

  }


  /**
   * ----------------------------------------------------------
   * DATE TO NUMBER
   * ----------------------------------------------------------
   *
   * Converts YYYY-MM-DD into a UTC timestamp used only for
   * date comparisons.
   *
   * This avoids local daylight/timezone effects.
   */

  function dateToNumber(value) {

    const normalized =
      normalizeDate(
        value,
        'date'
      );


    const parts =
      normalized.split('-');


    return Date.UTC(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE DATE RANGE
   * ----------------------------------------------------------
   */

  function validateDateRange(
    startDate,
    endDate
  ) {

    const start =
      normalizeDate(
        startDate,
        'start_date'
      );


    const end =
      normalizeDate(
        endDate,
        'end_date'
      );


    if (
      dateToNumber(end) <=
      dateToNumber(start)
    ) {

      throw new Error(
        'end_date must be after start_date.'
      );

    }


    return {

      start_date:
        start,

      end_date:
        end

    };

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE EVENT
   * ----------------------------------------------------------
   */

  function normalizeEvent(data) {

    const event =
      Object.assign(
        {},
        data || {}
      );


    if (
      event.external_event_id !== undefined
    ) {

      event.external_event_id =
        normalizeText(
          event.external_event_id
        );

    }


    if (
      event.unit_id !== undefined
    ) {

      event.unit_id =
        normalizeText(
          event.unit_id
        );

    }


    if (
      event.source !== undefined
    ) {

      event.source =
        normalizeUpper(
          event.source
        );

    }


    if (
      event.external_uid !== undefined
    ) {

      event.external_uid =
        normalizeText(
          event.external_uid
        );

    }


    if (
      event.summary !== undefined
    ) {

      event.summary =
        normalizeText(
          event.summary
        );

    }


    if (
      event.status !== undefined
    ) {

      event.status =
        normalizeUpper(
          event.status
        );

    }


    if (
      !isBlank(
        event.start_date
      )
    ) {

      event.start_date =
        normalizeDate(
          event.start_date,
          'start_date'
        );

    }


    if (
      !isBlank(
        event.end_date
      )
    ) {

      event.end_date =
        normalizeDate(
          event.end_date,
          'end_date'
        );

    }


    return event;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE EVENT
   * ----------------------------------------------------------
   */

  function validateEvent(event) {

    ValidationService.requireFields(
      event,
      [
        'unit_id',
        'source',
        'external_uid',
        'start_date',
        'end_date',
        'status'
      ]
    );


    /*
     * Unit FK.
     */

    ValidationService
      .validateUnitExists(
        event.unit_id
      );


    /*
     * Source.
     *
     * We deliberately do not use ReferenceData here yet.
     *
     * Phase 2 iCal integrations may introduce new source
     * identifiers without requiring a schema change.
     */

    normalizeSource(
      event.source
    );


    /*
     * Status.
     */

    normalizeStatus(
      event.status
    );


    /*
     * Date range.
     */

    validateDateRange(
      event.start_date,
      event.end_date
    );


    return true;

  }


  /**
   * ----------------------------------------------------------
   * REQUIRE EVENT
   * ----------------------------------------------------------
   */

  function requireEvent(
    externalEventId
  ) {

    if (
      isBlank(
        externalEventId
      )
    ) {

      throw new Error(
        'externalEventId is required.'
      );

    }


    const event =
      getById(
        externalEventId
      );


    if (!event) {

      throw new Error(
        'External calendar event not found: ' +
        externalEventId
      );

    }


    return event;

  }


  /**
   * ----------------------------------------------------------
   * FIND BY SOURCE UID
   * ----------------------------------------------------------
   *
   * external_uid alone is not assumed globally unique.
   *
   * Natural external identity:
   *
   * unit_id + source + external_uid
   */

  function findBySourceUid(
    unitId,
    source,
    externalUid
  ) {

    if (
      isBlank(unitId) ||
      isBlank(source) ||
      isBlank(externalUid)
    ) {

      return null;

    }


    const normalizedUnitId =
      normalizeText(
        unitId
      );


    const normalizedSource =
      normalizeUpper(
        source
      );


    const normalizedUid =
      normalizeText(
        externalUid
      );


    const events =
      BaseRepository.findByField(
        CONFIG
          .SHEETS
          .EXTERNAL_CALENDAR_EVENTS,
        'unit_id',
        normalizedUnitId
      );


    for (
      let i = 0;
      i < events.length;
      i++
    ) {

      if (
        normalizeUpper(
          events[i].source
        ) ===
        normalizedSource &&
        normalizeText(
          events[i].external_uid
        ) ===
        normalizedUid
      ) {

        return events[i];

      }

    }


    return null;

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE NATURAL KEY UNIQUE
   * ----------------------------------------------------------
   */

  function validateNaturalKeyUnique(
    event,
    exceptExternalEventId
  ) {

    const existing =
      findBySourceUid(
        event.unit_id,
        event.source,
        event.external_uid
      );


    if (!existing) {

      return true;

    }


    if (
      exceptExternalEventId &&
      normalizeText(
        existing.external_event_id
      ) ===
      normalizeText(
        exceptExternalEventId
      )
    ) {

      return true;

    }


    throw new Error(
      'External calendar event already exists for ' +
      'unit/source/external_uid: ' +
      event.unit_id +
      ' / ' +
      event.source +
      ' / ' +
      event.external_uid
    );

  }


  /**
   * ==========================================================
   * CREATE
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * CREATE EVENT
   * ----------------------------------------------------------
   */

  function createEvent(
    data,
    actorId
  ) {

    if (
      !data ||
      typeof data !== 'object'
    ) {

      throw new Error(
        'External calendar event data must be an object.'
      );

    }


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    let event =
      normalizeEvent(
        data
      );


    /*
     * External events are active by default.
     */

    if (
      isBlank(
        event.status
      )
    ) {

      event.status =
        STATUS_ACTIVE;

    }


    validateEvent(
      event
    );


    /*
     * Prevent duplicate OTA/iCal events.
     */

    validateNaturalKeyUnique(
      event
    );


    /*
     * Generate internal stable ID only after validation.
     */

    event.external_event_id =
      IdService.nextId(
        ENTITY_TYPE
      );


    const now =
      timestamp();


    /*
     * The event has just been observed from the external feed.
     */

    if (
      isBlank(
        event.last_seen_at
      )
    ) {

      event.last_seen_at =
        now;

    }


    event.created_at =
      now;


    event.updated_at =
      now;


    const inserted =
      BaseRepository.insert(
        CONFIG
          .SHEETS
          .EXTERNAL_CALENDAR_EVENTS,
        event
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      inserted.external_event_id,
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
   * GET BY ID
   * ----------------------------------------------------------
   */

  function getById(
    externalEventId
  ) {

    if (
      isBlank(
        externalEventId
      )
    ) {

      throw new Error(
        'externalEventId is required.'
      );

    }


    return BaseRepository.findById(
      CONFIG
        .SHEETS
        .EXTERNAL_CALENDAR_EVENTS,
      'external_event_id',
      normalizeText(
        externalEventId
      )
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ALL
   * ----------------------------------------------------------
   */

  function getAll() {

    return BaseRepository.findAll(
      CONFIG
        .SHEETS
        .EXTERNAL_CALENDAR_EVENTS
    );

  }


  /**
   * ----------------------------------------------------------
   * GET BY UNIT
   * ----------------------------------------------------------
   */

  function getByUnit(unitId) {

    ValidationService
      .validateUnitExists(
        unitId
      );


    return BaseRepository.findByField(
      CONFIG
        .SHEETS
        .EXTERNAL_CALENDAR_EVENTS,
      'unit_id',
      normalizeText(
        unitId
      )
    );

  }


  /**
   * ----------------------------------------------------------
   * GET ACTIVE BY UNIT
   * ----------------------------------------------------------
   */

  function getActiveByUnit(
    unitId
  ) {

    return getByUnit(
      unitId
    )
      .filter(
        event =>
          normalizeUpper(
            event.status
          ) ===
          STATUS_ACTIVE
      );

  }


  /**
   * ----------------------------------------------------------
   * GET BY SOURCE
   * ----------------------------------------------------------
   */

  function getBySource(source) {

    const normalizedSource =
      normalizeSource(
        source
      );


    return getAll()
      .filter(
        event =>
          normalizeUpper(
            event.source
          ) ===
          normalizedSource
      );

  }


  /**
   * ----------------------------------------------------------
   * GET ACTIVE EVENTS
   * ----------------------------------------------------------
   */

  function getActiveEvents() {

    return getAll()
      .filter(
        event =>
          normalizeUpper(
            event.status
          ) ===
          STATUS_ACTIVE
      );

  }


  /**
   * ----------------------------------------------------------
   * EXISTS
   * ----------------------------------------------------------
   */

  function exists(
    externalEventId
  ) {

    if (
      isBlank(
        externalEventId
      )
    ) {

      return false;

    }


    return BaseRepository.exists(
      CONFIG
        .SHEETS
        .EXTERNAL_CALENDAR_EVENTS,
      'external_event_id',
      normalizeText(
        externalEventId
      )
    );

  }


  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * UPDATE EVENT
   * ----------------------------------------------------------
   */

  function updateEvent(
    externalEventId,
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
      requireEvent(
        externalEventId
      );


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    /*
     * Stable internal ID cannot change.
     */

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          changes,
          'external_event_id'
        ) &&
      normalizeText(
        changes.external_event_id
      ) !==
      normalizeText(
        existing.external_event_id
      )
    ) {

      throw new Error(
        'external_event_id cannot be changed.'
      );

    }


    let merged =
      Object.assign(
        {},
        existing,
        changes
      );


    merged.external_event_id =
      existing.external_event_id;


    merged.created_at =
      existing.created_at;


    merged =
      normalizeEvent(
        merged
      );


    validateEvent(
      merged
    );


    validateNaturalKeyUnique(
      merged,
      existing.external_event_id
    );


    merged.updated_at =
      timestamp();


    const updated =
      BaseRepository.update(
        CONFIG
          .SHEETS
          .EXTERNAL_CALENDAR_EVENTS,
        'external_event_id',
        existing.external_event_id,
        merged
      );


    /*
     * Status changes receive a dedicated audit entry.
     */

    if (
      normalizeUpper(
        existing.status
      ) !==
      normalizeUpper(
        updated.status
      )
    ) {

      AuditService.logStatusChange(
        ENTITY_TYPE,
        existing.external_event_id,
        existing.status,
        updated.status,
        normalizedActorId
      );

    } else {

      AuditService.logUpdate(
        ENTITY_TYPE,
        existing.external_event_id,
        existing,
        updated,
        normalizedActorId
      );

    }


    return updated;

  }


  /**
   * ==========================================================
   * SYNC OPERATIONS
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * UPSERT EXTERNAL EVENT
   * ----------------------------------------------------------
   *
   * This is the main method that ICalService /
   * CalendarSyncService should use.
   *
   * Natural key:
   *
   * unit_id + source + external_uid
   *
   * If event exists:
   *     update it
   *
   * Otherwise:
   *     create it
   */

  function upsertEvent(
    data,
    actorId
  ) {

    if (
      !data ||
      typeof data !== 'object'
    ) {

      throw new Error(
        'External calendar event data must be an object.'
      );

    }


    let event =
      normalizeEvent(
        data
      );


    ValidationService.requireFields(
      event,
      [
        'unit_id',
        'source',
        'external_uid',
        'start_date',
        'end_date'
      ]
    );


    const existing =
      findBySourceUid(
        event.unit_id,
        event.source,
        event.external_uid
      );


    const now =
      timestamp();


    if (existing) {

      return updateEvent(
        existing.external_event_id,
        {
          summary:
            event.summary !== undefined
              ? event.summary
              : existing.summary,

          start_date:
            event.start_date,

          end_date:
            event.end_date,

          status:
            STATUS_ACTIVE,

          last_seen_at:
            now
        },
        actorId
      );

    }


    event.status =
      STATUS_ACTIVE;


    event.last_seen_at =
      now;


    return createEvent(
      event,
      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * MARK SEEN
   * ----------------------------------------------------------
   *
   * Used when sync sees an unchanged event.
   */

  function markSeen(
    externalEventId,
    actorId
  ) {

    requireEvent(
      externalEventId
    );


    return updateEvent(
      externalEventId,
      {
        last_seen_at:
          timestamp()
      },
      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * ACTIVATE EVENT
   * ----------------------------------------------------------
   */

  function activateEvent(
    externalEventId,
    actorId
  ) {

    return updateEvent(
      externalEventId,
      {
        status:
          STATUS_ACTIVE,

        last_seen_at:
          timestamp()
      },
      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * DEACTIVATE EVENT
   * ----------------------------------------------------------
   *
   * We intentionally do not delete imported events.
   *
   * An event disappearing from an iCal feed should be marked
   * INACTIVE so we retain traceability.
   */

  function deactivateEvent(
    externalEventId,
    actorId
  ) {

    return updateEvent(
      externalEventId,
      {
        status:
          STATUS_INACTIVE
      },
      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * DEACTIVATE MISSING EVENTS
   * ----------------------------------------------------------
   *
   * After a successful synchronization:
   *
   * CalendarSyncService provides the UIDs currently present
   * in the source feed.
   *
   * Existing ACTIVE events for that unit/source which are no
   * longer present are marked INACTIVE.
   *
   * Returns the events that were deactivated.
   */

  function deactivateMissingEvents(
    unitId,
    source,
    currentExternalUids,
    actorId
  ) {

    ValidationService
      .validateUnitExists(
        unitId
      );


    const normalizedSource =
      normalizeSource(
        source
      );


    if (
      !Array.isArray(
        currentExternalUids
      )
    ) {

      throw new Error(
        'currentExternalUids must be an array.'
      );

    }


    const currentUidSet =
      new Set(
        currentExternalUids
          .map(
            uid =>
              normalizeText(uid)
          )
          .filter(Boolean)
      );


    const events =
      getActiveByUnit(
        unitId
      )
        .filter(
          event =>
            normalizeUpper(
              event.source
            ) ===
            normalizedSource
        );


    const deactivated = [];


    events.forEach(
      event => {

        const uid =
          normalizeText(
            event.external_uid
          );


        if (
          !currentUidSet.has(
            uid
          )
        ) {

          const updated =
            deactivateEvent(
              event.external_event_id,
              actorId
            );


          deactivated.push(
            updated
          );

        }

      }
    );


    return deactivated;

  }


  /**
   * ==========================================================
   * CONFLICT / AVAILABILITY HELPERS
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * RANGES OVERLAP
   * ----------------------------------------------------------
   *
   * Checkout-exclusive comparison.
   *
   * A: [startA, endA)
   * B: [startB, endB)
   */

  function rangesOverlap(
    startA,
    endA,
    startB,
    endB
  ) {

    const a =
      validateDateRange(
        startA,
        endA
      );


    const b =
      validateDateRange(
        startB,
        endB
      );


    return (
      dateToNumber(
        a.start_date
      ) <
      dateToNumber(
        b.end_date
      ) &&

      dateToNumber(
        a.end_date
      ) >
      dateToNumber(
        b.start_date
      )
    );

  }


  /**
   * ----------------------------------------------------------
   * GET CONFLICTING EVENTS
   * ----------------------------------------------------------
   */

  function getConflictingEvents(
    unitId,
    startDate,
    endDate
  ) {

    ValidationService
      .validateUnitExists(
        unitId
      );


    const requestedRange =
      validateDateRange(
        startDate,
        endDate
      );


    return getActiveByUnit(
      unitId
    )
      .filter(
        event =>
          rangesOverlap(
            event.start_date,
            event.end_date,
            requestedRange.start_date,
            requestedRange.end_date
          )
      );

  }


  /**
   * ----------------------------------------------------------
   * HAS CONFLICT
   * ----------------------------------------------------------
   */

  function hasConflict(
    unitId,
    startDate,
    endDate
  ) {

    return (
      getConflictingEvents(
        unitId,
        startDate,
        endDate
      ).length > 0
    );

  }


  /**
   * ----------------------------------------------------------
   * GET FUTURE ACTIVE EVENTS
   * ----------------------------------------------------------
   */

  function getFutureActiveEvents(
    unitId
  ) {

    const currentDate =
      today();


    return getActiveByUnit(
      unitId
    )
      .filter(
        event =>
          dateToNumber(
            event.end_date
          ) >
          dateToNumber(
            currentDate
          )
      )
      .sort(
        (a, b) =>
          dateToNumber(
            a.start_date
          ) -
          dateToNumber(
            b.start_date
          )
      );

  }


  /**
   * ==========================================================
   * INTEGRITY HELPERS
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * FIND ORPHAN EVENTS
   * ----------------------------------------------------------
   */

  function findOrphanEvents() {

    const units =
      BaseRepository.findAll(
        CONFIG.SHEETS.UNITS
      );


    const unitIds =
      new Set(
        units
          .map(
            unit =>
              normalizeText(
                unit.unit_id
              )
          )
          .filter(Boolean)
      );


    return getAll()
      .filter(
        event =>
          !unitIds.has(
            normalizeText(
              event.unit_id
            )
          )
      );

  }


  /**
   * ----------------------------------------------------------
   * FIND DUPLICATE EXTERNAL EVENTS
   * ----------------------------------------------------------
   *
   * Duplicate natural key:
   *
   * unit_id + source + external_uid
   */

  function findDuplicateEvents() {

    const events =
      getAll();


    const groups = {};


    events.forEach(
      event => {

        const unitId =
          normalizeText(
            event.unit_id
          );


        const source =
          normalizeUpper(
            event.source
          );


        const uid =
          normalizeText(
            event.external_uid
          );


        if (
          !unitId ||
          !source ||
          !uid
        ) {

          return;

        }


        const key =
          unitId +
          '|' +
          source +
          '|' +
          uid;


        if (!groups[key]) {

          groups[key] = [];

        }


        groups[key].push(
          event
        );

      }
    );


    return Object.keys(
      groups
    )
      .filter(
        key =>
          groups[key].length > 1
      )
      .map(
        key => {

          const sample =
            groups[key][0];


          return {

            unit_id:
              sample.unit_id,

            source:
              sample.source,

            external_uid:
              sample.external_uid,

            count:
              groups[key].length,

            events:
              groups[key]

          };

        }
      );

  }


  /**
   * ----------------------------------------------------------
   * FIND INVALID DATE RANGES
   * ----------------------------------------------------------
   */

  function findInvalidDateRanges() {

    const invalid = [];


    getAll()
      .forEach(
        event => {

          try {

            validateDateRange(
              event.start_date,
              event.end_date
            );

          } catch (e) {

            invalid.push(
              Object.assign(
                {},
                event,
                {
                  integrity_error:
                    e.message
                }
              )
            );

          }

        }
      );


    return invalid;

  }


  /**
   * ----------------------------------------------------------
   * FIND INVALID STATUSES
   * ----------------------------------------------------------
   */

  function findInvalidStatuses() {

    return getAll()
      .filter(
        event => {

          try {

            normalizeStatus(
              event.status
            );


            return false;

          } catch (e) {

            return true;

          }

        }
      );

  }


  /**
   * ----------------------------------------------------------
   * FIND MISSING NATURAL KEYS
   * ----------------------------------------------------------
   */

  function findMissingNaturalKeys() {

    return getAll()
      .filter(
        event =>
          isBlank(
            event.unit_id
          ) ||
          isBlank(
            event.source
          ) ||
          isBlank(
            event.external_uid
          )
      );

  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {

    /*
     * Create / update
     */

    createEvent,

    updateEvent,

    upsertEvent,


    /*
     * Read
     */

    getById,

    getAll,

    getByUnit,

    getActiveByUnit,

    getBySource,

    getActiveEvents,

    findBySourceUid,

    exists,


    /*
     * Sync lifecycle
     */

    markSeen,

    activateEvent,

    deactivateEvent,

    deactivateMissingEvents,


    /*
     * Availability helpers
     */

    rangesOverlap,

    getConflictingEvents,

    hasConflict,

    getFutureActiveEvents,


    /*
     * Integrity helpers
     */

    findOrphanEvents,

    findDuplicateEvents,

    findInvalidDateRanges,

    findInvalidStatuses,

    findMissingNaturalKeys

  };

})();