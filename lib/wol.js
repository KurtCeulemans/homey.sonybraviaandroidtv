'use strict';

const net = require('net');
const udp = require('dgram');

function createMagicPacket(mac) {
  const MAC_REPEAT = 16;
  const MAC_LENGTH = 0x06;
  const PACKET_HEADER = 0x06;
  const parts = mac.match(/[0-9a-fA-F]{2}/g);
  if (!parts || parts.length !== MAC_LENGTH) {
    throw new Error(`malformed MAC address "${mac}"`);
  }
  let buffer = Buffer.alloc(PACKET_HEADER);
  const bufMac = Buffer.from(parts.map((p) => parseInt(p, 16)));
  buffer.fill(0xff);
  for (let i = 0; i < MAC_REPEAT; i++) {
    buffer = Buffer.concat([buffer, bufMac]);
  }
  return buffer;
}

/**
 * Send a unicast Wake-on-LAN magic packet.
 * Successful resolve only means the UDP packet was sent locally.
 *
 * @param {string} mac
 * @param {{ address: string, port?: number }} options
 * @returns {Promise<boolean>}
 */
function wake(mac, options = {}) {
  const address = options.address;
  const port = options.port || 9;

  if (!address) {
    return Promise.reject(new Error('Wake-on-LAN destination IP is required.'));
  }

  let magicPacket;
  try {
    magicPacket = createMagicPacket(mac);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const socket = udp.createSocket(net.isIPv6(address) ? 'udp6' : 'udp4');
    let settled = false;

    const finish = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.close();
      } catch (_error) {
        // ignore
      }
      handler(value);
    };

    socket.on('error', (error) => {
      finish(reject, error);
    });

    socket.send(magicPacket, 0, magicPacket.length, port, address, (error) => {
      if (error) {
        finish(reject, error);
        return;
      }
      finish(resolve, true);
    });
  });
}

module.exports = {
  createMagicPacket,
  wake,
};
