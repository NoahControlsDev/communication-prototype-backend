import { HttpError } from './HttpError.js'

// Each field parser takes (value, fieldName) and returns a clean value or throws a 400.
// Blank values ('' / null / undefined) become null, unless the field is required.

const blank = (v) => v === undefined || v === null || v === ''

function wrap(required, check) {
  return (v, field) => {
    if (blank(v)) {
      if (required) throw new HttpError(400, `${field} is required`)
      return null
    }
    return check(v, field)
  }
}

export const text = ({ required = false } = {}) =>
  wrap(required, (v, field) => {
    if (typeof v !== 'string') throw new HttpError(400, `${field} must be a string`)
    const s = v.trim()
    if (required && !s) throw new HttpError(400, `${field} is required`)
    return s || null
  })

export const number = ({ required = false, integer = false } = {}) =>
  wrap(required, (v, field) => {
    const n = Number(v)
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) {
      throw new HttpError(400, `${field} must be ${integer ? 'an integer' : 'a number'}`)
    }
    return n
  })

export const integer = (opts = {}) => number({ ...opts, integer: true })

export const bool = ({ required = false } = {}) =>
  wrap(required, (v, field) => {
    if (typeof v !== 'boolean') throw new HttpError(400, `${field} must be true or false`)
    return v
  })

export const jsonObject = () =>
  wrap(false, (v, field) => {
    if (typeof v !== 'object' || Array.isArray(v)) {
      throw new HttpError(400, `${field} must be a JSON object, e.g. {"0": "off", "1": "on"}`)
    }
    return v
  })

export const stringList = () =>
  wrap(false, (v, field) => {
    if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) {
      throw new HttpError(400, `${field} must be a list of strings`)
    }
    return v.length ? v : null
  })

// Parses body against a schema { field: parser }.
// partial = true (for PATCH): only fields present in the body are parsed and returned.
export function parse(body, schema, { partial = false } = {}) {
  body = body ?? {}
  const out = {}
  for (const [field, parser] of Object.entries(schema)) {
    if (partial && !(field in body)) continue
    out[field] = parser(body[field], field)
  }
  if (partial && !Object.keys(out).length) throw new HttpError(400, 'Nothing to update')
  return out
}

export function parseId(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Invalid id')
  return n
}
