export { ProtocolError, type ProtocolErrorCode, parseClientMessage } from './core/protocol.js';
export { type RunDependencies, startLogServerOrExit } from './core/run.js';
export {
  type LogServer,
  type LogServerOptions,
  resolvePort,
  startLogServer,
} from './core/server.js';
export {
  type ConnectOptions,
  type Platform,
  platformFromUa,
  type SessionInfo,
  SessionRegistry,
} from './core/session.js';
export {
  DEFAULT_STORE_LIMITS,
  LogStore,
  type StoreLimits,
  type StoreUsage,
} from './core/store.js';
export {
  type AckMessage,
  type ClientMessage,
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  type ErrorMessage,
  type EventMessage,
  type HelloMessage,
  LOG_LEVELS,
  type LogLevel,
  type LogMessage,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  type RejectMessage,
  type RejectReason,
  type SdkErrorMessage,
  type ServerMessage,
  type StoredEntry,
  type StoredMessageType,
  WS_PORT_ENV,
} from './shared/protocol.js';
