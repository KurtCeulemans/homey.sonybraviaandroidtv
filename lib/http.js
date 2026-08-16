'use strict';

const http = require('http');
const https = require('https');

/**
 * Retry policy (interactive Sony API calls only):
 * - Retryable: HTTP 404, HTTP 503, connection refused/reset/timeout, request timeout, offline.
 * - Not retryable: HTTP 400/401/403, invalid config, authentication/PSK, JSON-RPC API errors, parse errors.
 * - IRCC, relative volume (+1/-1) and polling must call request() with retry: false.
 * - Retry interval: 1s, window: 20s, per-attempt timeout: 5s (hard abort).
 */

const API_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 1000;
const RETRY_WINDOW_MS = 20000;

const ERROR_STATUS = {
  INVALID_CONFIG: 'invalid_config',
  AUTHENTICATION: 'authentication',
  HTTP_404: 'http_404',
  HTTP_503: 'http_503',
  CONNECTION_REFUSED: 'connection_refused',
  CONNECTION_TIMEOUT: 'connection_timeout',
  CONNECTION_RESET: 'connection_reset',
  REQUEST_TIMEOUT: 'request_timeout',
  API_ERROR: 'api_error',
  PARSE_ERROR: 'parse_error',
  OFFLINE: 'offline',
};

const DEFAULT_RETRYABLE = new Set([
  ERROR_STATUS.HTTP_404,
  ERROR_STATUS.HTTP_503,
  ERROR_STATUS.CONNECTION_REFUSED,
  ERROR_STATUS.CONNECTION_TIMEOUT,
  ERROR_STATUS.CONNECTION_RESET,
  ERROR_STATUS.REQUEST_TIMEOUT,
  ERROR_STATUS.OFFLINE,
]);

class SonyRequestError extends Error {

  /**
   * @param {string} message
   * @param {string} status
   * @param {{ retryable?: boolean, httpStatus?: number }} [options]
   */
  constructor(message, status, options = {}) {
    super(message);
    this.name = 'SonyRequestError';
    this.status = status;
    this.retryable = Boolean(options.retryable);
    this.httpStatus = options.httpStatus;
  }

}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isJsonContentType(contentType) {
  return typeof contentType === 'string'
    && contentType.toLowerCase().includes('application/json');
}

function classifyHttpStatus(statusCode) {
  if (statusCode === 401 || statusCode === 403) {
    return {
      status: ERROR_STATUS.AUTHENTICATION,
      retryable: false,
      message: 'Authentication/PSK error.',
    };
  }
  if (statusCode === 404) {
    return {
      status: ERROR_STATUS.HTTP_404,
      retryable: true,
      message: 'Sony API returned HTTP 404.',
    };
  }
  if (statusCode === 503) {
    return {
      status: ERROR_STATUS.HTTP_503,
      retryable: true,
      message: 'Sony API returned HTTP 503.',
    };
  }
  return {
    status: ERROR_STATUS.API_ERROR,
    retryable: false,
    message: `Sony API returned HTTP ${statusCode}.`,
  };
}

function classifyNetworkError(error) {
  if (error instanceof SonyRequestError) {
    return error;
  }

  const code = error && error.code;
  const message = error && error.message ? String(error.message) : 'TV is not reachable.';

  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return new SonyRequestError(
      `Request timed out after ${API_TIMEOUT_MS / 1000} seconds.`,
      ERROR_STATUS.REQUEST_TIMEOUT,
      { retryable: true }
    );
  }

  if (code === 'ECONNREFUSED') {
    return new SonyRequestError(
      'Connection refused.',
      ERROR_STATUS.CONNECTION_REFUSED,
      { retryable: true }
    );
  }

  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return new SonyRequestError(
      'Connection reset.',
      ERROR_STATUS.CONNECTION_RESET,
      { retryable: true }
    );
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new SonyRequestError(
      'TV host could not be resolved.',
      ERROR_STATUS.INVALID_CONFIG,
      { retryable: false }
    );
  }

  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new SonyRequestError(
      'TV is not reachable.',
      ERROR_STATUS.OFFLINE,
      { retryable: true }
    );
  }

  return new SonyRequestError(
    message,
    ERROR_STATUS.OFFLINE,
    { retryable: true }
  );
}

function classifySonyRpcError(data) {
  if (!data || !Array.isArray(data.error) || data.error.length === 0) {
    return null;
  }

  const code = data.error[0];
  const details = data.error
    .filter((part) => part !== undefined && part !== null && part !== '')
    .join(': ');

  if (code === 401 || code === 403 || /psk|auth|denied|forbidden/i.test(String(details))) {
    return new SonyRequestError(
      details ? `Authentication/PSK error (${details})` : 'Authentication/PSK error.',
      ERROR_STATUS.AUTHENTICATION,
      { retryable: false }
    );
  }

  return new SonyRequestError(
    details ? `Sony API error (${details})` : 'Sony API error.',
    ERROR_STATUS.API_ERROR,
    { retryable: false }
  );
}

