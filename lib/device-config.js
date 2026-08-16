'use strict';

const { SonyRequestError, ERROR_STATUS } = require('./http');

function readSettings(device) {
  if (device && typeof device.getSettings === 'function') {
    return device.getSettings() || {};
  }
  if (device && device.settings && typeof device.settings === 'object') {
    return device.settings;
  }
  return {};
}

function getBaseUrl(settings) {
  const ip = settings && typeof settings.ip === 'string' ? settings.ip.trim() : '';
  if (!ip) {
    throw new SonyRequestError(
      'TV IP address is not configured.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }
  const protocol = settings.https ? 'https://' : 'http://';
  return `${protocol}${ip}`;
}

function validateHost(host) {
  if (host === undefined || host === null || String(host).trim() === '') {
    throw new SonyRequestError(
      'Enter the TV IP address or hostname.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }

  const normalizedHost = String(host).trim();

  if (/^https?:\/\//i.test(normalizedHost)) {
    throw new SonyRequestError(
      'Enter only the IP address or hostname, without http://.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }

  if (normalizedHost.includes('/') || normalizedHost.includes(' ') || normalizedHost.includes(':')) {
    throw new SonyRequestError(
      'Invalid TV IP address or hostname.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }

  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalizedHost);
  const isHostname = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(normalizedHost);

  if (isIpv4) {
    const octets = normalizedHost.split('.').map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) {
      throw new SonyRequestError(
        'Invalid TV IP address or hostname.',
        ERROR_STATUS.INVALID_CONFIG
      );
    }
  } else if (!isHostname) {
    throw new SonyRequestError(
      'Invalid TV IP address or hostname.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }

  return normalizedHost;
}

function normalizeMac(mac) {
  if (mac === undefined || mac === null || String(mac).trim() === '') {
    return '';
  }
  const parts = String(mac).match(/[0-9a-fA-F]{2}/g);
  if (!parts || parts.length !== 6) {
    throw new SonyRequestError(
      'Invalid MAC address.',
      ERROR_STATUS.INVALID_CONFIG
    );
  }
  return parts.join(':').toUpperCase();
}

function pickDeviceId({ cid, serial, macAddr } = {}) {
  const cidValue = cid !== undefined && cid !== null ? String(cid).trim() : '';
  if (cidValue) {
    return `cid:${cidValue}`;
  }

  const serialValue = serial !== undefined && serial !== null ? String(serial).trim() : '';
  if (serialValue) {
    return `serial:${serialValue}`;
  }

  const macValue = macAddr ? normalizeMac(macAddr) : '';
  if (macValue) {
    return `mac:${macValue.replace(/:/g, '')}`;
  }

  throw new SonyRequestError(
    'The TV did not report a stable identifier (cid, serial or MAC).',
    ERROR_STATUS.API_ERROR
  );
}

function isAuthOrConfigError(error) {
  return Boolean(
    error
    && (error.status === ERROR_STATUS.INVALID_CONFIG
      || error.status === ERROR_STATUS.AUTHENTICATION
      || error.status === ERROR_STATUS.PARSE_ERROR)
  );
}

module.exports = {
  getBaseUrl,
  isAuthOrConfigError,
  normalizeMac,
  pickDeviceId,
  readSettings,
  validateHost,
};
