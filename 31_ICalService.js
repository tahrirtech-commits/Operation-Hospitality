/**
 * ============================================================
 * 31_ICalService.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Phase 2 - Calendar & Availability
 *
 * Responsibilities:
 *
 * - Fetch remote iCalendar (.ics) feeds
 * - Unfold RFC-style folded lines
 * - Parse VEVENT blocks
 * - Extract UID
 * - Extract SUMMARY
 * - Extract DTSTART
 * - Extract DTEND
 * - Normalize events into the application date model
 * - Synchronize parsed events through ExternalCalendarService
 *
 * This service does NOT directly write to:
 *
 * 13_ExternalCalendarEvents
 *
 * Persistence is delegated to:
 *
 * ExternalCalendarService
 *
 * ------------------------------------------------------------
 * APPLICATION DATE MODEL
 * ------------------------------------------------------------
 *
 * All reservation/calendar ranges use:
 *
 * [start_date, end_date)
 *
 * start_date = first occupied/blocked night
 * end_date   = checkout / first available date
 *
 * Example:
 *
 * DTSTART:20261010
 * DTEND:20261013
 *
 * Blocks:
 *
 * 10 Oct
 * 11 Oct
 * 12 Oct
 *
 * 13 Oct is not blocked.
 *
 * ------------------------------------------------------------
 * SECURITY
 * ------------------------------------------------------------
 *
 * Calendar URLs should normally be stored in unit/config data
 * rather than hard-coded into Apps Script source.
 *
 * Do not log complete calendar URLs because many OTA iCal URLs
 * contain secret/private tokens.
 *
 * ============================================================
 */

