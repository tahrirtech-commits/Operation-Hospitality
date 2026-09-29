/**
 * ============================================================
 * 51_HousekeepingScheduleService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 4 - STAY & OPERATIONS
 * ============================================================
 *
 * Purpose:
 *
 * Manage recurring housekeeping schedules stored in:
 *
 * 17_HousekeepingSchedules
 *
 * Schedule schema:
 *
 * schedule_id
 * unit_id
 * task_type
 * frequency
 * interval_value
 * day_of_week
 * day_of_month
 * last_completed
 * next_due
 * assigned_to
 * active
 *
 * ------------------------------------------------------------
 * DOMAIN RESPONSIBILITY
 * ------------------------------------------------------------
 *
 * HousekeepingScheduleService
 *   = WHEN recurring housekeeping work should happen.
 *
 * HousekeepingService
 *   = actual housekeeping TASK execution.
 *
 * Checkout cleaning is event-driven and should normally be
 * created by StayOperationsService, not this scheduler.
 *
 * ------------------------------------------------------------
 * SUPPORTED FREQUENCIES
 * ------------------------------------------------------------
 *
 * DAILY
 * WEEKLY
 * MONTHLY
 * INTERVAL_DAYS
 *
 * interval_value must always be a positive integer.
 *
 * Examples:
 *
 * DAILY / 1
 *   Every day.
 *
 * WEEKLY / 1
 *   Every week.
 *
 * WEEKLY / 2 / MONDAY
 *   Every two weeks, on Monday.
 *
 * MONTHLY / 1
 *   Every month based on previous due/completion date.
 *
 * MONTHLY / 1 / day_of_month = 15
 *   Every month, targeting the 15th.
 *
 * INTERVAL_DAYS / 30
 *   Every 30 days.
 *
 * ------------------------------------------------------------
 * IMPORTANT
 * ------------------------------------------------------------
 *
 * Canonical housekeeping task types are aligned with
 * 50_HousekeepingService.gs:
 *
 * CHECKOUT_CLEAN
 * DEEP_CLEAN
 * TOUCH_UP
 * LINEN_CHANGE
 * MANUAL
 *
 * Legacy DEEP_CLEANING should be migrated to DEEP_CLEAN.
 *
 * ============================================================
 */


