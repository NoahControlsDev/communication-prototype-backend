export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Returns value, or throws a 404 if it's null/false (e.g. no row with that id).
export function found(value, what = 'Resource') {
  if (!value) throw new HttpError(404, `${what} not found`)
  return value
}
