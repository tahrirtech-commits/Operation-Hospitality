/**
 * ============================================================
 * 90_AdminMenu.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Google Sheets administrative menu.
 *
 * PHASE 1
 * - System information
 * - Integrity check
 * - ID sequence management
 * - Unit operational status management
 *
 * PHASE 2
 * - Calendar synchronization
 * - Calendar configuration inspection
 * - Availability checking
 * - Calendar conflict inspection
 *
 * ============================================================
 */


/**
 * ============================================================
 * MENU
 * ============================================================
 */

function onOpen() {

  buildRentalOpsMenu();

}


/**
 * Rebuild menu manually if needed.
 */
function buildRentalOpsMenu() {

  const ui =
    SpreadsheetApp.getUi();


  ui.createMenu(
    'Rental Ops'
  )

    /*
     * --------------------------------------------------------
     * SYSTEM
     * --------------------------------------------------------
     */

    .addItem(
      'System Information',
      'adminShowSystemInfo'
    )

    .addSeparator()


    /*
     * --------------------------------------------------------
     * PHASE 1
     * --------------------------------------------------------
     */

    .addSubMenu(

      ui.createMenu(
        'Phase 1 - Foundation'
      )

        .addItem(
          'Run Setup',
          'adminRunPhase1Setup'
        )

        .addItem(
          'Run Integrity Check',
          'adminRunIntegrityCheck'
        )

    )


    /*
     * --------------------------------------------------------
     * ID SEQUENCES
     * --------------------------------------------------------
     */

    .addSubMenu(

      ui.createMenu(
        'ID Sequences'
      )

        .addItem(
          'Show Sequence Status',
          'adminShowIdSequences'
        )

        .addItem(
          'Initialize / Synchronize Sequences',
          'adminSynchronizeIdSequences'
        )

    )


    /*
     * --------------------------------------------------------
     * UNIT OPERATIONS
     * --------------------------------------------------------
     */

    .addSubMenu(

      ui.createMenu(
        'Unit Operations'
      )

        .addItem(
          'Show Unit Status',
          'adminShowUnitStatus'
        )

        .addSeparator()

        .addItem(
          'Mark READY',
          'adminMarkUnitReady'
        )

        .addItem(
          'Mark RESERVED',
          'adminMarkUnitReserved'
        )

        .addItem(
          'Mark OCCUPIED',
          'adminMarkUnitOccupied'
        )

        .addItem(
          'Mark DIRTY',
          'adminMarkUnitDirty'
        )

        .addItem(
          'Mark CLEANING',
          'adminMarkUnitCleaning'
        )

        .addItem(
          'Mark INSPECTION',
          'adminMarkUnitInspection'
        )

        .addItem(
          'Mark MAINTENANCE',
          'adminMarkUnitMaintenance'
        )

        .addItem(
          'Mark OUT OF SERVICE',
          'adminMarkUnitOutOfService'
        )

        .addItem(
          'Mark BLOCKED',
          'adminMarkUnitBlocked'
        )

    )


    /*
     * --------------------------------------------------------
     * PHASE 2 - CALENDAR
     * --------------------------------------------------------
     */

    .addSubMenu(

      ui.createMenu(
        'Phase 2 - Calendar'
      )

        .addItem(
          'Sync All Calendars',
          'adminSyncAllCalendars'
        )

        .addItem(
          'Sync Unit Calendar',
          'adminSyncUnitCalendar'
        )

        .addSeparator()

        .addItem(
          'Inspect Calendar Configuration',
          'adminInspectCalendarConfiguration'
        )

        .addItem(
          'Show Calendar Conflicts',
          'adminShowCalendarConflicts'
        )

    )


    /*
     * --------------------------------------------------------
     * PHASE 2 - AVAILABILITY
     * --------------------------------------------------------
     */

    .addSubMenu(

      ui.createMenu(
        'Phase 2 - Availability'
      )

        .addItem(
          'Check Unit Availability',
          'adminCheckUnitAvailability'
        )

        .addItem(
          'Find Available Units',
          'adminFindAvailableUnits'
        )

        .addItem(
          'Show Unit Calendar Conflicts',
          'adminShowUnitCalendarConflicts'
        )

    )


    /*
     * --------------------------------------------------------
     * UTILITIES
     * --------------------------------------------------------
     */

    .addSeparator()

    .addItem(
      'Refresh Menu',
      'adminRefreshMenu'
    )

    .addToUi();

}


