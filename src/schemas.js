import { text, number, integer, bool, jsonObject, stringList } from './utils/validate.js'

export const PROFILE = {
  key: text({ required: true }),
  major: integer({ required: true }),
  minor: integer({ required: true }),
}

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
