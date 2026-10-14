import config from '../config/index.js'

const PG_CLIENT_ERRORS = {
  '23505': 409,
  '23514': 400,
  '23503': 400,
  '23502': 400,
  '22P02': 400,
}

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
    return err.detail?.includes('still referenced')
      ? `Can't delete: still used by rows in ${err.table}`
      : err.detail ?? err.message
  }
  return err.message
}