const HousekeepingScheduleService = (() => {


  /*
   * ==========================================================
   * CONSTANTS
   * ==========================================================
   */

  const ENTITY_TYPE =
    'HOUSEKEEPING_SCHEDULE';


  const SHEET =
    CONFIG.SHEETS.HOUSEKEEPING_SCHEDULES;


  const FREQUENCY =
    Object.freeze({

      DAILY:
        'DAILY',

      WEEKLY:
        'WEEKLY',

      MONTHLY:
        'MONTHLY',

      INTERVAL_DAYS:
        'INTERVAL_DAYS'

    });


  const VALID_FREQUENCIES =
    new Set(
      Object.values(FREQUENCY)
    );


  const TASK_TYPE =
    Object.freeze({

      CHECKOUT_CLEAN:
        'CHECKOUT_CLEAN',

      DEEP_CLEAN:
        'DEEP_CLEAN',

      TOUCH_UP:
        'TOUCH_UP',

      LINEN_CHANGE:
        'LINEN_CHANGE',

      MANUAL:
        'MANUAL'

    });


  const VALID_TASK_TYPES =
    new Set(
      Object.values(TASK_TYPE)
    );


  const DAY_OF_WEEK =
    Object.freeze({

      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6

    });


  const VALID_DAYS_OF_WEEK =
    new Set(
      Object.keys(DAY_OF_WEEK)
    );


  /*
   * ==========================================================
   * GENERIC HELPERS
   * ==========================================================
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


  function normalizeBoolean(value) {

    if (value === true) {
      return true;
    }

    const normalized =
      normalize(value);


    return (
      normalized === 'TRUE' ||
      normalized === 'YES' ||
      normalized === '1'
    );

  }


  function pad2(value) {

    return String(value)
      .padStart(
        2,
        '0'
      );

  }


  /*
   * ==========================================================
   * DATE HELPERS
   * ==========================================================
   */

  function parseDate(value) {

    if (value instanceof Date) {

      return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate()
      );

    }


    const text =
      normalizeText(value);


    if (!text) {
      return null;
    }


    const match =
      text.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );


    if (!match) {

      throw new Error(
        'Invalid date format: ' +
        value +
        '. Expected YYYY-MM-DD.'
      );

    }


    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);


    const result =
      new Date(
        year,
        month - 1,
        day
      );


    if (
      result.getFullYear() !== year ||
      result.getMonth() !== month - 1 ||
      result.getDate() !== day
    ) {

      throw new Error(
        'Invalid date: ' +
        value
      );

    }


    return result;

  }


  function formatDate(date) {

    if (!(date instanceof Date)) {

      throw new Error(
        'Expected Date object.'
      );

    }


    return (
      date.getFullYear() +
      '-' +
      pad2(
        date.getMonth() + 1
      ) +
      '-' +
      pad2(
        date.getDate()
      )
    );

  }


  function getToday() {

    const now =
      new Date();


    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  }


  function addDays(
    date,
    days
  ) {

    const result =
      new Date(date);


    result.setDate(
      result.getDate() +
      Number(days)
    );


    return result;

  }


  function daysBetween(
    start,
    end
  ) {

    const milliseconds =
      (
        end.getTime() -
        start.getTime()
      );


    return Math.round(
      milliseconds /
      (
        24 *
        60 *
        60 *
        1000
      )
    );

  }


  function getLastDayOfMonth(
    year,
    monthIndex
  ) {

    return new Date(
      year,
      monthIndex + 1,
      0
    ).getDate();

  }


  /*
   * ==========================================================
   * READ OPERATIONS
   * ==========================================================
   */

  function getAll() {

    return BaseRepository.findAll(
      SHEET
    );

  }


  function getById(
    scheduleId
  ) {

    if (isBlank(scheduleId)) {
      return null;
    }


    return BaseRepository.findById(
      SHEET,
      'schedule_id',
      scheduleId
    );

  }


  function exists(
    scheduleId
  ) {

    return !!getById(
      scheduleId
    );

  }


  function requireSchedule(
    scheduleId
  ) {

    const schedule =
      getById(
        scheduleId
      );


    if (!schedule) {

      throw new Error(
        'Housekeeping schedule not found: ' +
        scheduleId
      );

    }


    return schedule;

  }


  function getByUnit(
    unitId
  ) {

    return BaseRepository.findByField(
      SHEET,
      'unit_id',
      unitId
    );

  }


  function getByTaskType(
    taskType
  ) {

    const expected =
      normalize(
        taskType
      );


    return getAll()
      .filter(
        schedule =>
          normalize(
            schedule.task_type
          ) === expected
      );

  }


  function getByFrequency(
    frequency
  ) {

    const expected =
      normalize(
        frequency
      );


    return getAll()
      .filter(
        schedule =>
          normalize(
            schedule.frequency
          ) === expected
      );

  }


  function getActiveSchedules() {

    return getAll()
      .filter(
        schedule =>
          normalizeBoolean(
            schedule.active
          )
      );

  }


  function getInactiveSchedules() {

    return getAll()
      .filter(
        schedule =>
          !normalizeBoolean(
            schedule.active
          )
      );

  }


  function getActiveByUnit(
    unitId
  ) {

    return getByUnit(
      unitId
    ).filter(
      schedule =>
        normalizeBoolean(
          schedule.active
        )
    );

  }


  /*
   * ==========================================================
   * VALIDATION
   * ==========================================================
   */

  function validateUnit(
    unitId
  ) {

    if (isBlank(unitId)) {

      throw new Error(
        'unit_id is required.'
      );

    }


    const unit =
      BaseRepository.findById(
        CONFIG.SHEETS.UNITS,
        'unit_id',
        unitId
      );


    if (!unit) {

      throw new Error(
        'Unit not found: ' +
        unitId
      );

    }


    return unit;

  }


  function validateTaskType(
    taskType
  ) {

    const normalized =
      normalize(
        taskType
      );


    if (
      !VALID_TASK_TYPES.has(
        normalized
      )
    ) {

      throw new Error(
        'Invalid housekeeping task type: ' +
        taskType
      );

    }


    return normalized;

  }


  function validateFrequency(
    frequency
  ) {

    const normalized =
      normalize(
        frequency
      );


    if (
      !VALID_FREQUENCIES.has(
        normalized
      )
    ) {

      throw new Error(
        'Invalid housekeeping schedule frequency: ' +
        frequency
      );

    }


    return normalized;

  }


  function validateIntervalValue(
    intervalValue
  ) {

    const number =
      Number(
        intervalValue
      );


    if (
      !Number.isInteger(number) ||
      number <= 0
    ) {

      throw new Error(
        'interval_value must be a positive integer.'
      );

    }


    return number;

  }


  function validateDayOfWeek(
    dayOfWeek
  ) {

    if (isBlank(dayOfWeek)) {
      return '';
    }


    const normalized =
      normalize(
        dayOfWeek
      );


    if (
      !VALID_DAYS_OF_WEEK.has(
        normalized
      )
    ) {

      throw new Error(
        'Invalid day_of_week: ' +
        dayOfWeek
      );

    }


    return normalized;

  }


  function validateDayOfMonth(
    dayOfMonth
  ) {

    if (isBlank(dayOfMonth)) {
      return '';
    }


    const number =
      Number(
        dayOfMonth
      );


    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 31
    ) {

      throw new Error(
        'day_of_month must be between 1 and 31.'
      );

    }


    return number;

  }


  function validateAssignedStaff(
    staffId
  ) {

    if (isBlank(staffId)) {
      return '';
    }


    const staff =
      StaffService.getStaffById(
        staffId
      );


    if (!staff) {

      throw new Error(
        'Staff not found: ' +
        staffId
      );

    }


    if (
      normalize(
        staff.status
      ) !== 'ACTIVE'
    ) {

      throw new Error(
        'Assigned staff must be ACTIVE: ' +
        staffId
      );

    }


    const role =
      normalize(
        staff.role
      );


    if (
      ![
        'HOUSEKEEPER',
        'SUPERVISOR'
      ].includes(role)
    ) {

      throw new Error(
        'Staff cannot be assigned to housekeeping schedule: ' +
        staffId +
        '. Role: ' +
        staff.role
      );

    }


    return staff;
  }


  function validateSchedule(
    data
  ) {

    if (!data) {

      throw new Error(
        'Schedule data is required.'
      );

    }


    validateUnit(
      data.unit_id
    );


    const taskType =
      validateTaskType(
        data.task_type
      );


    const frequency =
      validateFrequency(
        data.frequency
      );


    const intervalValue =
      validateIntervalValue(
        data.interval_value
      );


    const dayOfWeek =
      validateDayOfWeek(
        data.day_of_week
      );


    const dayOfMonth =
      validateDayOfMonth(
        data.day_of_month
      );


    /*
     * A specific weekday is only meaningful
     * for WEEKLY schedules.
     */

    if (
      frequency !== FREQUENCY.WEEKLY &&
      dayOfWeek
    ) {

      throw new Error(
        'day_of_week can only be used with WEEKLY frequency.'
      );

    }


    /*
     * A specific calendar day is only meaningful
     * for MONTHLY schedules.
     */

    if (
      frequency !== FREQUENCY.MONTHLY &&
      dayOfMonth !== ''
    ) {

      throw new Error(
        'day_of_month can only be used with MONTHLY frequency.'
      );

    }


    validateAssignedStaff(
      data.assigned_to
    );


    if (
      !isBlank(
        data.last_completed
      )
    ) {

      parseDate(
        data.last_completed
      );

    }


    if (
      !isBlank(
        data.next_due
      )
    ) {

      parseDate(
        data.next_due
      );

    }


    return {

      task_type:
        taskType,

      frequency:
        frequency,

      interval_value:
        intervalValue,

      day_of_week:
        dayOfWeek,

      day_of_month:
        dayOfMonth

    };

  }


  /*
   * ==========================================================
   * NEXT-DUE CALCULATION
   * ==========================================================
   */

  function calculateNextDue(
    schedule,
    baseDateValue
  ) {

    if (!schedule) {

      throw new Error(
        'Schedule is required.'
      );

    }


    const frequency =
      validateFrequency(
        schedule.frequency
      );


    const interval =
      validateIntervalValue(
        schedule.interval_value
      );


    let baseDate;


    if (
      !isBlank(
        baseDateValue
      )
    ) {

      baseDate =
        parseDate(
          baseDateValue
        );

    } else if (
      !isBlank(
        schedule.last_completed
      )
    ) {

      baseDate =
        parseDate(
          schedule.last_completed
        );

    } else {

      baseDate =
        getToday();

    }


    /*
     * --------------------------------------------------------
     * DAILY / INTERVAL_DAYS
     * --------------------------------------------------------
     */

    if (
      frequency === FREQUENCY.DAILY ||
      frequency === FREQUENCY.INTERVAL_DAYS
    ) {

      return formatDate(
        addDays(
          baseDate,
          interval
        )
      );

    }


    /*
     * --------------------------------------------------------
     * WEEKLY
     * --------------------------------------------------------
     */

    if (
      frequency ===
      FREQUENCY.WEEKLY
    ) {

      const configuredDay =
        validateDayOfWeek(
          schedule.day_of_week
        );


      /*
       * No explicit weekday:
       *
       * Same weekday after N weeks.
       */

      if (!configuredDay) {

        return formatDate(
          addDays(
            baseDate,
            interval * 7
          )
        );

      }


      const targetDay =
        DAY_OF_WEEK[
          configuredDay
        ];


      let daysUntilTarget =
        (
          targetDay -
          baseDate.getDay() +
          7
        ) % 7;


      /*
       * If base date is already the requested
       * weekday, the next occurrence is N weeks
       * later.
       */

      if (
        daysUntilTarget === 0
      ) {

        daysUntilTarget =
          interval * 7;

      } else {

        /*
         * Reach the next requested weekday,
         * then add remaining interval weeks.
         */

        daysUntilTarget +=
          (
            interval - 1
          ) * 7;

      }


      return formatDate(
        addDays(
          baseDate,
          daysUntilTarget
        )
      );

    }


    /*
     * --------------------------------------------------------
     * MONTHLY
     * --------------------------------------------------------
     */

    if (
      frequency ===
      FREQUENCY.MONTHLY
    ) {

      const configuredDay =
        validateDayOfMonth(
          schedule.day_of_month
        );


      const targetMonth =
        new Date(
          baseDate.getFullYear(),
          baseDate.getMonth() +
            interval,
          1
        );


      const lastDay =
        getLastDayOfMonth(
          targetMonth.getFullYear(),
          targetMonth.getMonth()
        );


      /*
       * If day_of_month is configured,
       * use it.
       *
       * Otherwise preserve the day from
       * the base date.
       */

      const targetDay =
        configuredDay !== ''
          ? Math.min(
              configuredDay,
              lastDay
            )
          : Math.min(
              baseDate.getDate(),
              lastDay
            );


      targetMonth.setDate(
        targetDay
      );


      return formatDate(
        targetMonth
      );

    }


    throw new Error(
      'Unsupported housekeeping frequency: ' +
      frequency
    );

  }


  /*
   * ==========================================================
   * DUPLICATE SCHEDULE DETECTION
   * ==========================================================
   */

  function findDuplicateSchedule(
    data,
    excludeScheduleId
  ) {

    const unitId =
      normalizeText(
        data.unit_id
      );


    const taskType =
      normalize(
        data.task_type
      );


    const frequency =
      normalize(
        data.frequency
      );


    return getAll()
      .find(
        schedule => {

          if (
            excludeScheduleId &&
            normalizeText(
              schedule.schedule_id
            ) ===
            normalizeText(
              excludeScheduleId
            )
          ) {

            return false;

          }


          if (
            !normalizeBoolean(
              schedule.active
            )
          ) {

            return false;

          }


          return (
            normalizeText(
              schedule.unit_id
            ) === unitId &&

            normalize(
              schedule.task_type
            ) === taskType &&

            normalize(
              schedule.frequency
            ) === frequency
          );

        }
      ) || null;

  }


  /*
   * ==========================================================
   * CREATE
   * ==========================================================
   */

  function createSchedule(
    data,
    actorId
  ) {

    const validated =
      validateSchedule(
        data
      );


    const duplicate =
      findDuplicateSchedule(
        data
      );


    if (duplicate) {

      throw new Error(
        'Active housekeeping schedule already exists: ' +
        duplicate.schedule_id
      );

    }


    let nextDue;


    /*
     * Caller may explicitly provide the
     * first due date.
     */

    if (
      !isBlank(
        data.next_due
      )
    ) {

      nextDue =
        formatDate(
          parseDate(
            data.next_due
          )
        );

    } else {

      const baseDate =
        !isBlank(
          data.last_completed
        )
          ? data.last_completed
          : formatDate(
              getToday()
            );


      nextDue =
        calculateNextDue(
          {
            frequency:
              validated.frequency,

            interval_value:
              validated.interval_value,

            day_of_week:
              validated.day_of_week,

            day_of_month:
              validated.day_of_month
          },
          baseDate
        );

    }


    const scheduleId =
      IdService.nextId(
        ENTITY_TYPE
      );


    const record = {

      schedule_id:
        scheduleId,

      unit_id:
        normalizeText(
          data.unit_id
        ),

      task_type:
        validated.task_type,

      frequency:
        validated.frequency,

      interval_value:
        validated.interval_value,

      day_of_week:
        validated.day_of_week,

      day_of_month:
        validated.day_of_month,

      last_completed:
        !isBlank(
          data.last_completed
        )
          ? formatDate(
              parseDate(
                data.last_completed
              )
            )
          : '',

      next_due:
        nextDue,

      assigned_to:
        normalizeText(
          data.assigned_to
        ),

      active:
        data.active === undefined
          ? true
          : normalizeBoolean(
              data.active
            )

    };


    const created =
      BaseRepository.insert(
        SHEET,
        record
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      scheduleId,
      created,
      actorId
    );


    return created;

  }


  /*
   * ==========================================================
   * UPDATE
   * ==========================================================
   */

  function updateSchedule(
    scheduleId,
    changes,
    actorId
  ) {

    const existing =
      requireSchedule(
        scheduleId
      );


    const candidate =
      Object.assign(
        {},
        existing,
        changes || {}
      );


    candidate.schedule_id =
      scheduleId;


    const validated =
      validateSchedule(
        candidate
      );


    const duplicate =
      findDuplicateSchedule(
        candidate,
        scheduleId
      );


    if (duplicate) {

      throw new Error(
        'Another active housekeeping schedule already exists: ' +
        duplicate.schedule_id
      );

    }


    const update = {

      unit_id:
        normalizeText(
          candidate.unit_id
        ),

      task_type:
        validated.task_type,

      frequency:
        validated.frequency,

      interval_value:
        validated.interval_value,

      day_of_week:
        validated.day_of_week,

      day_of_month:
        validated.day_of_month,

      last_completed:
        isBlank(
          candidate.last_completed
        )
          ? ''
          : formatDate(
              parseDate(
                candidate.last_completed
              )
            ),

      next_due:
        isBlank(
          candidate.next_due
        )
          ? ''
          : formatDate(
              parseDate(
                candidate.next_due
              )
            ),

      assigned_to:
        normalizeText(
          candidate.assigned_to
        ),

      active:
        normalizeBoolean(
          candidate.active
        )

    };


    const updated =
      BaseRepository.update(
        SHEET,
        'schedule_id',
        scheduleId,
        update
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      scheduleId,
      existing,
      updated,
      actorId
    );


    return updated;

  }


  /*
   * ==========================================================
   * ACTIVATE / DEACTIVATE
   * ==========================================================
   */

  function activateSchedule(
    scheduleId,
    actorId
  ) {

    return updateSchedule(
      scheduleId,
      {
        active: true
      },
      actorId
    );

  }


  function deactivateSchedule(
    scheduleId,
    actorId
  ) {

    return updateSchedule(
      scheduleId,
      {
        active: false
      },
      actorId
    );

  }


  /*
   * ==========================================================
   * DUE / OVERDUE
   * ==========================================================
   */

  function isDue(
    schedule,
    asOfDate
  ) {

    if (
      !normalizeBoolean(
        schedule.active
      )
    ) {

      return false;

    }


    if (
      isBlank(
        schedule.next_due
      )
    ) {

      return false;

    }


    const dueDate =
      parseDate(
        schedule.next_due
      );


    const referenceDate =
      isBlank(asOfDate)
        ? getToday()
        : parseDate(
            asOfDate
          );


    return (
      dueDate.getTime() <=
      referenceDate.getTime()
    );

  }


  function isOverdue(
    schedule,
    asOfDate
  ) {

    if (
      !normalizeBoolean(
        schedule.active
      )
    ) {

      return false;

    }


    if (
      isBlank(
        schedule.next_due
      )
    ) {

      return false;

    }


    const dueDate =
      parseDate(
        schedule.next_due
      );


    const referenceDate =
      isBlank(asOfDate)
        ? getToday()
        : parseDate(
            asOfDate
          );


    return (
      dueDate.getTime() <
      referenceDate.getTime()
    );

  }


  function getDueSchedules(
    asOfDate
  ) {

    return getActiveSchedules()
      .filter(
        schedule =>
          isDue(
            schedule,
            asOfDate
          )
      );

  }


  function getOverdueSchedules(
    asOfDate
  ) {

    return getActiveSchedules()
      .filter(
        schedule =>
          isOverdue(
            schedule,
            asOfDate
          )
      );

  }


  /*
   * ==========================================================
   * TASK GENERATION
   * ==========================================================
   */

