declare module 'pouchdb-adapter-utils' {
  export function preprocessAttachments(...args: any[]): any
  export function isLocalId(...args: any[]): any
  export function processDocs(...args: any[]): any
  export function parseDoc(...args: any[]): any
}

declare module 'pouchdb-merge' {
  export function compactTree(...args: any[]): any
  export function collectConflicts(...args: any[]): any
  export function traverseRevTree(...args: any[]): any
  export function winningRev(...args: any[]): any
  export const latest: any
}

declare module 'pouchdb-json' {
  export function safeJsonParse(...args: any[]): any
  export function safeJsonStringify(...args: any[]): any
}

declare module 'pouchdb-errors' {
  export const MISSING_STUB: any
  export const MISSING_DOC: any
  export const REV_CONFLICT: any
  export const WSQ_ERROR: any
  export function createError(...args: any[]): any
}

declare module 'pouchdb-utils' {
  export function clone(...args: any[]): any
  export function pick(...args: any[]): any
  export function filterChange(...args: any[]): any
  export const changesHandler: any
  export function uuid(...args: any[]): any
  export function guardedConsole(...args: any[]): any
}

declare module 'pouchdb-binary-utils' {
  export function binaryStringToBlobOrBuffer(...args: any[]): any
  export function btoa(...args: any[]): any
}
