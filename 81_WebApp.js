/**
 * ============================================================================
 * 81_WebApp.gs
 * RENTAL OPERATIONS MVP
 * PERFORMANCE PATCH 4A - WEB APP BOUNDARY DIAGNOSTICS
 * ============================================================================
 *
 * Temporary diagnostic build.
 *
 * Purpose:
 * - preserve the existing browser -> WebApiService contract
 * - measure server-side WebApiService.call() duration
 * - verify the returned envelope exists
 * - verify JSON serialization before google.script.run returns it
 * - log payload type and approximate serialized size
 *
 * No business logic or repository access is added.
 * ============================================================================
 */

function doGet(e) {

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP.NAME)
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );

}


/**
 * Single browser-callable API bridge.
 *
 * IMPORTANT:
 * The original return value is returned unchanged.
 * Diagnostics are console-only.
 */
function apiCall(action, params) {

  const startedAt =
    Date.now();

  let response;


  try {

    response =
      WebApiService.call(
        action,
        params || {}
      );

  } catch (err) {

    console.error(
      '[API_BOUNDARY]' +
      ' action=' + action +
      ' stage=WebApiService.call' +
      ' status=THREW' +
      ' duration_ms=' + (Date.now() - startedAt) +
      ' message=' +
      (
        err && err.message
          ? err.message
          : String(err)
      )
    );

    throw err;

  }


  const serviceDurationMs =
    Date.now() - startedAt;

  const responseType =
    response === null
      ? 'null'
      : Array.isArray(response)
        ? 'array'
        : typeof response;


  if (response === undefined) {

    console.error(
      '[API_BOUNDARY]' +
      ' action=' + action +
      ' stage=after_WebApiService.call' +
      ' status=UNDEFINED' +
      ' service_ms=' + serviceDurationMs
    );

    return response;

  }


  let serialized;
  let serializationMs = 0;


  try {

    const serializationStartedAt =
      Date.now();

    serialized =
      JSON.stringify(response);

    serializationMs =
      Date.now() -
      serializationStartedAt;

  } catch (err) {

    console.error(
      '[API_BOUNDARY]' +
      ' action=' + action +
      ' stage=JSON.stringify' +
      ' status=FAILED' +
      ' service_ms=' + serviceDurationMs +
      ' response_type=' + responseType +
      ' message=' +
      (
        err && err.message
          ? err.message
          : String(err)
      )
    );

    /*
     * Preserve original behavior so this diagnostic patch does not
     * silently change the API contract.
     */
    return response;

  }


  const serializedType =
    typeof serialized;

  const payloadChars =
    serializedType === 'string'
      ? serialized.length
      : -1;

  const envelopeSuccess =
    response &&
    typeof response === 'object'
      ? response.success
      : undefined;

  const dataType =
    response &&
    typeof response === 'object'
      ? (
          response.data === null
            ? 'null'
            : Array.isArray(response.data)
              ? 'array'
              : typeof response.data
        )
      : 'n/a';


  console.info(
    '[API_BOUNDARY]' +
    ' action=' + action +
    ' status=RETURNING' +
    ' service_ms=' + serviceDurationMs +
    ' serialize_ms=' + serializationMs +
    ' response_type=' + responseType +
    ' envelope_success=' + envelopeSuccess +
    ' data_type=' + dataType +
    ' payload_chars=' + payloadChars
  );


  return response;

}
