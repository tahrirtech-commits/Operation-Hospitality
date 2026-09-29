/**
 * 62_InternetService.gs
 * Phase 5 - Internet Services
 *
 * 26_InternetServices:
 * internet_service_id,property_id,unit_id,provider,account_number,package_name,
 * monthly_fee,installation_fee,billing_cycle,contract_start,contract_end,status
 *
 * Internet is modeled as a subscription/contract master.
 * No automatic InternetService -> OperatingExpense synchronization.
 */
const InternetService = (() => {

  const ENTITY_TYPE = 'INTERNET_SERVICE';
  const SHEET = CONFIG.SHEETS.INTERNET_SERVICES;

  const blank = v =>
    v === null ||
    v === undefined ||
    String(v).trim() === '';

  const text = v =>
    blank(v) ? '' : String(v).trim();

  const upper = v =>
    text(v).toUpperCase();

  const actor = id =>
    !blank(id)
      ? text(id)
      : (
          CONFIG.DEFAULTS &&
          !blank(CONFIG.DEFAULTS.ACTOR_ID)
            ? text(CONFIG.DEFAULTS.ACTOR_ID)
            : 'SYSTEM'
        );

  function number(v, name, min, allowBlank) {

    if (blank(v)) {
      if (allowBlank) return '';
      throw new Error(
        name + ' is required.'
      );
    }

    const n = Number(v);

    if (!Number.isFinite(n)) {
      throw new Error(
        name + ' must be numeric.'
      );
    }

    if (
      min !== undefined &&
      n < min
    ) {
      throw new Error(
        name +
        ' must be >= ' +
        min +
        '.'
      );
    }

    return n;
  }

  function money(v, name, min) {

    return Math.round(
      (
        number(
          v,
          name,
          min
        ) +
        Number.EPSILON
      ) *
      100
    ) / 100;
  }

  /**
   * Canonicalize both Google Sheets Date objects
   * and YYYY-MM-DD strings.
   */
  function date(v, name, allowBlank) {

    if (blank(v)) {

      if (allowBlank) {
        return '';
      }

      throw new Error(
        name + ' is required.'
      );
    }

    if (
      Object.prototype.toString.call(v) ===
        '[object Date]' &&
      !isNaN(v.getTime())
    ) {
      return Utilities.formatDate(
        v,
        CONFIG.TIMEZONE ||
          Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
    }

    const s = text(v);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s)
    ) {
      throw new Error(
        name +
        ' must use YYYY-MM-DD.'
      );
    }

    const p =
      s.split('-').map(Number);

    const d =
      new Date(
        Date.UTC(
          p[0],
          p[1] - 1,
          p[2]
        )
      );

    if (
      d.getUTCFullYear() !== p[0] ||
      d.getUTCMonth() !== p[1] - 1 ||
      d.getUTCDate() !== p[2]
    ) {
      throw new Error(
        name +
        ' is not a valid calendar date.'
      );
    }

    return s;
  }

  function ref(
    category,
    value,
    name,
    allowBlank
  ) {

    if (blank(value)) {

      if (allowBlank) {
        return '';
      }

      throw new Error(
        name + ' is required.'
      );
    }

    const v = upper(value);

    ValidationService.validateReference(
      category,
      v
    );

    return v;
  }

  function requireRow(
    sheet,
    field,
    id,
    label
  ) {

    const row =
      BaseRepository.findById(
        sheet,
        field,
        text(id)
      );

    if (!row) {
      throw new Error(
        label +
        ' not found: ' +
        text(id)
      );
    }

    return row;
  }

  function requireInternetService(id) {

    return requireRow(
      SHEET,
      'internet_service_id',
      id,
      'Internet service'
    );
  }

  function validatePropertyUnit(
    propertyId,
    unitId
  ) {

    const property =
      requireRow(
        CONFIG.SHEETS.PROPERTIES,
        'property_id',
        propertyId,
        'Property'
      );

    const unit =
      requireRow(
        CONFIG.SHEETS.UNITS,
        'unit_id',
        unitId,
        'Unit'
      );

    if (
      text(unit.property_id) !==
      text(property.property_id)
    ) {
      throw new Error(
        'Unit ' +
        unit.unit_id +
        ' does not belong to property ' +
        property.property_id +
        '.'
      );
    }

    return {
      property,
      unit
    };
  }

  function validateInternetService(
    data,
    current
  ) {

    const x =
      Object.assign(
        {},
        current || {},
        data || {}
      );

    validatePropertyUnit(
      x.property_id,
      x.unit_id
    );

    if (blank(x.provider)) {
      throw new Error(
        'provider is required.'
      );
    }

    if (blank(x.account_number)) {
      throw new Error(
        'account_number is required.'
      );
    }

    if (blank(x.package_name)) {
      throw new Error(
        'package_name is required.'
      );
    }

    const monthlyFee =
      money(
        x.monthly_fee,
        'monthly_fee',
        0
      );

    const installationFee =
      money(
        blank(x.installation_fee)
          ? 0
          : x.installation_fee,
        'installation_fee',
        0
      );

    const billingCycle =
      ref(
        'FREQUENCY',
        x.billing_cycle,
        'billing_cycle'
      );

    const contractStart =
      date(
        x.contract_start,
        'contract_start'
      );

    const contractEnd =
      date(
        x.contract_end,
        'contract_end',
        true
      );

    if (
      !blank(contractEnd) &&
      contractEnd < contractStart
    ) {
      throw new Error(
        'contract_end must be on or after contract_start.'
      );
    }

    const status =
      upper(
        x.status ||
        'ACTIVE'
      );

    if (
      ![
        'ACTIVE',
        'INACTIVE'
      ].includes(status)
    ) {
      throw new Error(
        'status must be ACTIVE or INACTIVE.'
      );
    }

    return {
      property_id:
        text(x.property_id),

      unit_id:
        text(x.unit_id),

      provider:
        text(x.provider),

      account_number:
        text(x.account_number),

      package_name:
        text(x.package_name),

      monthly_fee:
        monthlyFee,

      installation_fee:
        installationFee,

      billing_cycle:
        billingCycle,

      contract_start:
        contractStart,

      contract_end:
        contractEnd,

      status:
        status
    };
  }

  /**
   * Natural uniqueness:
   * provider + account_number.
   *
   * Provider is included because account-number namespaces
   * may differ between providers.
   */
  function assertUniqueAccount(
    x,
    excludeId
  ) {

    const duplicate =
      BaseRepository
        .findAll(SHEET)
        .find(
          row =>
            text(
              row.internet_service_id
            ) !==
              text(excludeId) &&
            upper(
              row.provider
            ) ===
              upper(x.provider) &&
            text(
              row.account_number
            ) ===
              x.account_number
        );

    if (duplicate) {
      throw new Error(
        'Duplicate internet provider/account: ' +
        duplicate.internet_service_id
      );
    }
  }

  function createInternetService(
    data,
    actorId
  ) {

    const x =
      validateInternetService(
        data
      );

    assertUniqueAccount(
      x,
      ''
    );

    const id =
      IdService.nextId(
        ENTITY_TYPE
      );

    const saved =
      BaseRepository.insert(
        SHEET,
        Object.assign(
          {
            internet_service_id:
              id
          },
          x
        )
      );

    AuditService.logCreate(
      ENTITY_TYPE,
      id,
      saved,
      actor(actorId)
    );

    return saved;
  }

  function updateInternetService(
    id,
    changes,
    actorId
  ) {

    const old =
      requireInternetService(
        id
      );

    const patch =
      Object.assign(
        {},
        changes || {}
      );

    if (
      'internet_service_id' in
        patch &&
      text(
        patch.internet_service_id
      ) !==
        text(id)
    ) {
      throw new Error(
        'internet_service_id is immutable.'
      );
    }

    delete patch.internet_service_id;

    const x =
      validateInternetService(
        patch,
        old
      );

    assertUniqueAccount(
      x,
      id
    );

    const saved =
      BaseRepository.update(
        SHEET,
        'internet_service_id',
        id,
        x
      );

    AuditService.logUpdate(
      ENTITY_TYPE,
      id,
      old,
      saved,
      actor(actorId)
    );

    return saved;
  }

  function changeStatus(
    id,
    status,
    actorId
  ) {

    return updateInternetService(
      id,
      {
        status:
          upper(status)
      },
      actorId
    );
  }

  const activate =
    (id, actorId) =>
      changeStatus(
        id,
        'ACTIVE',
        actorId
      );

  const deactivate =
    (id, actorId) =>
      changeStatus(
        id,
        'INACTIVE',
        actorId
      );

  const getAll =
    () =>
      BaseRepository.findAll(
        SHEET
      );

  const getById =
    id =>
      BaseRepository.findById(
        SHEET,
        'internet_service_id',
        text(id)
      );

  const exists =
    id =>
      !!getById(id);

  const getByProperty =
    id =>
      BaseRepository.findByField(
        SHEET,
        'property_id',
        text(id)
      );

  const getByUnit =
    id =>
      BaseRepository.findByField(
        SHEET,
        'unit_id',
        text(id)
      );

  const getByProvider =
    provider =>
      getAll().filter(
        row =>
          upper(
            row.provider
          ) ===
          upper(provider)
      );

  const getByBillingCycle =
    cycle =>
      getAll().filter(
        row =>
          upper(
            row.billing_cycle
          ) ===
          upper(cycle)
      );

  const getActive =
    () =>
      getAll().filter(
        row =>
          upper(
            row.status
          ) ===
          'ACTIVE'
      );

  const getInactive =
    () =>
      getAll().filter(
        row =>
          upper(
            row.status
          ) ===
          'INACTIVE'
      );

  function getByContractStartRange(
    startDate,
    endDate
  ) {

    const s =
      date(
        startDate,
        'start_date'
      );

    const e =
      date(
        endDate,
        'end_date'
      );

    if (s > e) {
      throw new Error(
        'start_date must be on or before end_date.'
      );
    }

    return getAll().filter(
      row => {
        const d =
          date(
            row.contract_start,
            'contract_start'
          );

        return (
          d >= s &&
          d <= e
        );
      }
    );
  }

  function getContractsEndingBetween(
    startDate,
    endDate
  ) {

    const s =
      date(
        startDate,
        'start_date'
      );

    const e =
      date(
        endDate,
        'end_date'
      );

    if (s > e) {
      throw new Error(
        'start_date must be on or before end_date.'
      );
    }

    return getAll().filter(
      row => {

        if (
          blank(
            row.contract_end
          )
        ) {
          return false;
        }

        const d =
          date(
            row.contract_end,
            'contract_end'
          );

        return (
          d >= s &&
          d <= e
        );
      }
    );
  }

  function getExpiredContracts(
    asOfDate
  ) {

    const d =
      date(
        blank(asOfDate)
          ? Utilities.formatDate(
              new Date(),
              CONFIG.TIMEZONE ||
                Session.getScriptTimeZone(),
              'yyyy-MM-dd'
            )
          : asOfDate,
        'as_of_date'
      );

    return getAll().filter(
      row => {

        if (
          blank(
            row.contract_end
          )
        ) {
          return false;
        }

        return (
          date(
            row.contract_end,
            'contract_end'
          ) <
          d
        );
      }
    );
  }

  function getContractsExpiringWithin(
    daysAhead,
    asOfDate
  ) {

    const days =
      number(
        blank(daysAhead)
          ? 30
          : daysAhead,
        'days_ahead',
        0
      );

    const start =
      date(
        blank(asOfDate)
          ? Utilities.formatDate(
              new Date(),
              CONFIG.TIMEZONE ||
                Session.getScriptTimeZone(),
              'yyyy-MM-dd'
            )
          : asOfDate,
        'as_of_date'
      );

    const p =
      start
        .split('-')
        .map(Number);

    const d =
      new Date(
        Date.UTC(
          p[0],
          p[1] - 1,
          p[2]
        )
      );

    d.setUTCDate(
      d.getUTCDate() +
      days
    );

    const end =
      Utilities.formatDate(
        d,
        'UTC',
        'yyyy-MM-dd'
      );

    return getContractsEndingBetween(
      start,
      end
    );
  }

  function summarizeFees(rows) {

    const source =
      rows || [];

    let monthly = 0;
    let installation = 0;

    source.forEach(
      row => {
        monthly +=
          Number(
            row.monthly_fee ||
            0
          );

        installation +=
          Number(
            row.installation_fee ||
            0
          );
      }
    );

    return {
      monthly_fee_total:
        Math.round(
          (
            monthly +
            Number.EPSILON
          ) *
          100
        ) / 100,

      installation_fee_total:
        Math.round(
          (
            installation +
            Number.EPSILON
          ) *
          100
        ) / 100,

      service_count:
        source.length
    };
  }

  function getFeeSummaryByProperty(
    propertyId,
    activeOnly
  ) {

    let rows =
      getByProperty(
        propertyId
      );

    if (activeOnly === true) {
      rows =
        rows.filter(
          row =>
            upper(
              row.status
            ) ===
            'ACTIVE'
        );
    }

    return summarizeFees(
      rows
    );
  }

  function getFeeSummaryByUnit(
    unitId,
    activeOnly
  ) {

    let rows =
      getByUnit(
        unitId
      );

    if (activeOnly === true) {
      rows =
        rows.filter(
          row =>
            upper(
              row.status
            ) ===
            'ACTIVE'
        );
    }

    return summarizeFees(
      rows
    );
  }

  function getFeeSummaryByProvider(
    provider,
    activeOnly
  ) {

    let rows =
      getByProvider(
        provider
      );

    if (activeOnly === true) {
      rows =
        rows.filter(
          row =>
            upper(
              row.status
            ) ===
            'ACTIVE'
        );
    }

    return summarizeFees(
      rows
    );
  }

  function getMonthlyRecurringFee(
    rows
  ) {

    const source =
      rows ||
      getActive();

    let total = 0;

    source.forEach(
      row => {

        const fee =
          Number(
            row.monthly_fee ||
            0
          );

        const cycle =
          upper(
            row.billing_cycle
          );

        if (
          cycle ===
          'MONTHLY'
        ) {
          total += fee;
          return;
        }

        if (
          cycle ===
          'QUARTERLY'
        ) {
          total +=
            fee / 3;
          return;
        }

        if (
          cycle ===
          'ANNUAL'
        ) {
          total +=
            fee / 12;
          return;
        }

        // Unknown/unsupported frequency is not silently converted.
        throw new Error(
          'Cannot normalize billing_cycle "' +
          cycle +
          '" for internet service ' +
          row.internet_service_id +
          '.'
        );
      }
    );

    return {
      monthly_recurring_fee:
        Math.round(
          (
            total +
            Number.EPSILON
          ) *
          100
        ) / 100,

      service_count:
        source.length
    };
  }

  // -------------------------------------------------------------------------
  // Integrity helpers
  // -------------------------------------------------------------------------

  function duplicates(
    rows,
    keyFn
  ) {

    const seen = {};
    const out = [];

    rows.forEach(
      row => {
        const key =
          keyFn(row);

        if (seen[key]) {
          out.push(row);
        } else {
          seen[key] = true;
        }
      }
    );

    return out;
  }

  const findOrphanPropertyLinks =
    () =>
      getAll().filter(
        row =>
          !BaseRepository.findById(
            CONFIG.SHEETS.PROPERTIES,
            'property_id',
            text(
              row.property_id
            )
          )
      );

  const findOrphanUnitLinks =
    () =>
      getAll().filter(
        row =>
          !BaseRepository.findById(
            CONFIG.SHEETS.UNITS,
            'unit_id',
            text(
              row.unit_id
            )
          )
      );

  const findPropertyUnitMismatches =
    () =>
      getAll().filter(
        row => {

          const unit =
            BaseRepository.findById(
              CONFIG.SHEETS.UNITS,
              'unit_id',
              text(
                row.unit_id
              )
            );

          return (
            unit &&
            text(
              unit.property_id
            ) !==
            text(
              row.property_id
            )
          );
        }
      );

  const findMissingProviders =
    () =>
      getAll().filter(
        row =>
          blank(
            row.provider
          )
      );

  const findMissingAccountNumbers =
    () =>
      getAll().filter(
        row =>
          blank(
            row.account_number
          )
      );

  const findMissingPackageNames =
    () =>
      getAll().filter(
        row =>
          blank(
            row.package_name
          )
      );

  const findInvalidFees =
    () =>
      getAll().filter(
        row => {

          const monthly =
            Number(
              row.monthly_fee
            );

          const installation =
            Number(
              row.installation_fee
            );

          return (
            !Number.isFinite(
              monthly
            ) ||
            !Number.isFinite(
              installation
            ) ||
            monthly < 0 ||
            installation < 0
          );
        }
      );

  const findInvalidBillingCycles =
    () =>
      getAll().filter(
        row => {
          try {
            ref(
              'FREQUENCY',
              row.billing_cycle,
              'billing_cycle'
            );
            return false;
          } catch (error) {
            return true;
          }
        }
      );

  const findInvalidStatuses =
    () =>
      getAll().filter(
        row =>
          ![
            'ACTIVE',
            'INACTIVE'
          ].includes(
            upper(
              row.status
            )
          )
      );

  function findInvalidContractDates() {

    return getAll().filter(
      row => {
        try {

          const start =
            date(
              row.contract_start,
              'contract_start'
            );

          const end =
            date(
              row.contract_end,
              'contract_end',
              true
            );

          return (
            !blank(end) &&
            end < start
          );

        } catch (error) {
          return true;
        }
      }
    );
  }

  const findDuplicateIds =
    () =>
      duplicates(
        getAll(),
        row =>
          text(
            row.internet_service_id
          )
      );

  const findDuplicateProviderAccounts =
    () =>
      duplicates(
        getAll(),
        row =>
          [
            upper(
              row.provider
            ),
            text(
              row.account_number
            )
          ].join('|')
      );

  function findActiveExpiredContracts(
    asOfDate
  ) {

    const expired =
      getExpiredContracts(
        asOfDate
      );

    return expired.filter(
      row =>
        upper(
          row.status
        ) ===
        'ACTIVE'
    );
  }

  return {

    ENTITY_TYPE,

    createInternetService,
    updateInternetService,
    changeStatus,
    activate,
    deactivate,

    getAll,
    getById,
    requireInternetService,
    exists,
    getByProperty,
    getByUnit,
    getByProvider,
    getByBillingCycle,
    getActive,
    getInactive,

    getByContractStartRange,
    getContractsEndingBetween,
    getExpiredContracts,
    getContractsExpiringWithin,

    summarizeFees,
    getFeeSummaryByProperty,
    getFeeSummaryByUnit,
    getFeeSummaryByProvider,
    getMonthlyRecurringFee,

    findOrphanPropertyLinks,
    findOrphanUnitLinks,
    findPropertyUnitMismatches,
    findMissingProviders,
    findMissingAccountNumbers,
    findMissingPackageNames,
    findInvalidFees,
    findInvalidBillingCycles,
    findInvalidStatuses,
    findInvalidContractDates,
    findDuplicateIds,
    findDuplicateProviderAccounts,
    findActiveExpiredContracts

  };

})();
