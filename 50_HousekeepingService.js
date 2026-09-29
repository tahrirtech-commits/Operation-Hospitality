/**
 * ============================================================
 * 50_HousekeepingService.gs
 * RENTAL OPERATIONS MVP
 * PHASE 4 - HOUSEKEEPING TASK MANAGEMENT
 * ============================================================
 *
 * Sheet:
 * 16_HousekeepingTasks
 *
 * Schema:
 *
 * task_id
 * unit_id
 * reservation_id
 * task_type
 * priority
 * scheduled_date
 * scheduled_start
 * scheduled_end
 * assigned_to
 * status
 * started_at
 * completed_at
 * inspection_required
 * notes
 *
 * Responsibilities:
 *
 * - Create housekeeping tasks
 * - Create checkout cleaning tasks
 * - Create deep-cleaning tasks
 * - Assign/reassign housekeeping staff
 * - Manage housekeeping lifecycle
 * - Query housekeeping workload
 * - Identify overdue tasks
 * - Prevent duplicate active tasks
 * - Provide integrity helpers
 * - Audit changes
 *
 * Scheduling rules such as "deep clean every 30 days"
 * belong to 51_HousekeepingScheduleService.gs.
 *
 * ============================================================
 */

const HousekeepingService = (() => {

  const ENTITY_TYPE =
    'HOUSEKEEPING_TASK';


  /**
   * ----------------------------------------------------------
   * TASK TYPES
   * ----------------------------------------------------------
   *
   * These are intentionally service-local for Phase 4.
   */

  const TASK_TYPE = {

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

  };


  const VALID_TASK_TYPES =
    new Set(
      Object.values(
        TASK_TYPE
      )
    );


  /**
   * ----------------------------------------------------------
   * PRIORITIES
   * ----------------------------------------------------------
   */

  const PRIORITY = {

    LOW:
      'LOW',

    NORMAL:
      'NORMAL',

    HIGH:
      'HIGH',

    URGENT:
      'URGENT'

  };


  const VALID_PRIORITIES =
    new Set(
      Object.values(
        PRIORITY
      )
    );


  /**
   * ----------------------------------------------------------
   * STATUSES
   * ----------------------------------------------------------
   *
   * PENDING
   *   Task exists but is not assigned.
   *
   * ASSIGNED
   *   Task has a housekeeper.
   *
   * IN_PROGRESS
   *   Cleaning has started.
   *
   * COMPLETED
   *   Cleaning work is complete.
   *
   * CANCELLED
   *   Task is no longer required.
   */

  const STATUS = {

    PENDING:
      'PENDING',

    ASSIGNED:
      'ASSIGNED',

    IN_PROGRESS:
      'IN_PROGRESS',

    COMPLETED:
      'COMPLETED',

    CANCELLED:
      'CANCELLED'

  };


  const VALID_STATUSES =
    new Set(
      Object.values(
        STATUS
      )
    );


  const ACTIVE_STATUSES =
    new Set([
      STATUS.PENDING,
      STATUS.ASSIGNED,
      STATUS.IN_PROGRESS
    ]);


  /**
   * ----------------------------------------------------------
   * STATUS TRANSITIONS
   * ----------------------------------------------------------
   */

  const TRANSITIONS = {

    PENDING: [
      STATUS.ASSIGNED,
      STATUS.CANCELLED
    ],

    ASSIGNED: [
      STATUS.PENDING,
      STATUS.IN_PROGRESS,
      STATUS.CANCELLED
    ],

    IN_PROGRESS: [
      STATUS.COMPLETED,
      STATUS.CANCELLED
    ],

    COMPLETED: [],

    CANCELLED: []

  };


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


  function normalizeBoolean(value) {

    if (
      value === true ||
      value === 1
    ) {
      return true;
    }


    const normalized =
      normalize(value);


    return (
      normalized === 'TRUE' ||
      normalized === 'YES' ||
      normalized === 'Y' ||
      normalized === '1'
    );

  }


  function normalizeActorId(actorId) {

    return (
      normalizeText(actorId) ||
      CONFIG.DEFAULTS.ACTOR_ID
    );

  }


  function nowTimestamp() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATETIME
    );

  }


  function todayDate() {

    return Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      CONFIG.DATE_FORMATS.DATE
    );

  }


  /**
   * ----------------------------------------------------------
   * DATE NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeDate(value) {

    if (isBlank(value)) {
      return '';
    }


    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {

      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE,
        CONFIG.DATE_FORMATS.DATE
      );

    }


    const text =
      normalizeText(value);


    const match =
      text.match(
        /^(\d{4})-(\d{2})-(\d{2})/
      );


    if (!match) {

      throw new Error(
        'Invalid date. Expected YYYY-MM-DD: ' +
          value
      );

    }


    return (
      match[1] +
      '-' +
      match[2] +
      '-' +
      match[3]
    );

  }


  /**
   * ----------------------------------------------------------
   * TIME NORMALIZATION
   * ----------------------------------------------------------
   */

  function normalizeTime(value) {

    if (isBlank(value)) {
      return '';
    }


    if (
      value instanceof Date &&
      !isNaN(value.getTime())
    ) {

      return Utilities.formatDate(
        value,
        CONFIG.TIMEZONE,
        CONFIG.DATE_FORMATS.TIME
      );

    }


    const text =
      normalizeText(value);


    const match =
      text.match(
        /^([01]\d|2[0-3]):([0-5]\d)/
      );


    if (!match) {

      throw new Error(
        'Invalid time. Expected HH:mm: ' +
          value
      );

    }


    return (
      match[1] +
      ':' +
      match[2]
    );

  }


  /**
   * ----------------------------------------------------------
   * VALIDATION
   * ----------------------------------------------------------
   */

  function validateTaskType(
    taskType
  ) {

    taskType =
      normalize(taskType);


    if (
      !VALID_TASK_TYPES.has(
        taskType
      )
    ) {

      throw new Error(
        'Invalid housekeeping task_type: ' +
          taskType
      );

    }


    return true;

  }


  function validatePriority(
    priority
  ) {

    priority =
      normalize(priority);


    if (
      !VALID_PRIORITIES.has(
        priority
      )
    ) {

      throw new Error(
        'Invalid housekeeping priority: ' +
          priority
      );

    }


    return true;

  }


  function validateStatus(
    status
  ) {

    status =
      normalize(status);


    if (
      !VALID_STATUSES.has(
        status
      )
    ) {

      throw new Error(
        'Invalid housekeeping status: ' +
          status
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * UNIT VALIDATION
   * ----------------------------------------------------------
   */

  function requireUnit(
    unitId
  ) {

    unitId =
      normalizeText(
        unitId
      );


    if (!unitId) {

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


  /**
   * ----------------------------------------------------------
   * RESERVATION VALIDATION
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
      return null;
    }


    return ReservationService
      .requireReservation(
        reservationId
      );

  }


  /**
   * ----------------------------------------------------------
   * STAFF VALIDATION
   * ----------------------------------------------------------
   */
function requireStaff(
  staffId
) {

  staffId =
    normalizeText(
      staffId
    );

  if (!staffId) {

    throw new Error(
      'staffId is required.'
    );

  }


  const staff =
    StaffService.getStaffById(
      staffId
    );


  if (!staff) {

    throw new Error(
      'Staff member not found: ' +
        staffId
    );

  }


  return staff;

}

  /**
   * ----------------------------------------------------------
   * HOUSEKEEPER VALIDATION
   * ----------------------------------------------------------
   */

  function validateAssignedStaff(
    staffId
  ) {

    if (isBlank(staffId)) {
      return true;
    }


    const staff =
      requireStaff(
        staffId
      );


    if (
      normalize(
        staff.status
      ) !== 'ACTIVE'
    ) {

      throw new Error(
        'Assigned staff is not ACTIVE: ' +
          staffId
      );

    }


    /*
     * HOUSEKEEPER is the preferred role.
     *
     * SUPERVISOR is allowed because supervisors may
     * execute/cover housekeeping work operationally.
     */

    const role =
      normalize(
        staff.role
      );


    if (
      role !== 'HOUSEKEEPER' &&
      role !== 'SUPERVISOR'
    ) {

      throw new Error(
        'Staff ' +
          staffId +
          ' cannot be assigned to housekeeping. Role=' +
          role
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * NORMALIZE TASK
   * ----------------------------------------------------------
   */

  function normalizeTask(input) {

    input =
      input || {};


    const assignedTo =
      normalizeText(
        input.assigned_to
      );


    let status =
      normalize(
        input.status
      );


    /*
     * Default status is derived from assignment.
     */

    if (!status) {

      status =
        assignedTo
          ? STATUS.ASSIGNED
          : STATUS.PENDING;

    }


    return {

      task_id:
        normalizeText(
          input.task_id
        ),

      unit_id:
        normalizeText(
          input.unit_id
        ),

      reservation_id:
        normalizeText(
          input.reservation_id
        ),

      task_type:
        normalize(
          input.task_type
        ),

      priority:
        normalize(
          input.priority ||
          PRIORITY.NORMAL
        ),

      scheduled_date:
        normalizeDate(
          input.scheduled_date
        ),

      scheduled_start:
        normalizeTime(
          input.scheduled_start
        ),

      scheduled_end:
        normalizeTime(
          input.scheduled_end
        ),

      assigned_to:
        assignedTo,

      status:
        status,

      started_at:
        normalizeText(
          input.started_at
        ),

      completed_at:
        normalizeText(
          input.completed_at
        ),

      inspection_required:
        normalizeBoolean(
          input.inspection_required
        ),

      notes:
        normalizeText(
          input.notes
        )

    };

  }


  /**
   * ----------------------------------------------------------
   * VALIDATE TASK
   * ----------------------------------------------------------
   */

  function validateTask(
    task
  ) {

    if (!task.unit_id) {

      throw new Error(
        'unit_id is required.'
      );

    }


    if (!task.task_type) {

      throw new Error(
        'task_type is required.'
      );

    }


    if (!task.scheduled_date) {

      throw new Error(
        'scheduled_date is required.'
      );

    }


    requireUnit(
      task.unit_id
    );


    validateTaskType(
      task.task_type
    );


    validatePriority(
      task.priority
    );


    validateStatus(
      task.status
    );


    /*
     * Reservation is optional.
     */

    if (
      task.reservation_id
    ) {

      const reservation =
        requireReservation(
          task.reservation_id
        );


      if (
        normalizeText(
          reservation.unit_id
        ) !==
        normalizeText(
          task.unit_id
        )
      ) {

        throw new Error(
          'Reservation ' +
            task.reservation_id +
            ' belongs to unit ' +
            reservation.unit_id +
            ', not ' +
            task.unit_id +
            '.'
        );

      }

    }


    if (
      task.assigned_to
    ) {

      validateAssignedStaff(
        task.assigned_to
      );

    }


    /*
     * ASSIGNED / IN_PROGRESS require an assignee.
     */

    if (
      (
        task.status ===
          STATUS.ASSIGNED ||
        task.status ===
          STATUS.IN_PROGRESS
      ) &&
      !task.assigned_to
    ) {

      throw new Error(
        task.status +
          ' housekeeping task requires assigned_to.'
      );

    }


    /*
     * Completed task requires completion timestamp.
     */

    if (
      task.status ===
        STATUS.COMPLETED &&
      !task.completed_at
    ) {

      throw new Error(
        'COMPLETED housekeeping task requires completed_at.'
      );

    }


    /*
     * Time window validation.
     */

    if (
      task.scheduled_start &&
      task.scheduled_end &&
      task.scheduled_start >=
        task.scheduled_end
    ) {

      throw new Error(
        'scheduled_end must be later than scheduled_start.'
      );

    }


    return true;

  }


  /**
   * ----------------------------------------------------------
   * BASIC QUERIES
   * ----------------------------------------------------------
   */

  function getAll() {

    return BaseRepository.findAll(
      CONFIG.SHEETS
        .HOUSEKEEPING_TASKS
    );

  }


  function getById(
    taskId
  ) {

    return BaseRepository.findById(
      CONFIG.SHEETS
        .HOUSEKEEPING_TASKS,

      'task_id',

      normalizeText(
        taskId
      )
    );

  }


  function exists(
    taskId
  ) {

    return !!getById(
      taskId
    );

  }


  function requireTask(
    taskId
  ) {

    const task =
      getById(
        taskId
      );


    if (!task) {

      throw new Error(
        'Housekeeping task not found: ' +
          taskId
      );

    }


    return task;

  }


  function getByUnit(
    unitId
  ) {

    return BaseRepository.findByField(
      CONFIG.SHEETS
        .HOUSEKEEPING_TASKS,

      'unit_id',

      normalizeText(
        unitId
      )
    );

  }


  function getByReservation(
    reservationId
  ) {

    return BaseRepository.findByField(
      CONFIG.SHEETS
        .HOUSEKEEPING_TASKS,

      'reservation_id',

      normalizeText(
        reservationId
      )
    );

  }


  function getByStaff(
    staffId
  ) {

    return BaseRepository.findByField(
      CONFIG.SHEETS
        .HOUSEKEEPING_TASKS,

      'assigned_to',

      normalizeText(
        staffId
      )
    );

  }


  function getByStatus(
    status
  ) {

    status =
      normalize(status);


    validateStatus(
      status
    );


    return getAll()
      .filter(
        task =>
          normalize(
            task.status
          ) === status
      );

  }


  function getByTaskType(
    taskType
  ) {

    taskType =
      normalize(taskType);


    validateTaskType(
      taskType
    );


    return getAll()
      .filter(
        task =>
          normalize(
            task.task_type
          ) === taskType
      );

  }


  function getByScheduledDate(
    scheduledDate
  ) {

    scheduledDate =
      normalizeDate(
        scheduledDate
      );


    return getAll()
      .filter(
        task =>
          normalizeDate(
            task.scheduled_date
          ) === scheduledDate
      );

  }


  /**
   * ----------------------------------------------------------
   * ACTIVE TASKS
   * ----------------------------------------------------------
   */

  function isActiveStatus(
    status
  ) {

    return ACTIVE_STATUSES.has(
      normalize(status)
    );

  }


  function getActiveTasks() {

    return getAll()
      .filter(
        task =>
          isActiveStatus(
            task.status
          )
      );

  }


  function getActiveTasksByUnit(
    unitId
  ) {

    return getByUnit(
      unitId
    )
    .filter(
      task =>
        isActiveStatus(
          task.status
        )
    );

  }


  /**
   * ----------------------------------------------------------
   * DUPLICATE DETECTION
   * ----------------------------------------------------------
   *
   * Prevents duplicate active work for:
   *
   * unit
   * reservation
   * task type
   * scheduled date
   *
   * For recurring tasks without reservation_id,
   * reservation_id is simply blank.
   * ----------------------------------------------------------
   */

  function findDuplicateActiveTask(
    input,
    excludeTaskId
  ) {

    const unitId =
      normalizeText(
        input.unit_id
      );


    const reservationId =
      normalizeText(
        input.reservation_id
      );


    const taskType =
      normalize(
        input.task_type
      );


    const scheduledDate =
      normalizeDate(
        input.scheduled_date
      );


    excludeTaskId =
      normalizeText(
        excludeTaskId
      );


    return getAll()
      .find(task => {

        if (
          excludeTaskId &&
          normalizeText(
            task.task_id
          ) === excludeTaskId
        ) {
          return false;
        }


        if (
          !isActiveStatus(
            task.status
          )
        ) {
          return false;
        }


        return (
          normalizeText(
            task.unit_id
          ) === unitId &&

          normalizeText(
            task.reservation_id
          ) === reservationId &&

          normalize(
            task.task_type
          ) === taskType &&

          normalizeDate(
            task.scheduled_date
          ) === scheduledDate
        );

      }) || null;

  }


  /**
   * ----------------------------------------------------------
   * CREATE TASK
   * ----------------------------------------------------------
   */

  function createTask(
    input,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const task =
      normalizeTask(
        input
      );


    /*
     * Never accept externally supplied ID.
     */

    task.task_id =
      '';


    validateTask(
      task
    );


    const duplicate =
      findDuplicateActiveTask(
        task
      );


    if (duplicate) {

      throw new Error(
        'Duplicate active housekeeping task detected: ' +
          duplicate.task_id
      );

    }


    /*
     * ID generated only after validation.
     */

    task.task_id =
      IdService.nextId(
        ENTITY_TYPE
      );


    const inserted =
      BaseRepository.insert(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        task
      );


    AuditService.logCreate(
      ENTITY_TYPE,
      task.task_id,
      inserted,
      actorId
    );


    return inserted;

  }


  /**
   * ----------------------------------------------------------
   * CREATE CHECKOUT CLEAN
   * ----------------------------------------------------------
   */

  function createCheckoutCleaning(
    reservationId,
    options,
    actorId
  ) {

    options =
      options || {};


    const reservation =
      requireReservation(
        reservationId
      );


    const scheduledDate =
      normalizeDate(
        options.scheduled_date ||
        reservation.check_out_date
      );


    return createTask(
      {

        unit_id:
          reservation.unit_id,

        reservation_id:
          reservation.reservation_id,

        task_type:
          TASK_TYPE.CHECKOUT_CLEAN,

        priority:
          options.priority ||
          PRIORITY.HIGH,

        scheduled_date:
          scheduledDate,

        scheduled_start:
          options.scheduled_start ||
          '',

        scheduled_end:
          options.scheduled_end ||
          '',

        assigned_to:
          options.assigned_to ||
          '',

        inspection_required:
          options.inspection_required !==
            undefined
            ? options.inspection_required
            : true,

        notes:
          options.notes ||
          (
            'Checkout cleaning for ' +
            reservation.reservation_id
          )

      },

      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * CREATE DEEP CLEAN
   * ----------------------------------------------------------
   *
   * Called manually or by
   * HousekeepingScheduleService.
   * ----------------------------------------------------------
   */

  function createDeepCleaning(
    unitId,
    scheduledDate,
    options,
    actorId
  ) {

    options =
      options || {};


    requireUnit(
      unitId
    );


    return createTask(
      {

        unit_id:
          unitId,

        reservation_id:
          options.reservation_id ||
          '',

        task_type:
          TASK_TYPE.DEEP_CLEAN,

        priority:
          options.priority ||
          PRIORITY.NORMAL,

        scheduled_date:
          scheduledDate,

        scheduled_start:
          options.scheduled_start ||
          '',

        scheduled_end:
          options.scheduled_end ||
          '',

        assigned_to:
          options.assigned_to ||
          '',

        inspection_required:
          options.inspection_required !==
            undefined
            ? options.inspection_required
            : true,

        notes:
          options.notes ||
          'Scheduled deep cleaning'

      },

      actorId
    );

  }


  /**
   * ----------------------------------------------------------
   * UPDATE TASK
   * ----------------------------------------------------------
   *
   * Status changes should use lifecycle functions.
   * ----------------------------------------------------------
   */

  function updateTask(
    taskId,
    changes,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    changes =
      changes || {};


    if (
      Object.prototype
        .hasOwnProperty.call(
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
        'Use housekeeping lifecycle methods to change task status.'
      );

    }


    const merged =
      Object.assign(
        {},
        existing,
        changes,
        {
          task_id:
            existing.task_id,

          status:
            existing.status,

          started_at:
            existing.started_at,

          completed_at:
            existing.completed_at
        }
      );


    const normalized =
      normalizeTask(
        merged
      );


    normalized.task_id =
      existing.task_id;


    validateTask(
      normalized
    );


    const duplicate =
      findDuplicateActiveTask(
        normalized,
        taskId
      );


    if (duplicate) {

      throw new Error(
        'Update would create duplicate active housekeeping task: ' +
          duplicate.task_id
      );

    }


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        normalized
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      taskId,
      existing,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * ASSIGN TASK
   * ----------------------------------------------------------
   */

  function assignTask(
    taskId,
    staffId,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    if (
      normalize(
        existing.status
      ) ===
        STATUS.COMPLETED ||
      normalize(
        existing.status
      ) ===
        STATUS.CANCELLED
    ) {

      throw new Error(
        'Cannot assign terminal housekeeping task: ' +
          taskId
      );

    }


    validateAssignedStaff(
      staffId
    );


    const updated =
      Object.assign(
        {},
        existing,
        {
          assigned_to:
            normalizeText(
              staffId
            ),

          status:
            STATUS.ASSIGNED
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        updated
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      taskId,
      existing,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * UNASSIGN TASK
   * ----------------------------------------------------------
   */

  function unassignTask(
    taskId,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    if (
      normalize(
        existing.status
      ) !==
        STATUS.ASSIGNED
    ) {

      throw new Error(
        'Only ASSIGNED housekeeping tasks can be unassigned.'
      );

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          assigned_to:
            '',

          status:
            STATUS.PENDING
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        updated
      );


    AuditService.logUpdate(
      ENTITY_TYPE,
      taskId,
      existing,
      saved,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * START TASK
   * ----------------------------------------------------------
   */

  function startTask(
    taskId,
    actorId
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    if (
      normalize(
        existing.status
      ) !==
        STATUS.ASSIGNED
    ) {

      throw new Error(
        'Housekeeping task must be ASSIGNED before it can start.'
      );

    }


    if (
      !existing.assigned_to
    ) {

      throw new Error(
        'Housekeeping task requires assigned_to before starting.'
      );

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          status:
            STATUS.IN_PROGRESS,

          started_at:
            nowTimestamp()
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        updated
      );


    AuditService.logStatusChange(
      ENTITY_TYPE,
      taskId,
      existing.status,
      STATUS.IN_PROGRESS,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * COMPLETE TASK
   * ----------------------------------------------------------
   *
   * This marks cleaning work complete.
   *
   * It intentionally does NOT set the unit READY.
   *
   * That decision belongs to the Phase 4 orchestration /
   * inspection workflow.
   * ----------------------------------------------------------
   */

  function completeTask(
    taskId,
    actorId,
    notes
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    if (
      normalize(
        existing.status
      ) !==
        STATUS.IN_PROGRESS
    ) {

      throw new Error(
        'Housekeeping task must be IN_PROGRESS before completion.'
      );

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          status:
            STATUS.COMPLETED,

          completed_at:
            nowTimestamp(),

          notes:
            !isBlank(notes)
              ? normalizeText(notes)
              : existing.notes
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        updated
      );


    AuditService.logStatusChange(
      ENTITY_TYPE,
      taskId,
      existing.status,
      STATUS.COMPLETED,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * CANCEL TASK
   * ----------------------------------------------------------
   */

  function cancelTask(
    taskId,
    actorId,
    reason
  ) {

    actorId =
      normalizeActorId(
        actorId
      );


    const existing =
      requireTask(
        taskId
      );


    const currentStatus =
      normalize(
        existing.status
      );


    if (
      currentStatus ===
        STATUS.COMPLETED
    ) {

      throw new Error(
        'Completed housekeeping task cannot be cancelled.'
      );

    }


    if (
      currentStatus ===
        STATUS.CANCELLED
    ) {

      return existing;

    }


    const updated =
      Object.assign(
        {},
        existing,
        {
          status:
            STATUS.CANCELLED,

          notes:
            !isBlank(reason)
              ? (
                  existing.notes
                    ? existing.notes +
                      ' | Cancelled: ' +
                      normalizeText(reason)
                    : 'Cancelled: ' +
                      normalizeText(reason)
                )
              : existing.notes
        }
      );


    const saved =
      BaseRepository.update(
        CONFIG.SHEETS
          .HOUSEKEEPING_TASKS,

        'task_id',

        taskId,

        updated
      );


    AuditService.logStatusChange(
      ENTITY_TYPE,
      taskId,
      existing.status,
      STATUS.CANCELLED,
      actorId
    );


    return saved;

  }


  /**
   * ----------------------------------------------------------
   * STATUS TRANSITION HELPERS
   * ----------------------------------------------------------
   */

  function getAllowedTransitions(
    status
  ) {

    status =
      normalize(status);


    validateStatus(
      status
    );


    return (
      TRANSITIONS[status] ||
      []
    ).slice();

  }


  function canTransition(
    fromStatus,
    toStatus
  ) {

    fromStatus =
      normalize(fromStatus);


    toStatus =
      normalize(toStatus);


    validateStatus(
      fromStatus
    );


    validateStatus(
      toStatus
    );


    return getAllowedTransitions(
      fromStatus
    )
    .includes(
      toStatus
    );

  }


  /**
   * ----------------------------------------------------------
   * TODAY / OVERDUE
   * ----------------------------------------------------------
   */

  function getTodayTasks() {

    return getByScheduledDate(
      todayDate()
    );

  }


  function getOverdueTasks() {

    const today =
      todayDate();


    return getActiveTasks()
      .filter(task => {

        const scheduledDate =
          normalizeDate(
            task.scheduled_date
          );


        return (
          scheduledDate &&
          scheduledDate < today
        );

      });

  }


  function getOpenTasksForStaff(
    staffId
  ) {

    return getByStaff(
      staffId
    )
    .filter(
      task =>
        isActiveStatus(
          task.status
        )
    );

  }


  /**
   * ----------------------------------------------------------
   * INSPECTION QUEUE
   * ----------------------------------------------------------
   *
   * Completed cleaning tasks requiring inspection.
   * ----------------------------------------------------------
   */

  function getCompletedTasksRequiringInspection() {

    return getAll()
      .filter(task => {

        return (
          normalize(
            task.status
          ) ===
            STATUS.COMPLETED &&

          normalizeBoolean(
            task.inspection_required
          )
        );

      });

  }


  /**
   * ----------------------------------------------------------
   * INTEGRITY HELPERS
   * ----------------------------------------------------------
   */

  function findOrphanUnitLinks() {

    const unitIds =
      new Set(
        BaseRepository
          .findAll(
            CONFIG.SHEETS.UNITS
          )
          .map(
            unit =>
              normalizeText(
                unit.unit_id
              )
          )
      );


    return getAll()
      .filter(
        task =>
          !unitIds.has(
            normalizeText(
              task.unit_id
            )
          )
      );

  }


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
      .filter(task => {

        const reservationId =
          normalizeText(
            task.reservation_id
          );


        return (
          reservationId &&
          !reservationIds.has(
            reservationId
          )
        );

      });

  }

/*
  function findOrphanStaffLinks() {
    const staffIds =
      new Set(
        StaffService
          .getAll()
          .map(
            staff =>
              normalizeText(
                staff.staff_id
              )
          )
      );
    return getAll()
      .filter(task => {

        const staffId =
          normalizeText(
            task.assigned_to
          );


        return (
          staffId &&
          !staffIds.has(
            staffId
          )
        );

      });

  }
*/

function findOrphanStaffLinks() {

  const staffIds =
    new Set(
      StaffService
        .getAllStaff()
        .map(
          staff =>
            normalizeText(
              staff.staff_id
            )
        )
    );


  return getAll()
    .filter(task => {

      const staffId =
        normalizeText(
          task.assigned_to
        );


      return (
        staffId &&
        !staffIds.has(
          staffId
        )
      );

    });

}
  function findInvalidTaskTypes() {

    return getAll()
      .filter(
        task =>
          !VALID_TASK_TYPES.has(
            normalize(
              task.task_type
            )
          )
      );

  }


  function findInvalidPriorities() {

    return getAll()
      .filter(
        task =>
          !VALID_PRIORITIES.has(
            normalize(
              task.priority
            )
          )
      );

  }


  function findInvalidStatuses() {

    return getAll()
      .filter(
        task =>
          !VALID_STATUSES.has(
            normalize(
              task.status
            )
          )
      );

  }


  function findInvalidAssignments() {

    return getAll()
      .filter(task => {

        const status =
          normalize(
            task.status
          );


        return (
          (
            status ===
              STATUS.ASSIGNED ||
            status ===
              STATUS.IN_PROGRESS
          ) &&
          isBlank(
            task.assigned_to
          )
        );

      });

  }


  function findCompletedWithoutTimestamp() {

    return getAll()
      .filter(task => {

        return (
          normalize(
            task.status
          ) ===
            STATUS.COMPLETED &&
          isBlank(
            task.completed_at
          )
        );

      });

  }


  function findDuplicateActiveTasks() {

    const grouped =
      {};


    getAll()
      .filter(
        task =>
          isActiveStatus(
            task.status
          )
      )
      .forEach(task => {

        const key = [

          normalizeText(
            task.unit_id
          ),

          normalizeText(
            task.reservation_id
          ),

          normalize(
            task.task_type
          ),

          normalizeDate(
            task.scheduled_date
          )

        ].join(
          '::'
        );


        if (
          !grouped[key]
        ) {

          grouped[key] =
            [];

        }


        grouped[key].push(
          task
        );

      });


    return Object.keys(
      grouped
    )
    .filter(
      key =>
        grouped[key]
          .length > 1
    )
    .map(
      key => ({

        key:
          key,

        count:
          grouped[key]
            .length,

        tasks:
          grouped[key]

      })
    );

  }


  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {

    TASK_TYPE,

    PRIORITY,

    STATUS,

    createTask,

    createCheckoutCleaning,

    createDeepCleaning,

    updateTask,

    assignTask,

    unassignTask,

    startTask,

    completeTask,

    cancelTask,

    getAll,

    getById,

    exists,

    requireTask,

    getByUnit,

    getByReservation,

    getByStaff,

    getByStatus,

    getByTaskType,

    getByScheduledDate,

    getActiveTasks,

    getActiveTasksByUnit,

    getTodayTasks,

    getOverdueTasks,

    getOpenTasksForStaff,

    getCompletedTasksRequiringInspection,

    isActiveStatus,

    validateTaskType,

    validatePriority,

    validateStatus,

    validateAssignedStaff,

    getAllowedTransitions,

    canTransition,

    findDuplicateActiveTask,

    findOrphanUnitLinks,

    findOrphanReservationLinks,

    findOrphanStaffLinks,

    findInvalidTaskTypes,

    findInvalidPriorities,

    findInvalidStatuses,

    findInvalidAssignments,

    findCompletedWithoutTimestamp,

    findDuplicateActiveTasks

  };

})();