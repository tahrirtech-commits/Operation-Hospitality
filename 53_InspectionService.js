/**
 * ============================================================================
 * 53_InspectionService.gs
 * ============================================================================
 *
 * PHASE 4 - INSPECTION DOMAIN
 *
 * Owns:
 *   - Inspections
 *   - Inspection lifecycle
 *   - Inspection checklist items
 *   - Inspection scores/results
 *   - Inspection integrity checks
 *
 * Does NOT own:
 *   - Unit operational status transitions
 *   - Housekeeping task lifecycle
 *   - Maintenance work-order lifecycle
 *   - Reservation lifecycle
 *
 * Cross-domain orchestration belongs in:
 *   54_StayOperationsService.gs
 *
 * Sheets:
 *   21_Inspections
 *   22_InspectionChecklist
 *
 * ============================================================================
 */

const InspectionService = (() => {

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const ENTITY = {
    INSPECTION: 'INSPECTION',
    CHECKLIST_ITEM: 'INSPECTION_CHECKLIST_ITEM'
  };

  const SHEET = {
    INSPECTIONS: CONFIG.SHEETS.INSPECTIONS,
    CHECKLIST: CONFIG.SHEETS.INSPECTION_CHECKLIST
  };

  const INSPECTION_TYPE = {
    CHECKOUT: 'CHECKOUT',
    PRE_CHECKIN: 'PRE_CHECKIN',
    MANUAL: 'MANUAL'
  };

  const STATUS = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
  };

  const RESULT = {
    PASS: 'PASS',
    FAIL: 'FAIL'
  };

  const CHECKLIST_CATEGORY = {
    CLEANLINESS: 'CLEANLINESS',
    HOUSEKEEPING: 'HOUSEKEEPING',
    MAINTENANCE: 'MAINTENANCE',
    INVENTORY: 'INVENTORY'
  };

  const CHECKLIST_RESULT = {
    PASS: 'PASS',
    FAIL: 'FAIL'
  };

  const ALLOWED_INSPECTOR_ROLES = new Set([
    'SUPERVISOR',
    'ADMIN'
  ]);

  const VALID_INSPECTION_TYPES = new Set(
    Object.values(INSPECTION_TYPE)
  );

  const VALID_STATUSES = new Set(
    Object.values(STATUS)
  );

  const VALID_RESULTS = new Set(
    Object.values(RESULT)
  );

  const VALID_CHECKLIST_CATEGORIES = new Set(
    Object.values(CHECKLIST_CATEGORY)
  );

  const VALID_CHECKLIST_RESULTS = new Set(
    Object.values(CHECKLIST_RESULT)
  );

  const ALLOWED_TRANSITIONS = {
    PENDING: new Set([
      STATUS.IN_PROGRESS,
      STATUS.CANCELLED
    ]),

    IN_PROGRESS: new Set([
      STATUS.COMPLETED,
      STATUS.CANCELLED
    ]),

    COMPLETED: new Set([]),

    CANCELLED: new Set([])
  };


  // ==========================================================================
  // GENERIC HELPERS
  // ==========================================================================

  function isBlank(value) {
    return (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    );
  }


  function normalize(value) {
    if (isBlank(value)) {
      return '';
    }

    return String(value).trim().toUpperCase();
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


  function normalizeActor(actorId) {
    return normalizeText(
      actorId || CONFIG.DEFAULTS.ACTOR_ID
    );
  }


  function parseNumber(value) {
    if (isBlank(value)) {
      return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error(
        `Invalid numeric value: ${value}`
      );
    }

    return number;
  }


  function validateScore(value, fieldName) {
    if (isBlank(value)) {
      return '';
    }

    const score = Number(value);

    if (!Number.isFinite(score)) {
      throw new Error(
        `${fieldName} must be numeric.`
      );
    }

    if (score < 0 || score > 100) {
      throw new Error(
        `${fieldName} must be between 0 and 100.`
      );
    }

    return score;
  }


  // ==========================================================================
  // DEPENDENCY HELPERS
  // ==========================================================================

  function requireUnit(unitId) {
    const normalizedUnitId = normalizeText(unitId);

    if (isBlank(normalizedUnitId)) {
      throw new Error('unit_id is required.');
    }

    const unit = BaseRepository.findById(
      CONFIG.SHEETS.UNITS,
      'unit_id',
      normalizedUnitId
    );

    if (!unit) {
      throw new Error(
        `Unit not found: ${normalizedUnitId}`
      );
    }

    return unit;
  }


  function requireReservation(reservationId) {
    if (isBlank(reservationId)) {
      return null;
    }

    const normalizedReservationId =
      normalizeText(reservationId);

    const reservation =
      ReservationService.getById(
        normalizedReservationId
      );

    if (!reservation) {
      throw new Error(
        `Reservation not found: ${normalizedReservationId}`
      );
    }

    return reservation;
  }


  function requireInspector(inspectorId) {
    const normalizedInspectorId =
      normalizeText(inspectorId);

    if (isBlank(normalizedInspectorId)) {
      throw new Error('inspector_id is required.');
    }

    const staff =
      StaffService.getStaffById(
        normalizedInspectorId
      );

    if (!staff) {
      throw new Error(
        `Inspector not found: ${normalizedInspectorId}`
      );
    }

    if (normalize(staff.status) !== 'ACTIVE') {
      throw new Error(
        `Inspector ${normalizedInspectorId} is not ACTIVE.`
      );
    }

    const role = normalize(staff.role);

    if (!ALLOWED_INSPECTOR_ROLES.has(role)) {
      throw new Error(
        `Staff ${normalizedInspectorId} with role ${role} cannot perform inspections.`
      );
    }

    return staff;
  }


  function validateReservationUnit(
    reservation,
    unitId
  ) {
    if (!reservation) {
      return;
    }

    if (
      normalizeText(reservation.unit_id) !==
      normalizeText(unitId)
    ) {
      throw new Error(
        `Reservation ${reservation.reservation_id} belongs to unit ` +
        `${reservation.unit_id}, not ${unitId}.`
      );
    }
  }


  // ==========================================================================
  // INSPECTION VALIDATION
  // ==========================================================================

  function validateInspectionType(type) {
    const normalized = normalize(type);

    if (!VALID_INSPECTION_TYPES.has(normalized)) {
      throw new Error(
        `Invalid inspection type: ${type}`
      );
    }

    return normalized;
  }


  function validateStatus(status) {
    const normalized = normalize(status);

    if (!VALID_STATUSES.has(normalized)) {
      throw new Error(
        `Invalid inspection status: ${status}`
      );
    }

    return normalized;
  }


  function validateOverallResult(result) {
    if (isBlank(result)) {
      return '';
    }

    const normalized = normalize(result);

    if (!VALID_RESULTS.has(normalized)) {
      throw new Error(
        `Invalid inspection result: ${result}`
      );
    }

    return normalized;
  }


  function validateChecklistCategory(category) {
    const normalized = normalize(category);

    if (!VALID_CHECKLIST_CATEGORIES.has(normalized)) {
      throw new Error(
        `Invalid checklist category: ${category}`
      );
    }

    return normalized;
  }


  function validateChecklistResult(result) {
    if (isBlank(result)) {
      return '';
    }

    const normalized = normalize(result);

    if (!VALID_CHECKLIST_RESULTS.has(normalized)) {
      throw new Error(
        `Invalid checklist result: ${result}`
      );
    }

    return normalized;
  }


  function getAllowedTransitions(status) {
    const normalized = validateStatus(status);

    return Array.from(
      ALLOWED_TRANSITIONS[normalized] || []
    );
  }


  function assertTransition(fromStatus, toStatus) {
    const from = validateStatus(fromStatus);
    const to = validateStatus(toStatus);

    if (from === to) {
      return true;
    }

    const allowed =
      ALLOWED_TRANSITIONS[from] ||
      new Set();

    if (!allowed.has(to)) {
      throw new Error(
        `Invalid inspection status transition: ${from} -> ${to}`
      );
    }

    return true;
  }


  // ==========================================================================
  // INSPECTION READ OPERATIONS
  // ==========================================================================

  function getAll() {
    return BaseRepository.findAll(
      SHEET.INSPECTIONS
    );
  }


  function getById(inspectionId) {
    if (isBlank(inspectionId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.INSPECTIONS,
      'inspection_id',
      normalizeText(inspectionId)
    );
  }


  function exists(inspectionId) {
    return !!getById(inspectionId);
  }


  function requireInspection(inspectionId) {
    const inspection = getById(inspectionId);

    if (!inspection) {
      throw new Error(
        `Inspection not found: ${inspectionId}`
      );
    }

    return inspection;
  }


  function getByUnit(unitId) {
    return BaseRepository.findByField(
      SHEET.INSPECTIONS,
      'unit_id',
      normalizeText(unitId)
    );
  }


  function getByReservation(reservationId) {
    return BaseRepository.findByField(
      SHEET.INSPECTIONS,
      'reservation_id',
      normalizeText(reservationId)
    );
  }


  function getByInspector(inspectorId) {
    return BaseRepository.findByField(
      SHEET.INSPECTIONS,
      'inspector_id',
      normalizeText(inspectorId)
    );
  }


  function getByStatus(status) {
    const normalized =
      validateStatus(status);

    return getAll().filter(
      row => normalize(row.status) === normalized
    );
  }


  function getByType(type) {
    const normalized =
      validateInspectionType(type);

    return getAll().filter(
      row =>
        normalize(row.inspection_type) === normalized
    );
  }


  function getPendingInspections() {
    return getByStatus(STATUS.PENDING);
  }


  function getInProgressInspections() {
    return getByStatus(STATUS.IN_PROGRESS);
  }


  function getCompletedInspections() {
    return getByStatus(STATUS.COMPLETED);
  }


  // ==========================================================================
  // INSPECTION CREATE
  // ==========================================================================

  function createInspection(data, actorId) {
    data = data || {};

    const actor = normalizeActor(actorId);

    const unit = requireUnit(data.unit_id);

    const reservation =
      requireReservation(data.reservation_id);

    validateReservationUnit(
      reservation,
      unit.unit_id
    );

    const inspectionType =
      validateInspectionType(
        data.inspection_type
      );

    let inspectorId = '';

    if (!isBlank(data.inspector_id)) {
      const inspector =
        requireInspector(data.inspector_id);

      inspectorId = inspector.staff_id;
    }

    const cleanlinessScore =
      validateScore(
        data.cleanliness_score,
        'cleanliness_score'
      );

    const maintenanceScore =
      validateScore(
        data.maintenance_score,
        'maintenance_score'
      );

    const overallResult =
      validateOverallResult(
        data.overall_result
      );

    if (!isBlank(overallResult)) {
      throw new Error(
        'overall_result must be blank when creating an inspection.'
      );
    }

    const inspection = {
      inspection_id:
        IdService.nextId(
          ENTITY.INSPECTION
        ),

      unit_id:
        unit.unit_id,

      reservation_id:
        reservation
          ? reservation.reservation_id
          : '',

      inspection_type:
        inspectionType,

      scheduled_at:
        normalizeText(data.scheduled_at),

      inspector_id:
        inspectorId,

      status:
        STATUS.PENDING,

      cleanliness_score:
        cleanlinessScore === null
          ? ''
          : cleanlinessScore,

      maintenance_score:
        maintenanceScore === null
          ? ''
          : maintenanceScore,

      overall_result:
        '',

      notes:
        normalizeText(data.notes)
    };

    const inserted =
      BaseRepository.insert(
        SHEET.INSPECTIONS,
        inspection
      );

    AuditService.logCreate(
      ENTITY.INSPECTION,
      inserted.inspection_id,
      inserted,
      actor
    );

    return inserted;
  }


  // ==========================================================================
  // INSPECTION UPDATE
  // ==========================================================================

  function updateInspection(
    inspectionId,
    changes,
    actorId
  ) {
    const current =
      requireInspection(inspectionId);

    const actor =
      normalizeActor(actorId);

    changes = changes || {};

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'status'
      )
    ) {
      throw new Error(
        'Use inspection lifecycle methods to change status.'
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'overall_result'
      )
    ) {
      throw new Error(
        'Use completeInspection() to set overall_result.'
      );
    }

    const update = {};

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'unit_id'
      )
    ) {
      const unit =
        requireUnit(changes.unit_id);

      update.unit_id =
        unit.unit_id;
    }

    const effectiveUnitId =
      update.unit_id ||
      current.unit_id;

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'reservation_id'
      )
    ) {
      if (isBlank(changes.reservation_id)) {
        update.reservation_id = '';
      } else {
        const reservation =
          requireReservation(
            changes.reservation_id
          );

        validateReservationUnit(
          reservation,
          effectiveUnitId
        );

        update.reservation_id =
          reservation.reservation_id;
      }
    } else if (
      !isBlank(current.reservation_id) &&
      update.unit_id
    ) {
      const reservation =
        requireReservation(
          current.reservation_id
        );

      validateReservationUnit(
        reservation,
        effectiveUnitId
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'inspection_type'
      )
    ) {
      update.inspection_type =
        validateInspectionType(
          changes.inspection_type
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'scheduled_at'
      )
    ) {
      update.scheduled_at =
        normalizeText(
          changes.scheduled_at
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'inspector_id'
      )
    ) {
      if (isBlank(changes.inspector_id)) {
        update.inspector_id = '';
      } else {
        const inspector =
          requireInspector(
            changes.inspector_id
          );

        update.inspector_id =
          inspector.staff_id;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'cleanliness_score'
      )
    ) {
      update.cleanliness_score =
        validateScore(
          changes.cleanliness_score,
          'cleanliness_score'
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'maintenance_score'
      )
    ) {
      update.maintenance_score =
        validateScore(
          changes.maintenance_score,
          'maintenance_score'
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'notes'
      )
    ) {
      update.notes =
        normalizeText(changes.notes);
    }

    if (Object.keys(update).length === 0) {
      return current;
    }

    const updated =
      BaseRepository.update(
        SHEET.INSPECTIONS,
        'inspection_id',
        current.inspection_id,
        update
      );

    AuditService.logUpdate(
      ENTITY.INSPECTION,
      current.inspection_id,
      current,
      updated,
      actor
    );

    return updated;
  }


  // ==========================================================================
  // INSPECTION LIFECYCLE
  // ==========================================================================

  function changeStatus(
    inspectionId,
    newStatus,
    actorId
  ) {
    const current =
      requireInspection(inspectionId);

    const target =
      validateStatus(newStatus);

    const currentStatus =
      validateStatus(current.status);

    assertTransition(
      currentStatus,
      target
    );

    const actor =
      normalizeActor(actorId);

    const updated =
      BaseRepository.update(
        SHEET.INSPECTIONS,
        'inspection_id',
        current.inspection_id,
        {
          status: target
        }
      );

    AuditService.logStatusChange(
      ENTITY.INSPECTION,
      current.inspection_id,
      currentStatus,
      target,
      actor
    );

    return updated;
  }


  function startInspection(
    inspectionId,
    actorId
  ) {
    const inspection =
      requireInspection(inspectionId);

    if (isBlank(inspection.inspector_id)) {
      throw new Error(
        'Inspection must have an inspector before it can be started.'
      );
    }

    requireInspector(
      inspection.inspector_id
    );

    return changeStatus(
      inspectionId,
      STATUS.IN_PROGRESS,
      actorId
    );
  }


  function completeInspection(
    inspectionId,
    data,
    actorId
  ) {
    data = data || {};

    const current =
      requireInspection(inspectionId);

    const currentStatus =
      validateStatus(current.status);

    assertTransition(
      currentStatus,
      STATUS.COMPLETED
    );

    if (isBlank(current.inspector_id)) {
      throw new Error(
        'Inspection must have an inspector before completion.'
      );
    }

    requireInspector(
      current.inspector_id
    );

    const checklist =
      getChecklist(inspectionId);

    const incompleteItems =
      checklist.filter(
        item => isBlank(item.result)
      );

    if (incompleteItems.length > 0) {
      throw new Error(
        `Inspection ${inspectionId} has ${incompleteItems.length} incomplete checklist item(s).`
      );
    }

    const overallResult =
      validateOverallResult(
        data.overall_result
      );

    if (isBlank(overallResult)) {
      throw new Error(
        'overall_result is required when completing an inspection.'
      );
    }

    const cleanlinessScore =
      Object.prototype.hasOwnProperty.call(
        data,
        'cleanliness_score'
      )
        ? validateScore(
            data.cleanliness_score,
            'cleanliness_score'
          )
        : current.cleanliness_score;

    const maintenanceScore =
      Object.prototype.hasOwnProperty.call(
        data,
        'maintenance_score'
      )
        ? validateScore(
            data.maintenance_score,
            'maintenance_score'
          )
        : current.maintenance_score;

    const actor =
      normalizeActor(actorId);

    const update = {
      status:
        STATUS.COMPLETED,

      cleanliness_score:
        isBlank(cleanlinessScore)
          ? ''
          : cleanlinessScore,

      maintenance_score:
        isBlank(maintenanceScore)
          ? ''
          : maintenanceScore,

      overall_result:
        overallResult
    };

    if (
      Object.prototype.hasOwnProperty.call(
        data,
        'notes'
      )
    ) {
      update.notes =
        normalizeText(data.notes);
    }

    const updated =
      BaseRepository.update(
        SHEET.INSPECTIONS,
        'inspection_id',
        current.inspection_id,
        update
      );

    AuditService.logUpdate(
      ENTITY.INSPECTION,
      current.inspection_id,
      current,
      updated,
      actor
    );

    return updated;
  }


  function cancelInspection(
    inspectionId,
    notes,
    actorId
  ) {
    const current =
      requireInspection(inspectionId);

    const currentStatus =
      validateStatus(current.status);

    assertTransition(
      currentStatus,
      STATUS.CANCELLED
    );

    const actor =
      normalizeActor(actorId);

    const update = {
      status:
        STATUS.CANCELLED
    };

    if (!isBlank(notes)) {
      update.notes =
        normalizeText(notes);
    }

    const updated =
      BaseRepository.update(
        SHEET.INSPECTIONS,
        'inspection_id',
        current.inspection_id,
        update
      );

    AuditService.logUpdate(
      ENTITY.INSPECTION,
      current.inspection_id,
      current,
      updated,
      actor
    );

    return updated;
  }


  // ==========================================================================
  // CHECKLIST READ OPERATIONS
  // ==========================================================================

  function getAllChecklistItems() {
    return BaseRepository.findAll(
      SHEET.CHECKLIST
    );
  }


  function getChecklistItem(
    checklistItemId
  ) {
    if (isBlank(checklistItemId)) {
      return null;
    }

    return BaseRepository.findById(
      SHEET.CHECKLIST,
      'checklist_item_id',
      normalizeText(checklistItemId)
    );
  }


  function requireChecklistItem(
    checklistItemId
  ) {
    const item =
      getChecklistItem(checklistItemId);

    if (!item) {
      throw new Error(
        `Inspection checklist item not found: ${checklistItemId}`
      );
    }

    return item;
  }


  function getChecklist(inspectionId) {
    requireInspection(inspectionId);

    return BaseRepository.findByField(
      SHEET.CHECKLIST,
      'inspection_id',
      normalizeText(inspectionId)
    );
  }


  function getChecklistByCategory(
    inspectionId,
    category
  ) {
    const normalizedCategory =
      validateChecklistCategory(
        category
      );

    return getChecklist(
      inspectionId
    ).filter(
      item =>
        normalize(item.category) ===
        normalizedCategory
    );
  }


  function getFailedChecklistItems(
    inspectionId
  ) {
    return getChecklist(
      inspectionId
    ).filter(
      item =>
        normalize(item.result) ===
        CHECKLIST_RESULT.FAIL
    );
  }


  function getIncompleteChecklistItems(
    inspectionId
  ) {
    return getChecklist(
      inspectionId
    ).filter(
      item => isBlank(item.result)
    );
  }


  // ==========================================================================
  // CHECKLIST CREATE
  // ==========================================================================

  function addChecklistItem(
    inspectionId,
    data,
    actorId
  ) {
    data = data || {};

    const inspection =
      requireInspection(inspectionId);

    if (
      normalize(inspection.status) ===
        STATUS.COMPLETED ||
      normalize(inspection.status) ===
        STATUS.CANCELLED
    ) {
      throw new Error(
        `Cannot add checklist items to ${inspection.status} inspection ${inspectionId}.`
      );
    }

    const category =
      validateChecklistCategory(
        data.category
      );

    const itemText =
      normalizeText(data.item);

    if (isBlank(itemText)) {
      throw new Error(
        'Checklist item description is required.'
      );
    }

    const duplicate =
      getChecklist(
        inspectionId
      ).find(item =>
        normalize(item.category) ===
          category &&
        normalizeText(item.item)
          .toLowerCase() ===
          itemText.toLowerCase()
      );

    if (duplicate) {
      throw new Error(
        `Duplicate checklist item for inspection ${inspectionId}: ${itemText}`
      );
    }

    const result =
      validateChecklistResult(
        data.result
      );

    const checklistItem = {
      checklist_item_id:
        IdService.nextId(
          ENTITY.CHECKLIST_ITEM
        ),

      inspection_id:
        inspection.inspection_id,

      category:
        category,

      item:
        itemText,

      result:
        result,

      notes:
        normalizeText(data.notes)
    };

    const inserted =
      BaseRepository.insert(
        SHEET.CHECKLIST,
        checklistItem
      );

    AuditService.logCreate(
      ENTITY.CHECKLIST_ITEM,
      inserted.checklist_item_id,
      inserted,
      normalizeActor(actorId)
    );

    return inserted;
  }


  // ==========================================================================
  // CHECKLIST UPDATE
  // ==========================================================================

  function updateChecklistItem(
    checklistItemId,
    changes,
    actorId
  ) {
    const current =
      requireChecklistItem(
        checklistItemId
      );

    const inspection =
      requireInspection(
        current.inspection_id
      );

    if (
      normalize(inspection.status) ===
        STATUS.COMPLETED ||
      normalize(inspection.status) ===
        STATUS.CANCELLED
    ) {
      throw new Error(
        `Cannot modify checklist for ${inspection.status} inspection ${inspection.inspection_id}.`
      );
    }

    changes = changes || {};

    const update = {};

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'inspection_id'
      )
    ) {
      throw new Error(
        'inspection_id cannot be changed for an existing checklist item.'
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'category'
      )
    ) {
      update.category =
        validateChecklistCategory(
          changes.category
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'item'
      )
    ) {
      const itemText =
        normalizeText(changes.item);

      if (isBlank(itemText)) {
        throw new Error(
          'Checklist item description cannot be blank.'
        );
      }

      update.item =
        itemText;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'result'
      )
    ) {
      update.result =
        validateChecklistResult(
          changes.result
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        'notes'
      )
    ) {
      update.notes =
        normalizeText(changes.notes);
    }

    const effectiveCategory =
      update.category ||
      current.category;

    const effectiveItem =
      update.item ||
      current.item;

    const duplicate =
      getChecklist(
        current.inspection_id
      ).find(item =>
        item.checklist_item_id !==
          current.checklist_item_id &&
        normalize(item.category) ===
          normalize(effectiveCategory) &&
        normalizeText(item.item)
          .toLowerCase() ===
          normalizeText(effectiveItem)
            .toLowerCase()
      );

    if (duplicate) {
      throw new Error(
        `Duplicate checklist item: ${effectiveItem}`
      );
    }

    if (Object.keys(update).length === 0) {
      return current;
    }

    const updated =
      BaseRepository.update(
        SHEET.CHECKLIST,
        'checklist_item_id',
        current.checklist_item_id,
        update
      );

    AuditService.logUpdate(
      ENTITY.CHECKLIST_ITEM,
      current.checklist_item_id,
      current,
      updated,
      normalizeActor(actorId)
    );

    return updated;
  }


  function setChecklistResult(
    checklistItemId,
    result,
    notes,
    actorId
  ) {
    const changes = {
      result:
        validateChecklistResult(result)
    };

    if (!isBlank(notes)) {
      changes.notes =
        normalizeText(notes);
    }

    return updateChecklistItem(
      checklistItemId,
      changes,
      actorId
    );
  }


  // ==========================================================================
  // CHECKLIST DELETE
  // ==========================================================================

  function removeChecklistItem(
    checklistItemId,
    actorId
  ) {
    const current =
      requireChecklistItem(
        checklistItemId
      );

    const inspection =
      requireInspection(
        current.inspection_id
      );

    if (
      normalize(inspection.status) ===
        STATUS.COMPLETED ||
      normalize(inspection.status) ===
        STATUS.CANCELLED
    ) {
      throw new Error(
        `Cannot remove checklist items from ${inspection.status} inspection ${inspection.inspection_id}.`
      );
    }

    const sheet =
      BaseRepository.getSheet(
        SHEET.CHECKLIST
      );

    const rowNumber =
      BaseRepository.findRowNumberById(
        SHEET.CHECKLIST,
        'checklist_item_id',
        current.checklist_item_id
      );

    if (rowNumber < 2) {
      throw new Error(
        `Checklist item row not found: ${current.checklist_item_id}`
      );
    }

    sheet.deleteRow(rowNumber);

    AuditService.logSystem(
      'DELETE',
      ENTITY.CHECKLIST_ITEM,
      current.checklist_item_id,
      {
        deleted_record: current
      },
      normalizeActor(actorId)
    );

    return current;
  }


  // ==========================================================================
  // RESULT HELPERS
  // ==========================================================================

  function hasChecklistFailures(
    inspectionId
  ) {
    return (
      getFailedChecklistItems(
        inspectionId
      ).length > 0
    );
  }


  function getFailureCategories(
    inspectionId
  ) {
    const categories = new Set();

    getFailedChecklistItems(
      inspectionId
    ).forEach(item => {
      categories.add(
        normalize(item.category)
      );
    });

    return Array.from(categories);
  }


  function hasMaintenanceFailure(
    inspectionId
  ) {
    return getFailedChecklistItems(
      inspectionId
    ).some(
      item =>
        normalize(item.category) ===
        CHECKLIST_CATEGORY.MAINTENANCE
    );
  }


  function hasCleaningFailure(
    inspectionId
  ) {
    return getFailedChecklistItems(
      inspectionId
    ).some(item => {
      const category =
        normalize(item.category);

      return (
        category ===
          CHECKLIST_CATEGORY.CLEANLINESS ||
        category ===
          CHECKLIST_CATEGORY.HOUSEKEEPING
      );
    });
  }


  // ==========================================================================
  // INTEGRITY - INSPECTIONS
  // ==========================================================================

  function findOrphanUnitLinks() {
    return getAll().filter(
      inspection => {
        if (isBlank(inspection.unit_id)) {
          return true;
        }

        return !BaseRepository.findById(
          CONFIG.SHEETS.UNITS,
          'unit_id',
          inspection.unit_id
        );
      }
    );
  }


  function findOrphanReservationLinks() {
    return getAll().filter(
      inspection => {
        if (
          isBlank(
            inspection.reservation_id
          )
        ) {
          return false;
        }

        return !ReservationService.getById(
          inspection.reservation_id
        );
      }
    );
  }


  function findReservationUnitMismatches() {
    return getAll().filter(
      inspection => {
        if (
          isBlank(
            inspection.reservation_id
          )
        ) {
          return false;
        }

        const reservation =
          ReservationService.getById(
            inspection.reservation_id
          );

        if (!reservation) {
          return false;
        }

        return (
          normalizeText(
            reservation.unit_id
          ) !==
          normalizeText(
            inspection.unit_id
          )
        );
      }
    );
  }


  function findOrphanInspectorLinks() {
    return getAll().filter(
      inspection => {
        if (
          isBlank(
            inspection.inspector_id
          )
        ) {
          return false;
        }

        return !StaffService.getStaffById(
          inspection.inspector_id
        );
      }
    );
  }


  function findInvalidInspectorAssignments() {
    return getAll().filter(
      inspection => {
        if (
          isBlank(
            inspection.inspector_id
          )
        ) {
          return false;
        }

        const staff =
          StaffService.getStaffById(
            inspection.inspector_id
          );

        if (!staff) {
          return false;
        }

        return (
          normalize(staff.status) !==
            'ACTIVE' ||
          !ALLOWED_INSPECTOR_ROLES.has(
            normalize(staff.role)
          )
        );
      }
    );
  }


  function findInvalidInspectionTypes() {
    return getAll().filter(
      inspection =>
        !VALID_INSPECTION_TYPES.has(
          normalize(
            inspection.inspection_type
          )
        )
    );
  }


  function findInvalidStatuses() {
    return getAll().filter(
      inspection =>
        !VALID_STATUSES.has(
          normalize(
            inspection.status
          )
        )
    );
  }


  function findInvalidScores() {
    return getAll().filter(
      inspection => {
        const fields = [
          inspection.cleanliness_score,
          inspection.maintenance_score
        ];

        return fields.some(value => {
          if (isBlank(value)) {
            return false;
          }

          const number =
            Number(value);

          return (
            !Number.isFinite(number) ||
            number < 0 ||
            number > 100
          );
        });
      }
    );
  }


  function findInvalidOverallResults() {
    return getAll().filter(
      inspection => {
        if (
          isBlank(
            inspection.overall_result
          )
        ) {
          return false;
        }

        return !VALID_RESULTS.has(
          normalize(
            inspection.overall_result
          )
        );
      }
    );
  }


  function findIncompleteWithResult() {
    return getAll().filter(
      inspection =>
        normalize(
          inspection.status
        ) !== STATUS.COMPLETED &&
        !isBlank(
          inspection.overall_result
        )
    );
  }


  function findInProgressWithoutInspector() {
    return getAll().filter(
      inspection =>
        normalize(
          inspection.status
        ) === STATUS.IN_PROGRESS &&
        isBlank(
          inspection.inspector_id
        )
    );
  }


  function findCompletedWithoutInspector() {
    return getAll().filter(
      inspection =>
        normalize(
          inspection.status
        ) === STATUS.COMPLETED &&
        isBlank(
          inspection.inspector_id
        )
    );
  }


  function findCompletedWithoutResult() {
    return getAll().filter(
      inspection =>
        normalize(
          inspection.status
        ) === STATUS.COMPLETED &&
        isBlank(
          inspection.overall_result
        )
    );
  }


  function findCompletedWithIncompleteChecklist() {
    const incompleteByInspection =
      new Set();

    getAllChecklistItems()
      .filter(
        item => isBlank(item.result)
      )
      .forEach(item => {
        incompleteByInspection.add(
          normalizeText(
            item.inspection_id
          )
        );
      });

    return getAll().filter(
      inspection =>
        normalize(
          inspection.status
        ) === STATUS.COMPLETED &&
        incompleteByInspection.has(
          normalizeText(
            inspection.inspection_id
          )
        )
    );
  }


  // ==========================================================================
  // INTEGRITY - CHECKLIST
  // ==========================================================================

  function findOrphanChecklistInspectionLinks() {
    return getAllChecklistItems().filter(
      item => {
        if (
          isBlank(
            item.inspection_id
          )
        ) {
          return true;
        }

        return !getById(
          item.inspection_id
        );
      }
    );
  }


  function findInvalidChecklistCategories() {
    return getAllChecklistItems().filter(
      item =>
        !VALID_CHECKLIST_CATEGORIES.has(
          normalize(
            item.category
          )
        )
    );
  }


  function findInvalidChecklistResults() {
    return getAllChecklistItems().filter(
      item => {
        if (isBlank(item.result)) {
          return false;
        }

        return !VALID_CHECKLIST_RESULTS.has(
          normalize(
            item.result
          )
        );
      }
    );
  }


  function findChecklistItemsWithoutDescription() {
    return getAllChecklistItems().filter(
      item => isBlank(item.item)
    );
  }


  function findDuplicateChecklistItems() {
    const seen = new Map();
    const duplicates = [];

    getAllChecklistItems().forEach(
      item => {
        const key = [
          normalizeText(
            item.inspection_id
          ),
          normalize(
            item.category
          ),
          normalizeText(
            item.item
          ).toLowerCase()
        ].join('|');

        if (seen.has(key)) {
          duplicates.push(item);
        } else {
          seen.set(
            key,
            item.checklist_item_id
          );
        }
      }
    );

    return duplicates;
  }


  // ==========================================================================
  // INSPECTION SUMMARY
  // ==========================================================================

  function getInspectionSummary(
    inspectionId
  ) {
    const inspection =
      requireInspection(inspectionId);

    const checklist =
      getChecklist(inspectionId);

    const passed =
      checklist.filter(
        item =>
          normalize(item.result) ===
          CHECKLIST_RESULT.PASS
      );

    const failed =
      checklist.filter(
        item =>
          normalize(item.result) ===
          CHECKLIST_RESULT.FAIL
      );

    const incomplete =
      checklist.filter(
        item =>
          isBlank(item.result)
      );

    return {
      inspection:
        inspection,

      checklist_count:
        checklist.length,

      passed_count:
        passed.length,

      failed_count:
        failed.length,

      incomplete_count:
        incomplete.length,

      failure_categories:
        getFailureCategories(
          inspectionId
        ),

      has_cleaning_failure:
        hasCleaningFailure(
          inspectionId
        ),

      has_maintenance_failure:
        hasMaintenanceFailure(
          inspectionId
        )
    };
  }


  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  return {

    // Constants
    INSPECTION_TYPE,
    STATUS,
    RESULT,
    CHECKLIST_CATEGORY,
    CHECKLIST_RESULT,

    // Inspection CRUD
    createInspection,
    updateInspection,
    getAll,
    getById,
    exists,
    requireInspection,

    // Inspection queries
    getByUnit,
    getByReservation,
    getByInspector,
    getByStatus,
    getByType,
    getPendingInspections,
    getInProgressInspections,
    getCompletedInspections,

    // Lifecycle
    changeStatus,
    startInspection,
    completeInspection,
    cancelInspection,
    getAllowedTransitions,
    assertTransition,

    // Checklist
    getAllChecklistItems,
    getChecklist,
    getChecklistItem,
    requireChecklistItem,
    getChecklistByCategory,
    getFailedChecklistItems,
    getIncompleteChecklistItems,
    addChecklistItem,
    updateChecklistItem,
    setChecklistResult,
    removeChecklistItem,

    // Result helpers
    hasChecklistFailures,
    getFailureCategories,
    hasMaintenanceFailure,
    hasCleaningFailure,
    getInspectionSummary,

    // Validation
    validateInspectionType,
    validateStatus,
    validateOverallResult,
    validateChecklistCategory,
    validateChecklistResult,

    // Inspection integrity
    findOrphanUnitLinks,
    findOrphanReservationLinks,
    findReservationUnitMismatches,
    findOrphanInspectorLinks,
    findInvalidInspectorAssignments,
    findInvalidInspectionTypes,
    findInvalidStatuses,
    findInvalidScores,
    findInvalidOverallResults,
    findIncompleteWithResult,
    findInProgressWithoutInspector,
    findCompletedWithoutInspector,
    findCompletedWithoutResult,
    findCompletedWithIncompleteChecklist,

    // Checklist integrity
    findOrphanChecklistInspectionLinks,
    findInvalidChecklistCategories,
    findInvalidChecklistResults,
    findChecklistItemsWithoutDescription,
    findDuplicateChecklistItems
  };

})();