const ICalService = (() => {
  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * IS BLANK
   * ----------------------------------------------------------
   */

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE TEXT
   * ----------------------------------------------------------
   */

  function normalizeText(value) {
    if (isBlank(value)) {
      return "";
    }

    return String(value).trim();
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE SOURCE
   * ----------------------------------------------------------
   */

  function normalizeSource(source) {
    const normalized = normalizeText(source).toUpperCase();

    if (!normalized) {
      throw new Error("source is required.");
    }

    return normalized;
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

    return normalizeText(actorId);
  }

  /**
   * ----------------------------------------------------------
   * TIMESTAMP
   * ----------------------------------------------------------
   */

  function timestamp() {
    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME,
    );
  }

  /**
   * ----------------------------------------------------------
   * FORMAT DATE
   * ----------------------------------------------------------
   */

  function formatDate(date) {
    return Utilities.formatDate(
      date,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE,
    );
  }

  /**
   * ==========================================================
   * FETCH
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * VALIDATE CALENDAR URL
   * ----------------------------------------------------------
   */

  function validateCalendarUrl(url) {
    if (isBlank(url)) {
      throw new Error("calendarUrl is required.");
    }

    const normalized = normalizeText(url);

    if (!/^https?:\/\//i.test(normalized)) {
      throw new Error("Calendar URL must use HTTP or HTTPS.");
    }

    return normalized;
  }

  /**
   * ----------------------------------------------------------
   * FETCH CALENDAR
   * ----------------------------------------------------------
   *
   * Returns raw ICS text.
   */

  function fetchCalendar(calendarUrl) {
    const url = validateCalendarUrl(calendarUrl);

    let response;

    try {
      response = UrlFetchApp.fetch(url, {
        method: "get",

        followRedirects: true,

        muteHttpExceptions: true,

        headers: {
          Accept: "text/calendar,text/plain,*/*",
        },
      });
    } catch (error) {
      throw new Error("Unable to fetch external calendar: " + error.message);
    }

    const statusCode = response.getResponseCode();

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error("External calendar returned HTTP " + statusCode + ".");
    }

    const content = response.getContentText();

    if (isBlank(content)) {
      throw new Error("External calendar returned empty content.");
    }

    if (content.toUpperCase().indexOf("BEGIN:VCALENDAR") === -1) {
      throw new Error("Response does not appear to be an iCalendar feed.");
    }

    return content;
  }

  /**
   * ==========================================================
   * ICS TEXT PROCESSING
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * NORMALIZE LINE ENDINGS
   * ----------------------------------------------------------
   */

  function normalizeLineEndings(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  }

  /**
   * ----------------------------------------------------------
   * UNFOLD LINES
   * ----------------------------------------------------------
   *
   * iCalendar permits long content lines to be folded:
   *
   * SUMMARY:Some very long
   *  description
   *
   * becomes:
   *
   * SUMMARY:Some very longdescription
   *
   * A continuation line begins with a space or tab.
   */

  function unfoldLines(text) {
    const normalized = normalizeLineEndings(text);

    const lines = normalized.split("\n");

    const unfolded = [];

    lines.forEach((line) => {
      if (
        unfolded.length > 0 &&
        (line.startsWith(" ") || line.startsWith("\t"))
      ) {
        unfolded[unfolded.length - 1] += line.substring(1);
      } else {
        unfolded.push(line);
      }
    });

    return unfolded;
  }

  /**
   * ----------------------------------------------------------
   * UNESCAPE TEXT
   * ----------------------------------------------------------
   *
   * Common iCalendar text escapes.
   */

  function unescapeText(value) {
    if (value === undefined || value === null) {
      return "";
    }

    return (
      String(value)
        /*
         * Escaped newline.
         */
        .replace(/\\n/gi, "\n")

        /*
         * Escaped comma.
         */
        .replace(/\\,/g, ",")

        /*
         * Escaped semicolon.
         */
        .replace(/\\;/g, ";")

        /*
         * Escaped backslash.
         */
        .replace(/\\\\/g, "\\")

        .trim()
    );
  }

  /**
   * ----------------------------------------------------------
   * PARSE CONTENT LINE
   * ----------------------------------------------------------
   *
   * Example:
   *
   * DTSTART;VALUE=DATE:20261010
   *
   * Result:
   *
   * {
   *   name: "DTSTART",
   *   parameters: {
   *     VALUE: "DATE"
   *   },
   *   value: "20261010"
   * }
   */

  function parseContentLine(line) {
    if (isBlank(line)) {
      return null;
    }

    const colonIndex = line.indexOf(":");

    if (colonIndex === -1) {
      return null;
    }

    const left = line.substring(0, colonIndex);

    const value = line.substring(colonIndex + 1);

    const parts = left.split(";");

    const name = normalizeText(parts.shift()).toUpperCase();

    const parameters = {};

    parts.forEach((part) => {
      const equalsIndex = part.indexOf("=");

      if (equalsIndex === -1) {
        return;
      }

      const key = normalizeText(part.substring(0, equalsIndex)).toUpperCase();

      let parameterValue = normalizeText(part.substring(equalsIndex + 1));

      /*
       * Remove surrounding quotes.
       */

      if (
        parameterValue.length >= 2 &&
        parameterValue.startsWith('"') &&
        parameterValue.endsWith('"')
      ) {
        parameterValue = parameterValue.substring(1, parameterValue.length - 1);
      }

      parameters[key] = parameterValue;
    });

    return {
      name: name,

      parameters: parameters,

      value: value,
    };
  }

  /**
   * ==========================================================
   * DATE PARSING
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * PAD NUMBER
   * ----------------------------------------------------------
   */

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  /**
   * ----------------------------------------------------------
   * FORMAT DATE PARTS
   * ----------------------------------------------------------
   */

  function formatDateParts(year, month, day) {
    return String(year) + "-" + pad2(month) + "-" + pad2(day);
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE DATE PARTS
   * ----------------------------------------------------------
   */

  function validateDateParts(year, month, day, fieldName) {
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error("Invalid " + fieldName + " date.");
    }

    return true;
  }

  /**
   * ----------------------------------------------------------
   * PARSE DATE-ONLY VALUE
   * ----------------------------------------------------------
   *
   * Input:
   *
   * 20261010
   *
   * Output:
   *
   * 2026-10-10
   */

  function parseDateOnly(value, fieldName) {
    const text = normalizeText(value);

    if (!/^\d{8}$/.test(text)) {
      throw new Error(
        fieldName + " is not a valid iCalendar DATE value: " + text,
      );
    }

    const year = Number(text.substring(0, 4));

    const month = Number(text.substring(4, 6));

    const day = Number(text.substring(6, 8));

    validateDateParts(year, month, day, fieldName);

    return formatDateParts(year, month, day);
  }

  /**
   * ----------------------------------------------------------
   * PARSE UTC DATE-TIME
   * ----------------------------------------------------------
   *
   * Example:
   *
   * 20261010T120000Z
   *
   * The instant is converted into the application's timezone
   * before extracting the date.
   */

  function parseUtcDateTime(value, fieldName) {
    const text = normalizeText(value);

    const match = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);

    if (!match) {
      throw new Error(
        fieldName + " is not a supported UTC iCalendar datetime: " + text,
      );
    }

    const date = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      ),
    );

    return formatDate(date);
  }

  /**
   * ----------------------------------------------------------
   * PARSE LOCAL/FLOATING DATE-TIME
   * ----------------------------------------------------------
   *
   * Example:
   *
   * 20261010T120000
   *
   * For rental calendars we retain the calendar DATE portion.
   *
   * The availability engine works at night/date granularity,
   * not hourly granularity.
   */

  function parseLocalDateTime(value, fieldName) {
    const text = normalizeText(value);

    const match = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);

    if (!match) {
      throw new Error(
        fieldName + " is not a supported iCalendar datetime: " + text,
      );
    }

    const year = Number(match[1]);

    const month = Number(match[2]);

    const day = Number(match[3]);

    validateDateParts(year, month, day, fieldName);

    return formatDateParts(year, month, day);
  }

  /**
   * ----------------------------------------------------------
   * PARSE ICAL DATE VALUE
   * ----------------------------------------------------------
   *
   * Supports:
   *
   * YYYYMMDD
   * YYYYMMDDTHHMMSS
   * YYYYMMDDTHHMMSSZ
   *
   * Parameters such as:
   *
   * VALUE=DATE
   * TZID=...
   *
   * are accepted.
   *
   * Since the MVP availability engine operates on nights,
   * date-time values are normalized to dates.
   */

  function parseICalDate(property, fieldName) {
    if (!property) {
      throw new Error(fieldName + " is missing.");
    }

    const value = normalizeText(property.value);

    const valueType = normalizeText(property.parameters.VALUE).toUpperCase();

    /*
     * Explicit DATE.
     */

    if (valueType === "DATE") {
      return parseDateOnly(value, fieldName);
    }

    /*
     * Plain YYYYMMDD.
     */

    if (/^\d{8}$/.test(value)) {
      return parseDateOnly(value, fieldName);
    }

    /*
     * UTC datetime.
     */

    if (/^\d{8}T\d{6}Z$/.test(value)) {
      return parseUtcDateTime(value, fieldName);
    }

    /*
     * Floating/local datetime.
     *
     * TZID is deliberately not used for timezone conversion
     * here because Phase 2 availability is date-based.
     */

    if (/^\d{8}T\d{6}$/.test(value)) {
      return parseLocalDateTime(value, fieldName);
    }

    throw new Error("Unsupported " + fieldName + " value: " + value);
  }

  /**
   * ==========================================================
   * VEVENT PARSING
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * CREATE EMPTY EVENT
   * ----------------------------------------------------------
   */

  function createEmptyEvent() {
    return {
      UID: null,

      SUMMARY: null,

      DTSTART: null,

      DTEND: null,

      STATUS: null,
    };
  }

  /**
   * ----------------------------------------------------------
   * PARSE VEVENT BLOCKS
   * ----------------------------------------------------------
   *
   * Returns raw parsed event structures.
   */

  function parseEventBlocks(icsText) {
    if (isBlank(icsText)) {
      throw new Error("ICS content is required.");
    }

    const lines = unfoldLines(icsText);

    const events = [];

    let currentEvent = null;

    lines.forEach((rawLine) => {
      const line = String(rawLine || "");

      const normalizedLine = line.trim().toUpperCase();

      /*
       * Start VEVENT.
       */

      if (normalizedLine === "BEGIN:VEVENT") {
        if (currentEvent !== null) {
          throw new Error("Nested VEVENT detected.");
        }

        currentEvent = createEmptyEvent();

        return;
      }

      /*
       * End VEVENT.
       */

      if (normalizedLine === "END:VEVENT") {
        if (currentEvent === null) {
          return;
        }

        events.push(currentEvent);

        currentEvent = null;

        return;
      }

      /*
       * Ignore lines outside VEVENT.
       */

      if (currentEvent === null) {
        return;
      }

      const property = parseContentLine(line);

      if (!property) {
        return;
      }

      /*
       * Only properties relevant to Phase 2 are retained.
       */

      if (
        property.name === "UID" ||
        property.name === "SUMMARY" ||
        property.name === "DTSTART" ||
        property.name === "DTEND" ||
        property.name === "STATUS"
      ) {
        currentEvent[property.name] = property;
      }
    });

    if (currentEvent !== null) {
      throw new Error("VEVENT was not closed with END:VEVENT.");
    }

    return events;
  }

  /**
   * ----------------------------------------------------------
   * NORMALIZE PARSED EVENT
   * ----------------------------------------------------------
   */

  function normalizeParsedEvent(rawEvent) {
    if (!rawEvent.UID || isBlank(rawEvent.UID.value)) {
      throw new Error("VEVENT is missing UID.");
    }

    if (!rawEvent.DTSTART) {
      throw new Error("VEVENT " + rawEvent.UID.value + " is missing DTSTART.");
    }

    if (!rawEvent.DTEND) {
      throw new Error("VEVENT " + rawEvent.UID.value + " is missing DTEND.");
    }

    const startDate = parseICalDate(rawEvent.DTSTART, "DTSTART");

    const endDate = parseICalDate(rawEvent.DTEND, "DTEND");

    /*
     * Reuse the calendar-domain range validation.
     */

    ExternalCalendarService.rangesOverlap(
      startDate,
      endDate,
      startDate,
      endDate,
    );

    return {
      external_uid: normalizeText(rawEvent.UID.value),

      summary: rawEvent.SUMMARY ? unescapeText(rawEvent.SUMMARY.value) : "",

      start_date: startDate,

      end_date: endDate,

      ical_status: rawEvent.STATUS
        ? normalizeText(rawEvent.STATUS.value).toUpperCase()
        : "",
    };
  }

  /**
   * ----------------------------------------------------------
   * PARSE CALENDAR
   * ----------------------------------------------------------
   *
   * Main parser.
   *
   * Returns normalized events:
   *
   * {
   *   external_uid,
   *   summary,
   *   start_date,
   *   end_date,
   *   ical_status
   * }
   */

  function parseCalendar(icsText) {
    if (isBlank(icsText)) {
      throw new Error("ICS content is required.");
    }

    const normalized = normalizeLineEndings(icsText);

    if (normalized.toUpperCase().indexOf("BEGIN:VCALENDAR") === -1) {
      throw new Error("ICS content does not contain BEGIN:VCALENDAR.");
    }

    const rawEvents = parseEventBlocks(normalized);

    const events = [];

    rawEvents.forEach((rawEvent) => {
      const event = normalizeParsedEvent(rawEvent);

      /*
       * CANCELLED events should not block availability.
       *
       * We retain this information in parsing but exclude
       * cancelled events from the active feed result.
       */

      if (event.ical_status === "CANCELLED") {
        return;
      }

      events.push(event);
    });

    return events;
  }

  /**
   * ==========================================================
   * FETCH + PARSE
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * FETCH AND PARSE
   * ----------------------------------------------------------
   */

  function fetchAndParse(calendarUrl) {
    const content = fetchCalendar(calendarUrl);

    return parseCalendar(content);
  }

  /**
   * ==========================================================
   * SYNCHRONIZATION
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * SYNC CALENDAR CONTENT
   * ----------------------------------------------------------
   *
   * Synchronizes already-fetched ICS content.
   *
   * Useful for:
   *
   * - Testing
   * - CalendarSyncService
   * - Avoiding duplicate network requests
   *
   * IMPORTANT:
   *
   * deactivateMissingEvents() is called only after the entire
   * feed was successfully parsed and upserted.
   */

  function syncCalendarContent(unitId, source, icsText, actorId) {
    if (isBlank(unitId)) {
      throw new Error("unitId is required.");
    }

    ValidationService.validateUnitExists(unitId);

    const normalizedSource = normalizeSource(source);

    const normalizedActorId = normalizeActorId(actorId);

    /*
     * Parse everything BEFORE changing stored data.
     *
     * If parsing fails, no existing events are deactivated.
     */

    const parsedEvents = parseCalendar(icsText);

    const seenUids = [];

    const created = [];

    const updated = [];

    /*
     * Capture existing natural keys before upsert so the
     * result can distinguish create vs update.
     */

    parsedEvents.forEach((event) => {
      const existing = ExternalCalendarService.findBySourceUid(
        unitId,
        normalizedSource,
        event.external_uid,
      );

      const stored = ExternalCalendarService.upsertEvent(
        {
          unit_id: unitId,

          source: normalizedSource,

          external_uid: event.external_uid,

          summary: event.summary,

          start_date: event.start_date,

          end_date: event.end_date,
        },
        normalizedActorId,
      );

      seenUids.push(event.external_uid);

      if (existing) {
        updated.push(stored);
      } else {
        created.push(stored);
      }
    });

    /*
     * Only after successful parsing and successful upserts do
     * we deactivate events which disappeared from the feed.
     */

    const deactivated = ExternalCalendarService.deactivateMissingEvents(
      unitId,
      normalizedSource,
      seenUids,
      normalizedActorId,
    );

    return {
      success: true,

      unit_id: unitId,

      source: normalizedSource,

      synced_at: timestamp(),

      feed_event_count: parsedEvents.length,

      created_count: created.length,

      updated_count: updated.length,

      deactivated_count: deactivated.length,

      created: created,

      updated: updated,

      deactivated: deactivated,
    };
  }

  /**
   * ----------------------------------------------------------
   * SYNC CALENDAR URL
   * ----------------------------------------------------------
   *
   * Convenience operation:
   *
   * URL
   *  ↓
   * fetch
   *  ↓
   * parse
   *  ↓
   * upsert
   *  ↓
   * deactivate disappeared events
   */

  function syncCalendar(unitId, source, calendarUrl, actorId) {
    const content = fetchCalendar(calendarUrl);

    return syncCalendarContent(unitId, source, content, actorId);
  }

  /**
   * ==========================================================
   * DIAGNOSTICS
   * ==========================================================
   */

  /**
   * ----------------------------------------------------------
   * INSPECT CALENDAR
   * ----------------------------------------------------------
   *
   * Fetches and parses a feed WITHOUT writing anything.
   *
   * Useful before activating a new OTA calendar.
   */

  function inspectCalendar(calendarUrl) {
    const events = fetchAndParse(calendarUrl);

    return {
      valid: true,

      event_count: events.length,

      events: events,
    };
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE ICS CONTENT
   * ----------------------------------------------------------
   *
   * Does not write anything.
   */

  function validateContent(icsText) {
    try {
      const events = parseCalendar(icsText);

      return {
        valid: true,

        event_count: events.length,

        error: "",
      };
    } catch (error) {
      return {
        valid: false,

        event_count: 0,

        error: error.message,
      };
    }
  }

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    /*
     * Fetch
     */

    fetchCalendar,

    /*
     * Parsing
     */

    unfoldLines,

    parseContentLine,

    parseICalDate,

    parseEventBlocks,

    parseCalendar,

    /*
     * Fetch + parse
     */

    fetchAndParse,

    /*
     * Synchronization
     */

    syncCalendarContent,

    syncCalendar,

    /*
     * Diagnostics
     */

    inspectCalendar,

    validateContent,
  };
})();
