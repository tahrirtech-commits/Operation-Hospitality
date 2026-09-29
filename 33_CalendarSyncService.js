/**
 * ============================================================
 * 33_CalendarSyncService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Phase 2 - Calendar & Availability
 *
 * PURPOSE
 * ------------------------------------------------------------
 *
 * Orchestrates synchronization of external iCalendar feeds.
 *
 * Responsibilities:
 *
 * - Determine which units have external calendar feeds
 * - Synchronize one calendar feed
 * - Synchronize all feeds for one unit
 * - Synchronize all configured feeds
 * - Isolate failures between feeds
 * - Produce synchronization reports
 *
 * ------------------------------------------------------------
 * DEPENDENCIES
 * ------------------------------------------------------------
 *
 * 30_ExternalCalendarService.gs
 * 31_ICalService.gs
 *
 * ------------------------------------------------------------
 * IMPORTANT
 * ------------------------------------------------------------
 *
 * This service does NOT:
 *
 * - Parse ICS itself
 * - Directly write external calendar events
 * - Calculate unit availability
 *
 * Flow:
 *
 * CalendarSyncService
 *        │
 *        ▼
 * ICalService
 *        │
 *        ▼
 * ExternalCalendarService
 *        │
 *        ▼
 * 13_ExternalCalendarEvents
 *
 * ============================================================
 */