function findExistingGeneratedTask(
  schedule
) {

  if (
    isBlank(
      schedule.next_due
    )
  ) {

    return null;

  }


  const tasks =
    HousekeepingService.getByUnit(
      schedule.unit_id
    );


  const scheduleDueDate =
    formatDate(
      parseDate(
        schedule.next_due
      )
    );


  return tasks.find(
    task => {

      if (
        normalize(
          task.status
        ) === 'CANCELLED'
      ) {

        return false;

      }


      if (
        normalize(
          task.task_type
        ) !==
        normalize(
          schedule.task_type
        )
      ) {

        return false;

      }


      if (
        isBlank(
          task.scheduled_date
        )
      ) {

        return false;

      }


      const taskDate =
        formatDate(
          parseDate(
            task.scheduled_date
          )
        );


      return (
        taskDate ===
        scheduleDueDate
      );

    }
  ) || null;

}

  function generateTask(
    scheduleId,
    actorId
  ) {

    const schedule =
      requireSchedule(
        scheduleId
      );


    if (
      !normalizeBoolean(
        schedule.active
      )
    ) {

      throw new Error(
        'Cannot generate task from inactive schedule: ' +
        scheduleId
      );

    }


    if (
      isBlank(
        schedule.next_due
      )
    ) {

      throw new Error(
        'Schedule has no next_due date: ' +
        scheduleId
      );

    }


    const existing =
      findExistingGeneratedTask(
        schedule
      );


    if (existing) {

      return {
        created: false,
        reason:
          'TASK_ALREADY_EXISTS',
        schedule:
          schedule,
        task:
          existing
      };

    }


    const task =
      HousekeepingService.createTask(
        {

          unit_id:
            schedule.unit_id,

          reservation_id:
            '',

          task_type:
            schedule.task_type,

          priority:
            'NORMAL',

          scheduled_date:
            schedule.next_due,

          scheduled_start:
            '',

          scheduled_end:
            '',

          assigned_to:
            schedule.assigned_to,

          inspection_required:
            (
              normalize(
                schedule.task_type
              ) === 'DEEP_CLEAN'
            ),

          notes:
            'Generated from housekeeping schedule ' +
            schedule.schedule_id

        },
        actorId
      );


    return {
      created: true,
      reason:
        'TASK_CREATED',
      schedule:
        schedule,
      task:
        task
    };

  }


  function generateDueTasks(
    asOfDate,
    actorId
  ) {

    const schedules =
      getDueSchedules(
        asOfDate
      );


    const results = [];


    schedules.forEach(
      schedule => {

        try {

          results.push(
            generateTask(
              schedule.schedule_id,
              actorId
            )
          );

        } catch (err) {

          results.push({

            created:
              false,

            reason:
              'ERROR',

            schedule_id:
              schedule.schedule_id,

            error:
              err.message

          });

        }

      }
    );


    return results;

  }


  /*
   * ==========================================================
   * COMPLETION SYNCHRONIZATION
   * ==========================================================
   *
   * Called when a task belonging to a recurring schedule
   * has been completed.
   *
   * For MVP, linkage is determined by:
   *
   * unit_id
   * task_type
   * scheduled_date
   *
   * Future enhancement:
   *
   * Add schedule_id directly to 16_HousekeepingTasks.
   * ==========================================================
   */

  function findScheduleForTask(
    task
  ) {

    if (!task) {
      return null;
    }


    const candidates =
      getActiveByUnit(
        task.unit_id
      ).filter(
        schedule =>
          normalize(
            schedule.task_type
          ) ===
          normalize(
            task.task_type
          )
      );


    /*
     * Strongest MVP match:
     * next_due == task scheduled date.
     */
/*
    const exact =
      candidates.find(
        schedule =>
          normalizeText(
            schedule.next_due
          ) ===
          normalizeText(
            task.scheduled_date
          )
      );
      */
const exact =
  candidates.find(
    schedule => {

      if (
        isBlank(
          schedule.next_due
        ) ||
        isBlank(
          task.scheduled_date
        )
      ) {

        return false;

      }


      return (
        formatDate(
          parseDate(
            schedule.next_due
          )
        ) ===
        formatDate(
          parseDate(
            task.scheduled_date
          )
        )
      );

    }
  );

    if (exact) {
      return exact;
    }


    /*
     * If only one recurring schedule exists
     * for this unit/task type, it is safe enough
     * for the current MVP model.
     */

    if (
      candidates.length === 1
    ) {

      return candidates[0];

    }


    return null;

  }


  function recordTaskCompletion(
    taskId,
    actorId
  ) {

    const task =
      HousekeepingService.getById(
        taskId
      );


    if (!task) {

      throw new Error(
        'Housekeeping task not found: ' +
        taskId
      );

    }


    if (
      normalize(
        task.status
      ) !== 'COMPLETED'
    ) {

      throw new Error(
        'Housekeeping task must be COMPLETED before updating schedule: ' +
        taskId
      );

    }


    const schedule =
      findScheduleForTask(
        task
      );


    if (!schedule) {

      return {
        updated: false,
        reason:
          'NO_MATCHING_SCHEDULE',
        task:
          task
      };

    }


    /*
     * Use actual completion date when possible.
     *
     * completed_at format:
     * YYYY-MM-DD HH:mm:ss
     */

    let completionDate =
      normalizeText(
        task.completed_at
      );


    if (
      completionDate.length >= 10
    ) {

      completionDate =
        completionDate.substring(
          0,
          10
        );

    } else {

      completionDate =
        normalizeText(
          task.scheduled_date
        );

    }


    if (!completionDate) {

      completionDate =
        formatDate(
          getToday()
        );

    }


    const nextDue =
      calculateNextDue(
        schedule,
        completionDate
      );


    const updated =
      updateSchedule(
        schedule.schedule_id,
        {
          last_completed:
            completionDate,

          next_due:
            nextDue
        },
        actorId
      );


    return {
      updated: true,
      reason:
        'SCHEDULE_ADVANCED',
      task:
        task,
      schedule:
        updated
    };

  }


  /*
   * ==========================================================
   * RECALCULATE NEXT DUE
   * ==========================================================
   */

  function recalculateNextDue(
    scheduleId,
    actorId
  ) {

    const schedule =
      requireSchedule(
        scheduleId
      );


    const baseDate =
      !isBlank(
        schedule.last_completed
      )
        ? schedule.last_completed
        : formatDate(
            getToday()
          );


    const nextDue =
      calculateNextDue(
        schedule,
        baseDate
      );


    return updateSchedule(
      scheduleId,
      {
        next_due:
          nextDue
      },
      actorId
    );

  }


  /*
   * ==========================================================
   * INTEGRITY HELPERS
   * ==========================================================
   */

  function findOrphanUnitLinks() {

    return getAll()
      .filter(
        schedule => {

          if (
            isBlank(
              schedule.unit_id
            )
          ) {

            return true;

          }


          return !BaseRepository.findById(
            CONFIG.SHEETS.UNITS,
            'unit_id',
            schedule.unit_id
          );

        }
      );

  }


  function findOrphanStaffLinks() {

    return getAll()
      .filter(
        schedule => {

          if (
            isBlank(
              schedule.assigned_to
            )
          ) {

            return false;

          }


          return !StaffService.getStaffById(
            schedule.assigned_to
          );

        }
      );

  }


  function findInvalidTaskTypes() {

    return getAll()
      .filter(
        schedule =>
          !VALID_TASK_TYPES.has(
            normalize(
              schedule.task_type
            )
          )
      );

  }


  function findInvalidFrequencies() {

    return getAll()
      .filter(
        schedule =>
          !VALID_FREQUENCIES.has(
            normalize(
              schedule.frequency
            )
          )
      );

  }


  function findInvalidIntervals() {

    return getAll()
      .filter(
        schedule => {

          const value =
            Number(
              schedule.interval_value
            );


          return (
            !Number.isInteger(
              value
            ) ||
            value <= 0
          );

        }
      );

  }


  function findInvalidDaysOfWeek() {

    return getAll()
      .filter(
        schedule => {

          if (
            isBlank(
              schedule.day_of_week
            )
          ) {

            return false;

          }


          if (
            normalize(
              schedule.frequency
            ) !== FREQUENCY.WEEKLY
          ) {

            return true;

          }


          return !VALID_DAYS_OF_WEEK.has(
            normalize(
              schedule.day_of_week
            )
          );

        }
      );

  }


  function findInvalidDaysOfMonth() {

    return getAll()
      .filter(
        schedule => {

          if (
            isBlank(
              schedule.day_of_month
            )
          ) {

            return false;

          }


          if (
            normalize(
              schedule.frequency
            ) !== FREQUENCY.MONTHLY
          ) {

            return true;

          }


          const value =
            Number(
              schedule.day_of_month
            );


          return (
            !Number.isInteger(
              value
            ) ||
            value < 1 ||
            value > 31
          );

        }
      );

  }


  function findInvalidDates() {

    return getAll()
      .filter(
        schedule => {

          try {

            if (
              !isBlank(
                schedule.last_completed
              )
            ) {

              parseDate(
                schedule.last_completed
              );

            }


            if (
              !isBlank(
                schedule.next_due
              )
            ) {

              parseDate(
                schedule.next_due
              );

            }


            return false;

          } catch (err) {

            return true;

          }

        }
      );

  }


  function findInvalidStaffAssignments() {

    const staff =
      StaffService.getAllStaff();


    const staffById =
      new Map(
        staff.map(
          member => [
            normalizeText(
              member.staff_id
            ),
            member
          ]
        )
      );


    return getAll()
      .filter(
        schedule => {

          const staffId =
            normalizeText(
              schedule.assigned_to
            );


          if (!staffId) {
            return false;
          }


          const member =
            staffById.get(
              staffId
            );


          /*
           * Missing staff is handled separately
           * by findOrphanStaffLinks().
           */

          if (!member) {
            return false;
          }


          return (
            normalize(
              member.status
            ) !== 'ACTIVE' ||

            ![
              'HOUSEKEEPER',
              'SUPERVISOR'
            ].includes(
              normalize(
                member.role
              )
            )
          );

        }
      );

  }


  function findDuplicateActiveSchedules() {

    const groups =
      new Map();


    getActiveSchedules()
      .forEach(
        schedule => {

          const key =
            [
              normalizeText(
                schedule.unit_id
              ),

              normalize(
                schedule.task_type
              ),

              normalize(
                schedule.frequency
              )
            ].join('|');


          if (
            !groups.has(
              key
            )
          ) {

            groups.set(
              key,
              []
            );

          }


          groups
            .get(key)
            .push(
              schedule
            );

        }
      );


    const duplicates = [];


    groups.forEach(
      records => {

        if (
          records.length > 1
        ) {

          duplicates.push(
            ...records
          );

        }

      }
    );


    return duplicates;

  }


  function findActiveSchedulesWithoutNextDue() {

    return getActiveSchedules()
      .filter(
        schedule =>
          isBlank(
            schedule.next_due
          )
      );

  }


  /*
   * ==========================================================
   * DIAGNOSTICS
   * ==========================================================
   */

  function getScheduleStatus(
    scheduleId,
    asOfDate
  ) {

    const schedule =
      requireSchedule(
        scheduleId
      );


    const referenceDate =
      isBlank(asOfDate)
        ? getToday()
        : parseDate(
            asOfDate
          );


    let daysUntilDue =
      null;


    if (
      !isBlank(
        schedule.next_due
      )
    ) {

      daysUntilDue =
        daysBetween(
          referenceDate,
          parseDate(
            schedule.next_due
          )
        );

    }


    return {

      schedule_id:
        schedule.schedule_id,

      unit_id:
        schedule.unit_id,

      task_type:
        schedule.task_type,

      frequency:
        schedule.frequency,

      active:
        normalizeBoolean(
          schedule.active
        ),

      last_completed:
        schedule.last_completed,

      next_due:
        schedule.next_due,

      due:
        isDue(
          schedule,
          formatDate(
            referenceDate
          )
        ),

      overdue:
        isOverdue(
          schedule,
          formatDate(
            referenceDate
          )
        ),

      days_until_due:
        daysUntilDue

    };

  }


  /*
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {

    FREQUENCY,
    TASK_TYPE,

    createSchedule,
    updateSchedule,

    activateSchedule,
    deactivateSchedule,

    getAll,
    getById,
    exists,
    requireSchedule,

    getByUnit,
    getByTaskType,
    getByFrequency,

    getActiveSchedules,
    getInactiveSchedules,
    getActiveByUnit,

    calculateNextDue,

    isDue,
    isOverdue,

    getDueSchedules,
    getOverdueSchedules,

    findDuplicateSchedule,

    generateTask,
    generateDueTasks,

    findScheduleForTask,
    recordTaskCompletion,

    recalculateNextDue,

    getScheduleStatus,

    findOrphanUnitLinks,
    findOrphanStaffLinks,
    findInvalidTaskTypes,
    findInvalidFrequencies,
    findInvalidIntervals,
    findInvalidDaysOfWeek,
    findInvalidDaysOfMonth,
    findInvalidDates,
    findInvalidStaffAssignments,
    findDuplicateActiveSchedules,
    findActiveSchedulesWithoutNextDue

  };


})();
