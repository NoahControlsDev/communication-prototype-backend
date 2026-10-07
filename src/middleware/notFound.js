import { HttpError } from '../utils/HttpError.js'

export function notFound(req, res, next) {
  next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`))
}