function isRetryableError(error, retryableStatuses) {
  if (!error || !error.retryable) {
    return false;
  }
  if (Array.isArray(retryableStatuses) && retryableStatuses.length > 0) {
    return retryableStatuses.includes(error.status);
  }
  return DEFAULT_RETRYABLE.has(error.status);
}

/**
 * One HTTP(S) attempt with a hard timeout that destroys the socket.
 *
 * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
 */
function requestOnce({ method = 'POST', url, headers = {}, body, timeoutMs = API_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let req;

    const finish = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      handler(value);
    };

    const transport = url.startsWith('https://') ? https : http;
    const reqHeaders = { ...headers };
    if (body !== undefined && body !== null) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    try {
      req = transport.request(url, {
        method,
        headers: reqHeaders,
        rejectUnauthorized: false,
      }, (res) => {
        const chunks = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          finish(resolve, {
            statusCode: res.statusCode,
            headers: res.headers || {},
            body: chunks.join(''),
          });
        });
        res.on('error', (error) => {
          finish(reject, classifyNetworkError(error));
        });
      });
    } catch (error) {
      finish(reject, classifyNetworkError(error));
      return;
    }

    timer = setTimeout(() => {
      const timeoutError = new SonyRequestError(
        `Request timed out after ${timeoutMs / 1000} seconds.`,
        ERROR_STATUS.REQUEST_TIMEOUT,
        { retryable: true }
      );
      finish(reject, timeoutError);
      if (req) {
        req.destroy();
      }
    }, timeoutMs);

    req.on('error', (error) => {
      finish(reject, classifyNetworkError(error));
    });

    if (body !== undefined && body !== null) {
      req.write(body);
    }
    req.end();
  });
}

function parseResponse(response, { parseJson }) {
  if (response.statusCode !== 200) {
    const classified = classifyHttpStatus(response.statusCode);
    throw new SonyRequestError(classified.message, classified.status, {
      retryable: classified.retryable,
      httpStatus: response.statusCode,
    });
  }

  if (!parseJson) {
    return response.body;
  }

  if (!isJsonContentType(response.headers['content-type']) && !response.body) {
    throw new SonyRequestError(
      'Empty response from the Sony API.',
      ERROR_STATUS.PARSE_ERROR,
      { retryable: false }
    );
  }

  if (isJsonContentType(response.headers['content-type']) || (response.body && response.body.trim().startsWith('{'))) {
    let data;
    try {
      data = JSON.parse(response.body);
    } catch (error) {
      throw new SonyRequestError(
        `Could not parse Sony API response: ${error.message}`,
        ERROR_STATUS.PARSE_ERROR,
        { retryable: false }
      );
    }

    const rpcError = classifySonyRpcError(data);
    if (rpcError) {
      throw rpcError;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.prototype.hasOwnProperty.call(data, 'result')) {
      throw new SonyRequestError(
        'Invalid response from the Sony API.',
        ERROR_STATUS.PARSE_ERROR,
        { retryable: false }
      );
    }

    return data;
  }

  throw new SonyRequestError(
    'Unexpected response from the Sony API.',
    ERROR_STATUS.PARSE_ERROR,
    { retryable: false }
  );
}

/**
 * HTTP(S) request with optional retry window for interactive Sony API calls.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string} [options.method]
 * @param {object} [options.headers]
 * @param {string} [options.body]
 * @param {boolean} [options.retry]
 * @param {boolean} [options.parseJson]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.deadline]
 * @param {string[]} [options.retryableStatuses]
 * @param {(attempt: number, error: SonyRequestError) => void} [options.onRetry]
 */
async function request(options) {
  const retry = options.retry === true;
  const parseJson = options.parseJson !== false;
  const timeoutMs = options.timeoutMs || API_TIMEOUT_MS;
  const deadline = options.deadline || (retry ? Date.now() + RETRY_WINDOW_MS : Date.now() + timeoutMs);
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const remaining = deadline - Date.now();
    const attemptTimeout = Math.max(1000, Math.min(timeoutMs, remaining));

    try {
      const response = await requestOnce({
        method: options.method || 'POST',
        url: options.url,
        headers: options.headers || {},
        body: options.body,
        timeoutMs: attemptTimeout,
      });
      return parseResponse(response, { parseJson });
    } catch (error) {
      const sonyError = error instanceof SonyRequestError
        ? error
        : classifyNetworkError(error);
      const remainingAfter = deadline - Date.now();

      if (!retry || !isRetryableError(sonyError, options.retryableStatuses) || remainingAfter <= RETRY_DELAY_MS) {
        throw sonyError;
      }

      if (typeof options.onRetry === 'function') {
        options.onRetry(attempt, sonyError);
      }

      await delay(RETRY_DELAY_MS);
    }
  }
}

module.exports = {
  API_TIMEOUT_MS,
  DEFAULT_RETRYABLE,
  ERROR_STATUS,
  RETRY_DELAY_MS,
  RETRY_WINDOW_MS,
  SonyRequestError,
  delay,
  request,
  requestOnce,
};
