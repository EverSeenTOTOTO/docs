export const HASH_RE = /#.*$/
export const EXT_RE = /(index)?\.(md|html)$/
export const EXTERNAL_URL_RE = /^[a-z]+:/i

export const inBrowser = typeof document !== 'undefined'

export function normalize(path: string): string {
  return decodeURI(path).replace(HASH_RE, '').replace(EXT_RE, '')
}