/**
 * ============================================================
 * GENERIC UI HELPERS
 * ============================================================
 */

function adminGetUi() {

  return SpreadsheetApp.getUi();

}


function adminAlert(
  title,
  message
) {

  adminGetUi().alert(
    title,
    String(message),
    SpreadsheetApp
      .getUi()
      .ButtonSet
      .OK
  );

}


function adminShowError(
  title,
  err
) {

  const message =
    err && err.message
      ? err.message
      : String(err);


  Logger.log(
    title + ': ' + message
  );


  adminAlert(
    title,
    message
  );

}


/**
 * ============================================================
 * PROMPT HELPERS
 * ============================================================
 */

function adminPromptRequired(
  title,
  message
) {

  const ui =
    adminGetUi();


  const response =
    ui.prompt(
      title,
      message,
      ui.ButtonSet.OK_CANCEL
    );


  if (
    response.getSelectedButton() !==
    ui.Button.OK
  ) {

    return null;

  }


  const value =
    String(
      response.getResponseText() || ''
    ).trim();


  if (!value) {

    ui.alert(
      title,
      'A value is required.',
      ui.ButtonSet.OK
    );

    return null;

  }


  return value;

}


function adminPromptOptional(
  title,
  message
) {

  const ui =
    adminGetUi();


  const response =
    ui.prompt(
      title,
      message,
      ui.ButtonSet.OK_CANCEL
    );


  if (
    response.getSelectedButton() !==
    ui.Button.OK
  ) {

    return null;

  }


  return String(
    response.getResponseText() || ''
  ).trim();

}


/**
 * ============================================================
 * DATE DISPLAY HELPER
 * ============================================================
 */

function adminFormatDate(
  value
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return '';

  }


  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    return Utilities.formatDate(
      value,
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );

  }


  return String(value);

}


/**
 * ============================================================
 * SYSTEM INFORMATION
 * ============================================================
 */

function adminShowSystemInfo() {

  try {

    const spreadsheet =
      BaseRepository
        .getSpreadsheet();


    const message = [

      CONFIG.APP.NAME,

      '',

      'Version: ' +
        CONFIG.APP.VERSION,

      'Phase: ' +
        CONFIG.APP.PHASE,

      'Timezone: ' +
        CONFIG.TIMEZONE,

      '',

      'Spreadsheet:',
      spreadsheet.getName(),

      '',

      'Spreadsheet ID:',
      spreadsheet.getId()

    ].join('\n');


    adminAlert(
      'Rental Operations',
      message
    );

  } catch (err) {

    adminShowError(
      'System Information Error',
      err
    );

  }

}


/**
 * ============================================================
 * PHASE 1 SETUP
 * ============================================================
 */

function adminRunPhase1Setup() {

  const ui =
    adminGetUi();


  const response =
    ui.alert(
      'Run Phase 1 Setup',
      'Run setupPhase1() now?\n\n' +
      'Only continue if the setup function is present in the project.',
      ui.ButtonSet.YES_NO
    );


  if (
    response !==
    ui.Button.YES
  ) {

    return;

  }


  try {

    if (
      typeof setupPhase1 !==
      'function'
    ) {

      throw new Error(
        'setupPhase1() is not available in this project.'
      );

    }


    const result =
      setupPhase1();


    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    adminAlert(
      'Phase 1 Setup',
      'Setup completed successfully.\n\n' +
      'Check the execution log for details.'
    );

  } catch (err) {

    adminShowError(
      'Phase 1 Setup Failed',
      err
    );

  }

}


