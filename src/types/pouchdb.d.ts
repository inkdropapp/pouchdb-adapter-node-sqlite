declare module 'pouchdb-utils' {
  export function uuid(): string
  export function clone<T>(obj: T): T
  export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
  export function filterChange(opts: any): (change: any) => boolean
  export function changesHandler(): any
}

declare module 'pouchdb-json' {
  export function safeJsonParse(str: string): any
  export function safeJsonStringify(obj: any): string
}

declare module 'pouchdb-merge' {
  export function collectConflicts(metadata: any): string[]
  export function collectLeaves(revTree: any): any[]
  export function isDeleted(metadata: any, rev?: string): boolean
  export function isLocalId(id: string): boolean
  export function merge(tree: any, path: any, depth: number): { tree: any; stemmedRevs: any[] }
  export function revExists(revTree: any, rev: string): boolean
  export function rootToLeaf(revTree: any): any
  export function traverseRevTree(revTree: any, callback: Function): void
  export function winningRev(metadata: any): string
  export function latest(rev: string, metadata: any): string
}

declare module 'pouchdb-errors' {
  export const MISSING_DOC: string
  export const REV_CONFLICT: string
  export const NOT_AN_OBJECT: string
  export const MISSING_ID: string
  export const UNKNOWN_ERROR: string
  export function createError(error: string, reason?: string): Error
}

declare module 'pouchdb-binary-utils' {
  export function binaryStringToBlobOrBuffer(bin: string, type: string): any
  export function btoa(str: string): string
}