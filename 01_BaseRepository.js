/**
 * ============================================================
 * 01_BaseRepository.gs
 * RENTAL OPERATIONS MVP
 * ============================================================
 *
 * Generic Google Sheets data-access layer.
 *
 * Responsibilities:
 *
 * - Access spreadsheet / sheets
 * - Read headers
 * - Convert rows <-> objects
 * - Read records
 * - Search records
 * - Check existence
 * - Insert records
 * - Update records
 * - Locate physical sheet rows
 *
 * IMPORTANT:
 *
 * - Row 1 must contain headers.
 * - Data starts from row 2.
 * - Services must use stable IDs, never row numbers as IDs.
 * - Business validation belongs in ValidationService /
 *   domain services, not here.
 *
 * ============================================================
 */

const BaseRepository = (() => {


  /**
   * ----------------------------------------------------------
   * GET ACTIVE SPREADSHEET
   * ----------------------------------------------------------
   *
   * The Apps Script project must remain bound to the
   * Rental Operations Google Sheet.
   */

  function getSpreadsheet() {

    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {

      throw new Error(
        'No active spreadsheet found. ' +
        'This Apps Script project must be bound to the ' +
        'Rental Operations Google Sheet.'
      );

    }

    return spreadsheet;

  }


  /**
   * ----------------------------------------------------------
   * GET SHEET
   * ----------------------------------------------------------
   */

  function getSheet(sheetName) {

    if (!sheetName) {

      throw new Error(
        'sheetName is required.'
      );

    }

    const sheet =
      getSpreadsheet()
        .getSheetByName(
          sheetName
        );

    if (!sheet) {

      throw new Error(
        'Sheet not found: ' +
        sheetName
      );

    }

    return sheet;

  }


  /**
   * ----------------------------------------------------------
   * GET HEADERS
   * ----------------------------------------------------------
   *
   * Returns row 1 as normalized header names.
   */

  function getHeaders(sheetName) {

    const sheet =
      getSheet(
        sheetName
      );

    const lastColumn =
      sheet.getLastColumn();

    if (lastColumn < 1) {

      throw new Error(
        'No columns found in sheet: ' +
        sheetName
      );

    }

    const headers =
      sheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getValues()[0]
        .map(
          value =>
            String(value).trim()
        );


    headers.forEach(
      (header, index) => {

        if (!header) {

          throw new Error(
            'Empty header found in ' +
            sheetName +
            ' at column ' +
            (index + 1)
          );

        }

      }
    );


    return headers;

  }


  /**
   * ----------------------------------------------------------
   * ROW -> OBJECT
   * ----------------------------------------------------------
   */

  function rowToObject(
    headers,
    row
  ) {

    const result = {};

    headers.forEach(
      (header, index) => {

        result[header] =
          row[index];

      }
    );

    return result;

  }


  /**
   * ----------------------------------------------------------
   * OBJECT -> ROW
   * ----------------------------------------------------------
   *
   * Only fields that exist as sheet headers are written.
   *
   * Extra object properties are intentionally ignored.
   */

  function objectToRow(
    headers,
    object
  ) {

    return headers.map(
      header => {

        if (
          Object.prototype
            .hasOwnProperty
            .call(
              object,
              header
            )
        ) {

          return (
            object[header] === undefined
              ? ''
              : object[header]
          );

        }

        return '';

      }
    );

  }


  /**
   * ----------------------------------------------------------
   * EMPTY ROW CHECK
   * ----------------------------------------------------------
   */

  function isEmptyRow(row) {

    return row.every(
      value =>
        value === '' ||
        value === null ||
        value === undefined
    );

  }


  /**
   * ----------------------------------------------------------
   * VALUE COMPARISON
   * ----------------------------------------------------------
   *
   * Converts values to trimmed strings so IDs and codes
   * behave consistently when read from Google Sheets.
   */

  function valuesEqual(
    a,
    b
  ) {

    if (
      a === null ||
      a === undefined
    ) {

      return (
        b === null ||
        b === undefined ||
        b === ''
      );

    }


    if (
      b === null ||
      b === undefined
    ) {

      return (
        a === ''
      );

    }


    return (
      String(a).trim() ===
      String(b).trim()
    );

  }


  /**
   * ----------------------------------------------------------
   * FIND ALL
   * ----------------------------------------------------------
   */

  function findAll(sheetName) {

    const sheet =
      getSheet(
        sheetName
      );

    const headers =
      getHeaders(
        sheetName
      );

    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {

      return [];

    }


    const values =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          headers.length
        )
        .getValues();


    return values
      .filter(
        row =>
          !isEmptyRow(row)
      )
      .map(
        row =>
          rowToObject(
            headers,
            row
          )
      );

  }


  /**
   * ----------------------------------------------------------
   * FIND ONE BY FIELD
   * ----------------------------------------------------------
   *
   * Returns:
   *
   * object -> record found
   * null   -> record not found
   */

  function findOneByField(
    sheetName,
    fieldName,
    value
  ) {

    if (!fieldName) {

      throw new Error(
        'fieldName is required.'
      );

    }


    const headers =
      getHeaders(
        sheetName
      );

    if (
      headers.indexOf(
        fieldName
      ) === -1
    ) {

      throw new Error(
        'Column "' +
        fieldName +
        '" not found in ' +
        sheetName
      );

    }


    const records =
      findAll(
        sheetName
      );


    for (
      let i = 0;
      i < records.length;
      i++
    ) {

      if (
        valuesEqual(
          records[i][fieldName],
          value
        )
      ) {

        return records[i];

      }

    }


    return null;

  }


  /**
   * ----------------------------------------------------------
   * FIND MANY BY FIELD
   * ----------------------------------------------------------
   */

  function findByField(
    sheetName,
    fieldName,
    value
  ) {

    if (!fieldName) {

      throw new Error(
        'fieldName is required.'
      );

    }


    const headers =
      getHeaders(
        sheetName
      );

    if (
      headers.indexOf(
        fieldName
      ) === -1
    ) {

      throw new Error(
        'Column "' +
        fieldName +
        '" not found in ' +
        sheetName
      );

    }


    return findAll(
      sheetName
    ).filter(
      record =>
        valuesEqual(
          record[fieldName],
          value
        )
    );

  }


  /**
   * ----------------------------------------------------------
   * FIND BY ID
   * ----------------------------------------------------------
   */

  function findById(
    sheetName,
    idColumn,
    id
  ) {

    if (
      id === undefined ||
      id === null ||
      String(id).trim() === ''
    ) {

      throw new Error(
        'ID is required.'
      );

    }


    return findOneByField(
      sheetName,
      idColumn,
      id
    );

  }


  /**
   * ----------------------------------------------------------
   * EXISTS
   * ----------------------------------------------------------
   */

  function exists(
    sheetName,
    fieldName,
    value
  ) {

    return (
      findOneByField(
        sheetName,
        fieldName,
        value
      ) !== null
    );

  }


  /**
   * ----------------------------------------------------------
   * INSERT
   * ----------------------------------------------------------
   *
   * Only properties matching sheet headers are persisted.
   */

  function insert(
    sheetName,
    record
  ) {

    if (
      !record ||
      typeof record !== 'object'
    ) {

      throw new Error(
        'record must be an object.'
      );

    }


    const sheet =
      getSheet(
        sheetName
      );

    const headers =
      getHeaders(
        sheetName
      );

    const row =
      objectToRow(
        headers,
        record
      );


    sheet.appendRow(
      row
    );


    /*
     * Return the stored representation rather than blindly
     * returning fields that may not exist in the sheet.
     */

    return rowToObject(
      headers,
      row
    );

  }


  /**
   * ----------------------------------------------------------
   * UPDATE
   * ----------------------------------------------------------
   *
   * Finds the record using its stable ID.
   *
   * The ID column itself cannot be changed by the supplied
   * changes object.
   */

  function update(
    sheetName,
    idColumn,
    id,
    changes
  ) {

    if (
      !changes ||
      typeof changes !== 'object'
    ) {

      throw new Error(
        'changes must be an object.'
      );

    }


    const sheet =
      getSheet(
        sheetName
      );

    const headers =
      getHeaders(
        sheetName
      );

    const idIndex =
      headers.indexOf(
        idColumn
      );


    if (idIndex === -1) {

      throw new Error(
        'Column "' +
        idColumn +
        '" not found in ' +
        sheetName
      );

    }


    const lastRow =
      sheet.getLastRow();


    if (lastRow <= 1) {

      throw new Error(
        'Record not found: ' +
        id
      );

    }


    const values =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          headers.length
        )
        .getValues();


    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      if (
        valuesEqual(
          values[i][idIndex],
          id
        )
      ) {

        const existing =
          rowToObject(
            headers,
            values[i]
          );


        const updated =
          Object.assign(
            {},
            existing,
            changes
          );


        /*
         * Protect stable ID.
         */

        updated[idColumn] =
          existing[idColumn];


        const updatedRow =
          objectToRow(
            headers,
            updated
          );


        sheet
          .getRange(
            i + 2,
            1,
            1,
            headers.length
          )
          .setValues([
            updatedRow
          ]);


        return rowToObject(
          headers,
          updatedRow
        );

      }

    }


    throw new Error(
      'Record not found: ' +
      id
    );

  }


  /**
   * ----------------------------------------------------------
   * FIND PHYSICAL ROW NUMBER BY ID
   * ----------------------------------------------------------
   *
   * Used only when a service genuinely needs the physical
   * Google Sheet row.
   *
   * Returns:
   *
   * >= 2  -> row found
   * -1    -> not found
   *
   * IMPORTANT:
   *
   * The row number is NOT an entity ID.
   */

  function findRowNumberById(
    sheetName,
    idColumn,
    id
  ) {

    const sheet =
      getSheet(
        sheetName
      );

    const headers =
      getHeaders(
        sheetName
      );

    const index =
      headers.indexOf(
        idColumn
      );


    if (index === -1) {

      throw new Error(
        'Column "' +
        idColumn +
        '" not found in ' +
        sheetName
      );

    }


    const lastRow =
      sheet.getLastRow();


    if (lastRow <= 1) {

      return -1;

    }


    const values =
      sheet
        .getRange(
          2,
          index + 1,
          lastRow - 1,
          1
        )
        .getValues();


    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      if (
        valuesEqual(
          values[i][0],
          id
        )
      ) {

        return i + 2;

      }

    }


    return -1;

  }


  /**
   * ----------------------------------------------------------
   * COUNT
   * ----------------------------------------------------------
   */

  function count(sheetName) {

    return findAll(
      sheetName
    ).length;

  }


  /**
   * ----------------------------------------------------------
   * GET SHEET INFORMATION
   * ----------------------------------------------------------
   *
   * Useful for diagnostics and IntegrityCheckService.
   */

  function getSheetInfo(sheetName) {

    const sheet =
      getSheet(
        sheetName
      );

    const headers =
      getHeaders(
        sheetName
      );


    return {

      sheet_name:
        sheetName,

      row_count:
        Math.max(
          sheet.getLastRow() - 1,
          0
        ),

      column_count:
        headers.length,

      headers:
        headers

    };

  }


  /**
   * ----------------------------------------------------------
   * PUBLIC API
   * ----------------------------------------------------------
   */

  return {

    getSpreadsheet,

    getSheet,

    getHeaders,

    findAll,

    findById,

    findOneByField,

    findByField,

    exists,

    insert,

    update,

    findRowNumberById,

    count,

    getSheetInfo

  };

})();