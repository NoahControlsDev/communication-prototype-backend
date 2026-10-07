import config from '../config/index.js'

// Postgres error codes that mean "the client sent bad data", not "the server broke".
const PG_CLIENT_ERRORS = {
  '23505': 409, // unique_violation, e.g. duplicate property key in a profile
  '23514': 400, // check_violation, including the override triggers
  '23503': 400, // foreign_key_violation
  '23502': 400, // not_null_violation
  '22P02': 400, // invalid_text_representation, e.g. unknown enum value
}

// Express 5 forwards rejected promises from async handlers here automatically.
export function errorHandler(err, req, res, next) {
  const status = err.status || PG_CLIENT_ERRORS[err.code] || 500
  if (status >= 500) console.error(err)

  res.status(status).json({
    error: status >= 500 && config.env === 'production' ? 'Internal server error' : pgMessage(err),
  })
}

function pgMessage(err) {
  if (err.code === '23505') return `Already exists: ${err.detail ?? err.message}`
  if (err.code === '23514' && err.constraint) return `Rule "${err.constraint}" failed`
  if (err.code === '23503') {
    // On delete, err.table is the table still pointing at the row.
    return err.detail?.includes('still referenced')
      ? `Can't delete: still used by rows in ${err.table}`
      : err.detail ?? err.message
  }
  return err.message
}