/**
 * ============================================================
 * INTEGRITY CHECK
 * ============================================================
 */

function adminRunIntegrityCheck() {

  try {

    const report =
      IntegrityCheckService
        .runAll();


    IntegrityCheckService
      .printReport(
        report
      );


    const message = [

      'Passed: ' +
        report.passed,

      '',

      'Errors: ' +
        report.summary.errors,

      'Warnings: ' +
        report.summary.warnings,

      'Info: ' +
        report.summary.infos,

      '',

      'Duration: ' +
        report.summary.duration_ms +
        ' ms'

    ].join('\n');


    adminAlert(
      'Integrity Check',
      message
    );


    return report;

  } catch (err) {

    adminShowError(
      'Integrity Check Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * ID SEQUENCES
 * ============================================================
 */

function adminShowIdSequences() {

  try {

    const statuses =
      IdService
        .getAllSequenceStatuses();


    const lines = [];


    statuses.forEach(
      status => {

        lines.push(
          status.entity_type +
          ': ' +
          status.stored_sequence +
          ' / sheet=' +
          status.sheet_max_sequence +
          (
            status.valid
              ? ' ✓'
              : ' ⚠'
          )
        );

      }
    );


    Logger.log(
      JSON.stringify(
        statuses,
        null,
        2
      )
    );


    adminAlert(
      'ID Sequence Status',
      lines.length
        ? lines.join('\n')
        : 'No managed sequences found.'
    );


    return statuses;

  } catch (err) {

    adminShowError(
      'ID Sequence Error',
      err
    );

    return null;

  }

}


function adminSynchronizeIdSequences() {

  const ui =
    adminGetUi();


  const response =
    ui.alert(
      'Synchronize ID Sequences',
      'Synchronize ID sequences with the maximum IDs currently stored in the sheets?\n\n' +
      'Sequences will never be intentionally decreased.',
      ui.ButtonSet.YES_NO
    );


  if (
    response !==
    ui.Button.YES
  ) {

    return;

  }


  try {

    const result =
      IdService
        .synchronizeAllSequences();


    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    adminAlert(
      'ID Sequences',
      'ID sequences synchronized successfully.\n\n' +
      'Check the execution log for details.'
    );


    return result;

  } catch (err) {

    adminShowError(
      'ID Sequence Synchronization Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * UNIT STATUS - SHOW
 * ============================================================
 */

function adminShowUnitStatus() {

  const unitId =
    adminPromptRequired(
      'Show Unit Status',
      'Enter unit ID, for example:\nUNIT-000001'
    );


  if (!unitId) {
    return;
  }


  try {

    const unit =
      UnitService.getUnitById(
        unitId
      );


    if (!unit) {

      throw new Error(
        'Unit not found: ' +
          unitId
      );

    }


    const operational =
      OperationalStatusService
        .getStatus(
          unitId
        );


    const message = [

      'Unit: ' +
        unit.unit_id,

      'Code: ' +
        (
          unit.unit_code ||
          ''
        ),

      'Name: ' +
        (
          unit.unit_name ||
          ''
        ),

      '',

      'Master Status: ' +
        (
          unit.status ||
          ''
        ),

      'Operational Status: ' +
        (
          operational
            ? operational
                .operational_status
            : 'NOT SET'
        ),

      'Reason: ' +
        (
          operational
            ? operational
                .status_reason || ''
            : ''
        ),

      'Since: ' +
        (
          operational
            ? operational
                .status_since || ''
            : ''
        ),

      'Expected Ready: ' +
        (
          operational
            ? operational
                .expected_ready_at || ''
            : ''
        )

    ].join('\n');


    adminAlert(
      'Unit Status',
      message
    );


    return {
      unit:
        unit,

      operational_status:
        operational
    };

  } catch (err) {

    adminShowError(
      'Unit Status Error',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * UNIT STATUS - GENERIC CHANGE
 * ============================================================
 */

function adminChangeUnitOperationalStatus(
  newStatus
) {

  const unitId =
    adminPromptRequired(
      'Change Unit Status',
      'Enter unit ID, for example:\nUNIT-000001'
    );


  if (!unitId) {
    return;
  }


  const reason =
    adminPromptOptional(
      'Status Reason',
      'Enter reason / note.\n\n' +
      'Leave blank if no reason is required.'
    );


  if (
    reason === null
  ) {

    return;

  }


  let expectedReadyAt =
    '';


  if (
    [
      'MAINTENANCE',
      'OUT_OF_SERVICE',
      'BLOCKED',
      'CLEANING',
      'INSPECTION'
    ].includes(
      String(
        newStatus
      ).toUpperCase()
    )
  ) {

    const response =
      adminPromptOptional(
        'Expected Ready',
        'Optional expected-ready date/time.\n\n' +
        'Example:\n2026-10-05 14:00:00\n\n' +
        'Leave blank if unknown.'
      );


    if (
      response === null
    ) {

      return;

    }


    expectedReadyAt =
      response;

  }


  try {

    const updated =
      OperationalStatusService
        .changeStatus(
          unitId,
          newStatus,
          reason,
          CONFIG.DEFAULTS.ACTOR_ID,
          expectedReadyAt
        );


    Logger.log(
      JSON.stringify(
        updated,
        null,
        2
      )
    );


    adminAlert(
      'Unit Status Updated',
      unitId +
      '\n\nOperational Status: ' +
      newStatus
    );


    return updated;

  } catch (err) {

    adminShowError(
      'Unit Status Update Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * UNIT STATUS SHORTCUTS
 * ============================================================
 */

function adminMarkUnitReady() {

  return adminChangeUnitOperationalStatus(
    'READY'
  );

}


function adminMarkUnitReserved() {

  return adminChangeUnitOperationalStatus(
    'RESERVED'
  );

}


function adminMarkUnitOccupied() {

  return adminChangeUnitOperationalStatus(
    'OCCUPIED'
  );

}


function adminMarkUnitDirty() {

  return adminChangeUnitOperationalStatus(
    'DIRTY'
  );

}


function adminMarkUnitCleaning() {

  return adminChangeUnitOperationalStatus(
    'CLEANING'
  );

}


function adminMarkUnitInspection() {

  return adminChangeUnitOperationalStatus(
    'INSPECTION'
  );

}


function adminMarkUnitMaintenance() {

  return adminChangeUnitOperationalStatus(
    'MAINTENANCE'
  );

}


function adminMarkUnitOutOfService() {

  return adminChangeUnitOperationalStatus(
    'OUT_OF_SERVICE'
  );

}


function adminMarkUnitBlocked() {

  return adminChangeUnitOperationalStatus(
    'BLOCKED'
  );

}


/**
 * ============================================================
 * PHASE 2 - SYNC ALL CALENDARS
 * ============================================================
 */

function adminSyncAllCalendars() {

  const ui =
    adminGetUi();


  const response =
    ui.alert(
      'Sync All Calendars',
      'Synchronize all configured iCal feeds now?\n\n' +
      'This may contact Airbnb, Booking.com, or other configured calendar feeds.',
      ui.ButtonSet.YES_NO
    );


  if (
    response !==
    ui.Button.YES
  ) {

    return;

  }


  try {

    const report =
      CalendarSyncService
        .syncAll();


    Logger.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );


    const summary =
      adminBuildCalendarSyncSummary(
        report
      );


    adminAlert(
      'Calendar Sync Complete',
      summary
    );


    return report;

  } catch (err) {

    adminShowError(
      'Calendar Sync Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * PHASE 2 - SYNC UNIT CALENDAR
 * ============================================================
 */

function adminSyncUnitCalendar() {

  const unitId =
    adminPromptRequired(
      'Sync Unit Calendar',
      'Enter unit ID, for example:\nUNIT-000001'
    );


  if (!unitId) {
    return;
  }


  try {

    const report =
      CalendarSyncService
        .syncUnit(
          unitId
        );


    Logger.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );


    adminAlert(
      'Unit Calendar Sync',
      'Calendar synchronization completed for:\n' +
        unitId +
        '\n\n' +
        adminBuildCalendarSyncSummary(
          report
        )
    );


    return report;

  } catch (err) {

    adminShowError(
      'Unit Calendar Sync Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * CALENDAR SYNC SUMMARY
 * ============================================================
 *
 * CalendarSyncService may return different levels of reports
 * depending on whether a feed, unit, property or all units were
 * synchronized.
 *
 * Keep this formatter defensive.
 * ============================================================
 */

function adminBuildCalendarSyncSummary(
  report
) {

  if (!report) {

    return 'No sync report returned.';

  }


  const lines = [];


  if (
    report.unit_id
  ) {

    lines.push(
      'Unit: ' +
        report.unit_id
    );

  }


  if (
    report.property_id
  ) {

    lines.push(
      'Property: ' +
        report.property_id
    );

  }


  if (
    report.total !==
    undefined
  ) {

    lines.push(
      'Total: ' +
        report.total
    );

  }


  if (
    report.successful !==
    undefined
  ) {

    lines.push(
      'Successful: ' +
        report.successful
    );

  }


  if (
    report.failed !==
    undefined
  ) {

    lines.push(
      'Failed: ' +
        report.failed
    );

  }


  if (
    report.skipped !==
    undefined
  ) {

    lines.push(
      'Skipped: ' +
        report.skipped
    );

  }


  if (
    report.created !==
    undefined
  ) {

    lines.push(
      'Created: ' +
        report.created
    );

  }


  if (
    report.updated !==
    undefined
  ) {

    lines.push(
      'Updated: ' +
        report.updated
    );

  }


  if (
    report.deactivated !==
    undefined
  ) {

    lines.push(
      'Deactivated: ' +
        report.deactivated
    );

  }


  /*
   * Nested summary support.
   */

  if (
    report.summary &&
    typeof report.summary ===
      'object'
  ) {

    Object.keys(
      report.summary
    ).forEach(
      key => {

        const value =
          report.summary[key];


        if (
          typeof value !==
          'object'
        ) {

          lines.push(
            key +
              ': ' +
              value
          );

        }

      }
    );

  }


  if (
    lines.length === 0
  ) {

    lines.push(
      'Synchronization completed.'
    );

    lines.push(
      'See execution log for the full report.'
    );

  }


  return lines.join('\n');

}


/**
 * ============================================================
 * CALENDAR CONFIGURATION
 * ============================================================
 */

function adminInspectCalendarConfiguration() {

  try {

    const report = CalendarSyncService.getSyncConfiguration();


    Logger.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );


    const lines = [];


    if (
      Array.isArray(
        report
      )
    ) {

      report.forEach(
        item => {

          lines.push(
            adminFormatCalendarConfigurationItem(
              item
            )
          );

        }
      );

    } else if (
      report &&
      Array.isArray(
        report.units
      )
    ) {

      report.units.forEach(
        item => {

          lines.push(
            adminFormatCalendarConfigurationItem(
              item
            )
          );

        }
      );

    } else {

      lines.push(
        'Calendar configuration inspected.'
      );

      lines.push(
        'See execution log for full details.'
      );

    }


    adminAlert(
      'Calendar Configuration',
      lines.join('\n\n')
    );


    return report;

  } catch (err) {

    adminShowError(
      'Calendar Configuration Error',
      err
    );

    return null;

  }

}


function adminFormatCalendarConfigurationItem(
  item
) {

  if (!item) {
    return '';
  }


  const lines = [];


  if (
    item.unit_id
  ) {

    lines.push(
      'Unit: ' +
        item.unit_id
    );

  }


  if (
    item.feed_count !==
    undefined
  ) {

    lines.push(
      'Feeds: ' +
        item.feed_count
    );

  }


  if (
    item.configured_feeds &&
    Array.isArray(
      item.configured_feeds
    )
  ) {

    lines.push(
      'Configured: ' +
        item.configured_feeds
          .join(', ')
    );

  }


  if (
    item.sources &&
    Array.isArray(
      item.sources
    )
  ) {

    lines.push(
      'Sources: ' +
        item.sources
          .join(', ')
    );

  }


  if (
    lines.length === 0
  ) {

    return JSON.stringify(
      item
    );

  }


  return lines.join('\n');

}


/**
 * ============================================================
 * CHECK UNIT AVAILABILITY
 * ============================================================
 */

function adminCheckUnitAvailability() {

  const unitId =
    adminPromptRequired(
      'Check Availability',
      'Enter unit ID, for example:\nUNIT-000001'
    );


  if (!unitId) {
    return;
  }


  const startDate =
    adminPromptRequired(
      'Check Availability',
      'Enter check-in date:\nYYYY-MM-DD'
    );


  if (!startDate) {
    return;
  }


  const endDate =
    adminPromptRequired(
      'Check Availability',
      'Enter check-out date:\nYYYY-MM-DD'
    );


  if (!endDate) {
    return;
  }


  try {

    const result =
      AvailabilityService
        .checkAvailability(
          unitId,
          startDate,
          endDate
        );


    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    const lines = [

      'Unit: ' +
        result.unit_id,

      'Period: ' +
        result.start_date +
        ' → ' +
        result.end_date,

      '',

      result.available
        ? 'AVAILABLE: YES'
        : 'AVAILABLE: NO',

      '',

      'Master Status: ' +
        (
          result.unit_status ||
          ''
        ),

      'Operational Status: ' +
        (
          result.operational_status ||
          ''
        )

    ];


    if (
      result.reasons &&
      result.reasons.length
    ) {

      lines.push(
        '',
        'Reasons:'
      );


      result.reasons.forEach(
        reason => {

          lines.push(
            '- ' +
              reason.code +
              ': ' +
              reason.message
          );

        }
      );

    }


    adminAlert(
      'Availability Result',
      lines.join('\n')
    );


    return result;

  } catch (err) {

    adminShowError(
      'Availability Check Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * FIND AVAILABLE UNITS
 * ============================================================
 */

function adminFindAvailableUnits() {

  const startDate =
    adminPromptRequired(
      'Find Available Units',
      'Enter check-in date:\nYYYY-MM-DD'
    );


  if (!startDate) {
    return;
  }


  const endDate =
    adminPromptRequired(
      'Find Available Units',
      'Enter check-out date:\nYYYY-MM-DD'
    );


  if (!endDate) {
    return;
  }


  const propertyId =
    adminPromptOptional(
      'Property Filter',
      'Optional property ID.\n\n' +
      'Example:\nPROP-000001\n\n' +
      'Leave blank to search all properties.'
    );


  if (
    propertyId === null
  ) {

    return;

  }


  try {

    const filters = {};


    if (
      propertyId
    ) {

      filters.property_id =
        propertyId;

    }


    const results =
      AvailabilityService
        .getAvailableUnits(
          startDate,
          endDate,
          filters
        );


    Logger.log(
      JSON.stringify(
        results,
        null,
        2
      )
    );


    const lines = [

      'Period:',
      startDate +
        ' → ' +
        endDate,

      '',

      'Available units: ' +
        results.length

    ];


    if (
      results.length
    ) {

      lines.push('');


      results.forEach(
        item => {

          const unit =
            item.unit;


          lines.push(
            unit.unit_id +
              ' | ' +
              (
                unit.unit_code ||
                ''
              ) +
              ' | ' +
              (
                unit.unit_name ||
                ''
              )
          );

        }
      );

    }


    adminAlert(
      'Available Units',
      lines.join('\n')
    );


    return results;

  } catch (err) {

    adminShowError(
      'Available Unit Search Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * UNIT CALENDAR CONFLICTS
 * ============================================================
 */

function adminShowUnitCalendarConflicts() {

  const unitId =
    adminPromptRequired(
      'Unit Calendar Conflicts',
      'Enter unit ID, for example:\nUNIT-000001'
    );


  if (!unitId) {
    return;
  }


  const startDate =
    adminPromptRequired(
      'Unit Calendar Conflicts',
      'Enter start date:\nYYYY-MM-DD'
    );


  if (!startDate) {
    return;
  }


  const endDate =
    adminPromptRequired(
      'Unit Calendar Conflicts',
      'Enter end date:\nYYYY-MM-DD'
    );


  if (!endDate) {
    return;
  }


  try {

    const result =
      AvailabilityService
        .getUnitCalendarConflicts(
          unitId,
          startDate,
          endDate
        );


    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    const lines = [

      'Unit: ' +
        result.unit_id,

      'Period: ' +
        result.start_date +
        ' → ' +
        result.end_date,

      '',

      'Conflict: ' +
        (
          result.has_conflict
            ? 'YES'
            : 'NO'
        ),

      '',

      'Reservations: ' +
        result.counts.reservations,

      'External events: ' +
        result.counts
          .external_calendar_events,

      'OTA/Admin blocks: ' +
        result.counts.ota_blocks

    ];


    adminAlert(
      'Unit Calendar Conflicts',
      lines.join('\n')
    );


    return result;

  } catch (err) {

    adminShowError(
      'Calendar Conflict Check Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * GLOBAL CALENDAR CONFLICTS
 * ============================================================
 */

function adminShowCalendarConflicts() {

  try {

    const reservationConflicts =
      AvailabilityService
        .findReservationConflicts();


    const externalConflicts =
      AvailabilityService
        .findReservationExternalConflicts();


    Logger.log(
      JSON.stringify(
        {
          reservation_conflicts:
            reservationConflicts,

          reservation_external_conflicts:
            externalConflicts
        },
        null,
        2
      )
    );


    const lines = [

      'Internal reservation conflicts: ' +
        reservationConflicts.length,

      '',

      'Reservation / external calendar overlaps: ' +
        externalConflicts.length

    ];


    if (
      reservationConflicts.length
    ) {

      lines.push(
        '',
        'INTERNAL CONFLICTS'
      );


      reservationConflicts.forEach(
        conflict => {

          lines.push(
            '- ' +
              (
                conflict.unit_id ||
                'UNKNOWN UNIT'
              )
          );

        }
      );

    }


    if (
      externalConflicts.length
    ) {

      lines.push(
        '',
        'OTA CALENDAR OVERLAPS'
      );


      externalConflicts.forEach(
        conflict => {

          lines.push(
            '- ' +
              (
                conflict.unit_id ||
                'UNKNOWN UNIT'
              )
          );

        }
      );

    }


    adminAlert(
      'Calendar Conflicts',
      lines.join('\n')
    );


    return {

      reservation_conflicts:
        reservationConflicts,

      reservation_external_conflicts:
        externalConflicts

    };

  } catch (err) {

    adminShowError(
      'Calendar Conflict Check Failed',
      err
    );

    return null;

  }

}


/**
 * ============================================================
 * REFRESH MENU
 * ============================================================
 */

function adminRefreshMenu() {

  buildRentalOpsMenu();


  adminAlert(
    'Rental Operations',
    'Menu refreshed.'
  );

}