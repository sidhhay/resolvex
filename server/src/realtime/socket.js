/**
 * Socket.IO gateway.
 *
 * Rooms are the addressing scheme used by the Observer layer:
 *
 *   user:<id>        one person, every device they have open
 *   dept:<id>        every handler in a department (their live queue)
 *   role:admin       the administrator analytics view
 *   complaint:<id>   whoever currently has that ticket open
 *
 * The handshake is authenticated with the same JWT as the REST API, so an
 * unauthenticated socket can never join a room and never receives an event.
 */
import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyAccessToken, extractBearerToken } from '../utils/tokens.js';

/** @type {Server | null} */
let io = null;

/** @param {number | string} userId */
export const userRoom = (userId) => `user:${userId}`;
/** @param {number | string} departmentId */
export const departmentRoom = (departmentId) => `dept:${departmentId}`;
/** @param {string} role */
export const roleRoom = (role) => `role:${role}`;
/** @param {number | string} complaintId */
export const complaintRoom = (complaintId) => `complaint:${complaintId}`;

/**
 * Attaches Socket.IO to the HTTP server.
 * @param {import('node:http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    // Keeps a mobile client's rooms across a brief tunnel drop.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  io.use((socket, next) => {
    try {
      const token =
        /** @type {string | undefined} */ (socket.handshake.auth?.token) ??
        extractBearerToken(socket.handshake.headers.authorization);
      if (!token) return next(new Error('UNAUTHORIZED'));

      const claims = verifyAccessToken(token);
      socket.data.user = claims;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = /** @type {import('../utils/tokens.js').TokenClaims} */ (socket.data.user);

    socket.join(userRoom(user.sub));
    socket.join(roleRoom(user.role));
    if (user.departmentId && user.role !== 'student') {
      socket.join(departmentRoom(user.departmentId));
    }

    logger.debug('Socket connected', { userId: user.sub, role: user.role, socketId: socket.id });

    // A client watching one ticket subscribes to its room. Authorisation for
    // reading that complaint is enforced by the REST endpoint the client had to
    // call first; the room only carries updates to a record it already fetched.
    socket.on('complaint:subscribe', (complaintId) => {
      const id = Number(complaintId);
      if (Number.isInteger(id) && id > 0) socket.join(complaintRoom(id));
    });

    socket.on('complaint:unsubscribe', (complaintId) => {
      const id = Number(complaintId);
      if (Number.isInteger(id) && id > 0) socket.leave(complaintRoom(id));
    });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { userId: user.sub, reason });
    });
  });

  return io;
}

/**
 * @returns {Server | null} null before boot completes or in unit tests.
 */
export function getIO() {
  return io;
}

/**
 * Broadcasts to a set of rooms. Duplicate rooms are collapsed by Socket.IO, so
 * a user who is both the assignee and a department member gets one copy.
 *
 * @param {string[]} rooms
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToRooms(rooms, event, payload) {
  if (!io || rooms.length === 0) return;
  io.to(rooms).emit(event, payload);
}

/** Closes the server during graceful shutdown. @returns {Promise<void>} */
export async function closeSocket() {
  if (!io) return;
  await io.close();
  io = null;
}