const CalendarSyncService = (() => {

  /**
   * ==========================================================
   * CONFIGURATION
   * ==========================================================
   *
   * For Phase 2 MVP, calendar feed URLs are expected on
   * 02_Units.
   *
   * Supported optional columns:
   *
   * airbnb_ical_url
   * booking_ical_url
   * other_ical_url
   *
   * This keeps credentials/feed configuration on the unit
   * master without creating another configuration sheet yet.
   *
   * IMPORTANT:
   *
   * These URLs must never be written to logs or audit details.
   */

  const FEED_DEFINITIONS = [

    {
      source:
        'AIRBNB',

      field:
        'airbnb_ical_url'
    },

    {
      source:
        'BOOKING_COM',

      field:
        'booking_ical_url'
    },

    {
      source:
        'OTHER',

      field:
        'other_ical_url'
    }

  ];


  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
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


  function normalizeUpper(value) {

    return normalizeText(
      value
    ).toUpperCase();

  }


  function normalizeActorId(actorId) {

    if (isBlank(actorId)) {

      return CONFIG.DEFAULTS.ACTOR_ID;

    }


    return normalizeText(
      actorId
    );

  }


  function timestamp() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME
    );

  }


  /**
   * ----------------------------------------------------------
   * REQUIRE UNIT
   * ----------------------------------------------------------
   */

  function requireUnit(unitId) {

    if (
      isBlank(
        unitId
      )
    ) {

      throw new Error(
        'unitId is required.'
      );

    }


    const unit =
      UnitService.getUnitById(
        normalizeText(
          unitId
        )
      );


    if (!unit) {

      throw new Error(
        'Unit not found: ' +
        unitId
      );

    }


    return unit;

  }


  /**
   * ----------------------------------------------------------
   * MASK URL
   * ----------------------------------------------------------
   *
   * Never expose full OTA calendar URLs in logs/reports.
   *
   * Example:
   *
   * https://example.com/secret/calendar.ics
   *
   * becomes:
   *
   * https://example.com/...
   */

  function maskUrl(url) {

    if (
      isBlank(
        url
      )
    ) {

      return '';

    }


    const text =
      normalizeText(
        url
      );


    const match =
      text.match(
        /^(https?:\/\/[^\/]+)/i
      );


    if (!match) {

      return '[configured URL]';

    }


    return (
      match[1] +
      '/...'
    );

  }


  /**
   * ==========================================================
   * FEED DISCOVERY
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * GET UNIT FEEDS
   * ----------------------------------------------------------
   *
   * Returns configured feeds for a unit.
   *
   * Example:
   *
   * [
   *   {
   *     unit_id: "UNIT-000001",
   *     source: "AIRBNB",
   *     calendar_url: "..."
   *   }
   * ]
   */

  function getUnitFeeds(unitId) {

    const unit =
      requireUnit(
        unitId
      );


    const feeds = [];


    FEED_DEFINITIONS.forEach(
      definition => {

        const url =
          unit[
            definition.field
          ];


        if (
          isBlank(
            url
          )
        ) {

          return;

        }


        feeds.push({

          unit_id:
            unit.unit_id,

          property_id:
            unit.property_id,

          unit_code:
            unit.unit_code,

          source:
            definition.source,

          calendar_url:
            normalizeText(
              url
            )

        });

      }
    );


    return feeds;

  }


  /**
   * ----------------------------------------------------------
   * GET ALL CONFIGURED FEEDS
   * ----------------------------------------------------------
   */

  function getAllConfiguredFeeds(
    includeInactiveUnits
  ) {

    let units =
      UnitService.getAllUnits();


    /*
     * Normally inactive units should not be synchronized.
     */

    if (
      includeInactiveUnits !== true
    ) {

      units =
        units.filter(
          unit =>
            normalizeUpper(
              unit.status
            ) ===
            'ACTIVE'
        );

    }


    const feeds = [];


    units.forEach(
      unit => {

        FEED_DEFINITIONS.forEach(
          definition => {

            const url =
              unit[
                definition.field
              ];


            if (
              isBlank(
                url
              )
            ) {

              return;

            }


            feeds.push({

              unit_id:
                unit.unit_id,

              property_id:
                unit.property_id,

              unit_code:
                unit.unit_code,

              source:
                definition.source,

              calendar_url:
                normalizeText(
                  url
                )

            });

          }
        );

      }
    );


    return feeds;

  }


  /**
   * ==========================================================
   * SINGLE FEED SYNC
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * SYNC FEED
   * ----------------------------------------------------------
   *
   * Synchronizes one:
   *
   * unit + source + calendar URL
   *
   * Throws on failure.
   *
   * Use syncFeedSafe() when failure isolation is required.
   */

  function syncFeed(
    unitId,
    source,
    calendarUrl,
    actorId
  ) {

    const unit =
      requireUnit(
        unitId
      );


    const normalizedSource =
      normalizeUpper(
        source
      );


    if (!normalizedSource) {

      throw new Error(
        'source is required.'
      );

    }


    if (
      isBlank(
        calendarUrl
      )
    ) {

      throw new Error(
        'calendarUrl is required.'
      );

    }


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    const startedAt =
      new Date();


    /*
     * ICalService performs:
     *
     * fetch
     * parse
     * upsert
     * deactivate disappeared events
     */

    const result =
      ICalService.syncCalendar(
        unit.unit_id,
        normalizedSource,
        calendarUrl,
        normalizedActorId
      );


    const finishedAt =
      new Date();


    return {

      success:
        true,

      unit_id:
        unit.unit_id,

      property_id:
        unit.property_id,

      unit_code:
        unit.unit_code,

      source:
        normalizedSource,

      calendar:
        maskUrl(
          calendarUrl
        ),

      started_at:
        Utilities.formatDate(
          startedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      completed_at:
        Utilities.formatDate(
          finishedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      duration_ms:
        finishedAt.getTime() -
        startedAt.getTime(),

      feed_event_count:
        result.feed_event_count || 0,

      created_count:
        result.created_count || 0,

      updated_count:
        result.updated_count || 0,

      deactivated_count:
        result.deactivated_count || 0

    };

  }


  /**
   * ----------------------------------------------------------
   * SYNC FEED SAFE
   * ----------------------------------------------------------
   *
   * Same operation as syncFeed(), but converts failures into
   * a result object instead of throwing.
   *
   * This is what batch synchronization should use.
   */

  function syncFeedSafe(
    unitId,
    source,
    calendarUrl,
    actorId
  ) {

    const startedAt =
      new Date();


    try {

      return syncFeed(
        unitId,
        source,
        calendarUrl,
        actorId
      );

    } catch (error) {

      const finishedAt =
        new Date();


      return {

        success:
          false,

        unit_id:
          normalizeText(
            unitId
          ),

        source:
          normalizeUpper(
            source
          ),

        calendar:
          maskUrl(
            calendarUrl
          ),

        started_at:
          Utilities.formatDate(
            startedAt,
            CONFIG.TIMEZONE,
            CONFIG.DATE_FORMATS.DATETIME
          ),

        completed_at:
          Utilities.formatDate(
            finishedAt,
            CONFIG.TIMEZONE,
            CONFIG.DATE_FORMATS.DATETIME
          ),

        duration_ms:
          finishedAt.getTime() -
          startedAt.getTime(),

        feed_event_count:
          0,

        created_count:
          0,

        updated_count:
          0,

        deactivated_count:
          0,

        error:
          error.message

      };

    }

  }


  /**
   * ==========================================================
   * UNIT SYNCHRONIZATION
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * SYNC UNIT
   * ----------------------------------------------------------
   *
   * Synchronizes all configured feeds belonging to one unit.
   *
   * Failure of Airbnb does not prevent Booking.com from being
   * synchronized.
   */

  function syncUnit(
    unitId,
    actorId
  ) {

    const unit =
      requireUnit(
        unitId
      );


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    const startedAt =
      new Date();


    const feeds =
      getUnitFeeds(
        unit.unit_id
      );


    const results = [];


    feeds.forEach(
      feed => {

        const result =
          syncFeedSafe(
            feed.unit_id,
            feed.source,
            feed.calendar_url,
            normalizedActorId
          );


        results.push(
          result
        );

      }
    );


    const finishedAt =
      new Date();


    const summary =
      summarizeResults(
        results
      );


    return {

      success:
        summary.failed_feeds === 0,

      unit_id:
        unit.unit_id,

      property_id:
        unit.property_id,

      unit_code:
        unit.unit_code,

      started_at:
        Utilities.formatDate(
          startedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      completed_at:
        Utilities.formatDate(
          finishedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      duration_ms:
        finishedAt.getTime() -
        startedAt.getTime(),

      summary:
        summary,

      results:
        results

    };

  }


  /**
   * ==========================================================
   * PROPERTY SYNCHRONIZATION
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * SYNC PROPERTY
   * ----------------------------------------------------------
   */

  function syncProperty(
    propertyId,
    actorId
  ) {

    if (
      isBlank(
        propertyId
      )
    ) {

      throw new Error(
        'propertyId is required.'
      );

    }


    const property =
      PropertyService
        .getPropertyById(
          normalizeText(
            propertyId
          )
        );


    if (!property) {

      throw new Error(
        'Property not found: ' +
        propertyId
      );

    }


    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    const startedAt =
      new Date();


    const feeds =
      getAllConfiguredFeeds(false)
        .filter(
          feed =>
            normalizeText(
              feed.property_id
            ) ===
            normalizeText(
              propertyId
            )
        );


    const results = [];


    feeds.forEach(
      feed => {

        results.push(
          syncFeedSafe(
            feed.unit_id,
            feed.source,
            feed.calendar_url,
            normalizedActorId
          )
        );

      }
    );


    const finishedAt =
      new Date();


    return {

      success:
        results.every(
          result =>
            result.success
        ),

      property_id:
        property.property_id,

      property_code:
        property.property_code,

      started_at:
        Utilities.formatDate(
          startedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      completed_at:
        Utilities.formatDate(
          finishedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      duration_ms:
        finishedAt.getTime() -
        startedAt.getTime(),

      summary:
        summarizeResults(
          results
        ),

      results:
        results

    };

  }


  /**
   * ==========================================================
   * GLOBAL SYNCHRONIZATION
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * SYNC ALL
   * ----------------------------------------------------------
   *
   * Synchronizes every configured feed belonging to ACTIVE
   * units.
   *
   * IMPORTANT:
   *
   * Every feed is isolated.
   *
   * One broken URL will NOT stop the remaining units.
   */

  function syncAll(actorId) {

    const normalizedActorId =
      normalizeActorId(
        actorId
      );


    const startedAt =
      new Date();


    const feeds =
      getAllConfiguredFeeds(
        false
      );


    const results = [];


    feeds.forEach(
      feed => {

        const result =
          syncFeedSafe(
            feed.unit_id,
            feed.source,
            feed.calendar_url,
            normalizedActorId
          );


        results.push(
          result
        );

      }
    );


    const finishedAt =
      new Date();


    const summary =
      summarizeResults(
        results
      );


    return {

      success:
        summary.failed_feeds === 0,

      started_at:
        Utilities.formatDate(
          startedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      completed_at:
        Utilities.formatDate(
          finishedAt,
          CONFIG.TIMEZONE,
          CONFIG.DATE_FORMATS.DATETIME
        ),

      duration_ms:
        finishedAt.getTime() -
        startedAt.getTime(),

      summary:
        summary,

      results:
        results

    };

  }


  /**
   * ==========================================================
   * RESULT SUMMARY
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * SUMMARIZE RESULTS
   * ----------------------------------------------------------
   */

  function summarizeResults(
    results
  ) {

    const list =
      Array.isArray(
        results
      )
        ? results
        : [];


    const summary = {

      total_feeds:
        list.length,

      successful_feeds:
        0,

      failed_feeds:
        0,

      feed_events:
        0,

      created:
        0,

      updated:
        0,

      deactivated:
        0

    };


    list.forEach(
      result => {

        if (
          result.success
        ) {

          summary
            .successful_feeds++;

        } else {

          summary
            .failed_feeds++;

        }


        summary.feed_events +=
          Number(
            result.feed_event_count ||
            0
          );


        summary.created +=
          Number(
            result.created_count ||
            0
          );


        summary.updated +=
          Number(
            result.updated_count ||
            0
          );


        summary.deactivated +=
          Number(
            result.deactivated_count ||
            0
          );

      }
    );


    return summary;

  }


  /**
   * ==========================================================
   * DIAGNOSTICS
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * GET SYNC CONFIGURATION
   * ----------------------------------------------------------
   *
   * Returns feed configuration WITHOUT revealing URLs.
   */

  function getSyncConfiguration() {

    const feeds =
      getAllConfiguredFeeds(
        true
      );


    return feeds.map(
      feed => ({

        unit_id:
          feed.unit_id,

        property_id:
          feed.property_id,

        unit_code:
          feed.unit_code,

        source:
          feed.source,

        calendar:
          maskUrl(
            feed.calendar_url
          )

      })
    );

  }


  /**
   * ----------------------------------------------------------
   * GET UNIT SYNC CONFIGURATION
   * ----------------------------------------------------------
   */

  function getUnitSyncConfiguration(
    unitId
  ) {

    return getUnitFeeds(
      unitId
    )
      .map(
        feed => ({

          unit_id:
            feed.unit_id,

          property_id:
            feed.property_id,

          unit_code:
            feed.unit_code,

          source:
            feed.source,

          calendar:
            maskUrl(
              feed.calendar_url
            )

        })
      );

  }


  /**
   * ----------------------------------------------------------
   * INSPECT UNIT FEEDS
   * ----------------------------------------------------------
   *
   * Fetch and parse configured feeds without changing stored
   * external calendar events.
   *
   * Useful before enabling synchronization.
   */

  function inspectUnitFeeds(
    unitId
  ) {

    const feeds =
      getUnitFeeds(
        unitId
      );


    const results = [];


    feeds.forEach(
      feed => {

        const startedAt =
          new Date();


        try {

          const inspection =
            ICalService
              .inspectCalendar(
                feed.calendar_url
              );


          const finishedAt =
            new Date();


          results.push({

            success:
              true,

            unit_id:
              feed.unit_id,

            source:
              feed.source,

            calendar:
              maskUrl(
                feed.calendar_url
              ),

            event_count:
              inspection.event_count,

            duration_ms:
              finishedAt.getTime() -
              startedAt.getTime()

          });

        } catch (error) {

          const finishedAt =
            new Date();


          results.push({

            success:
              false,

            unit_id:
              feed.unit_id,

            source:
              feed.source,

            calendar:
              maskUrl(
                feed.calendar_url
              ),

            event_count:
              0,

            duration_ms:
              finishedAt.getTime() -
              startedAt.getTime(),

            error:
              error.message

          });

        }

      }
    );


    return {

      unit_id:
        normalizeText(
          unitId
        ),

      summary:
        {

          total_feeds:
            results.length,

          valid_feeds:
            results.filter(
              result =>
                result.success
            ).length,

          invalid_feeds:
            results.filter(
              result =>
                !result.success
            ).length

        },

      results:
        results

    };

  }


  /**
   * ==========================================================
   * LOGGING
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * PRINT REPORT
   * ----------------------------------------------------------
   *
   * Safe for Apps Script logs because complete calendar URLs
   * are never printed.
   */

  function printReport(report) {

    if (!report) {

      throw new Error(
        'report is required.'
      );

    }


    console.log(
      '============================================'
    );


    console.log(
      'EXTERNAL CALENDAR SYNC'
    );


    console.log(
      '============================================'
    );


    if (
      report.unit_id
    ) {

      console.log(
        'Unit: ' +
        report.unit_id
      );

    }


    if (
      report.property_id
    ) {

      console.log(
        'Property: ' +
        report.property_id
      );

    }


    if (
      report.started_at
    ) {

      console.log(
        'Started: ' +
        report.started_at
      );

    }


    if (
      report.completed_at
    ) {

      console.log(
        'Completed: ' +
        report.completed_at
      );

    }


    if (
      report.summary
    ) {

      console.log(
        'Feeds: ' +
        (
          report.summary.total_feeds ||
          0
        )
      );


      console.log(
        'Successful: ' +
        (
          report.summary.successful_feeds ||
          0
        )
      );


      console.log(
        'Failed: ' +
        (
          report.summary.failed_feeds ||
          0
        )
      );


      console.log(
        'Created: ' +
        (
          report.summary.created ||
          0
        )
      );


      console.log(
        'Updated: ' +
        (
          report.summary.updated ||
          0
        )
      );


      console.log(
        'Deactivated: ' +
        (
          report.summary.deactivated ||
          0
        )
      );

    }


    console.log(
      '--------------------------------------------'
    );


    (
      report.results ||
      []
    )
      .forEach(
        (result, index) => {

          let message =
            [
              index + 1,
              result.success
                ? 'SUCCESS'
                : 'FAILED',
              result.unit_id || '',
              result.source || '',
              result.calendar || ''
            ].join(
              ' | '
            );


          if (
            !result.success &&
            result.error
          ) {

            message +=
              ' | ' +
              result.error;

          }


          console.log(
            message
          );

        }
      );


    console.log(
      '============================================'
    );


    return report;

  }


  /**
   * ==========================================================
   * TRIGGER ENTRY POINT
   * ==========================================================
   */


  /**
   * ----------------------------------------------------------
   * RUN SCHEDULED SYNC
   * ----------------------------------------------------------
   *
   * Intended to be called by an Apps Script time trigger later.
   *
   * We do NOT create the trigger yet.
   */

  function runScheduledSync() {

    const report =
      syncAll(
        'SYSTEM'
      );


    printReport(
      report
    );


    return report;

  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {

    /*
     * Configuration
     */

    getUnitFeeds,

    getAllConfiguredFeeds,

    getSyncConfiguration,

    getUnitSyncConfiguration,


    /*
     * Synchronization
     */

    syncFeed,

    syncFeedSafe,

    syncUnit,

    syncProperty,

    syncAll,

    runScheduledSync,


    /*
     * Diagnostics
     */

    inspectUnitFeeds,

    summarizeResults,

    printReport

  };

})();