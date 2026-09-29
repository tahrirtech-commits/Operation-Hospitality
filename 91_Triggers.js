/**
 * ============================================================
 * 91_Triggers.gs
 * Automated background jobs
 * ============================================================
 */


/**
 * Entry point used by the Apps Script trigger.
 *
 * Keep the trigger pointing to a global function rather than
 * directly to an object method.
 */
function scheduledCalendarSync() {

  try {

    const result =
      CalendarSyncService
        .runScheduledSync();

    Logger.log(
      'Scheduled calendar sync completed.'
    );

    Logger.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } catch (err) {

    Logger.log(
      'Scheduled calendar sync FAILED: ' +
      err.message
    );

    throw err;

  }

}


/**
 * Creates the automatic hourly calendar-sync trigger.
 *
 * Safe to run multiple times:
 * existing trigger is removed first.
 */
function installCalendarSyncTrigger() {

  removeCalendarSyncTrigger();


  const trigger =
    ScriptApp
      .newTrigger(
        'scheduledCalendarSync'
      )
      .timeBased()
      .everyHours(1)
      .create();


  Logger.log(
    'Calendar sync trigger installed.'
  );

  Logger.log(
    'Trigger ID: ' +
      trigger.getUniqueId()
  );


  return {
    installed: true,
    trigger_id:
      trigger.getUniqueId(),
    frequency:
      'EVERY_1_HOUR',
    handler:
      'scheduledCalendarSync'
  };

}


/**
 * Removes calendar synchronization triggers.
 */
function removeCalendarSyncTrigger() {

  const triggers =
    ScriptApp
      .getProjectTriggers();


  let removed =
    0;


  triggers.forEach(trigger => {

    if (
      trigger.getHandlerFunction() ===
      'scheduledCalendarSync'
    ) {

      ScriptApp.deleteTrigger(
        trigger
      );

      removed++;

    }

  });


  Logger.log(
    'Calendar sync trigger(s) removed: ' +
      removed
  );


  return removed;

}


/**
 * Shows currently installed project triggers.
 */
function showInstalledTriggers() {

  const triggers =
    ScriptApp
      .getProjectTriggers();


  const result =
    triggers.map(trigger => ({
      handler:
        trigger.getHandlerFunction(),

      event_type:
        String(
          trigger.getEventType()
        ),

      source:
        String(
          trigger.getTriggerSource()
        ),

      trigger_id:
        trigger.getUniqueId()
    }));


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}