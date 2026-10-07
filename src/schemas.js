import { text, number, integer, bool, jsonObject, stringList } from './utils/validate.js'

// Shared by the profile endpoints and birth-certificate acceptance (new profile from a certificate).

export const PROFILE = {
  key: text({ required: true }),
  major: integer({ required: true }),
  minor: integer({ required: true }),
}

// Enum columns (kind, aggregation, acquisition) are checked by Postgres itself;
// the error handler turns a bad value into a 400.
export const PROPERTY = {
  key: text({ required: true }),
  kind: text({ required: true }),
  type: text({ required: true }),
  unit: text(),
  min: number(),
  max: number(),
  aggregation: text(),
  derived: bool(),
  formula: text(),
  acquisition: text(),
  deadband: number(),
  writable: bool({ required: true }),
  priority: text(),
  enum_map: jsonObject(),
  required: bool({ required: true }),
  haystack_tags: stringList(),
}
