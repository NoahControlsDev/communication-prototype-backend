export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function found(value, what = 'Resource') {
  if (!value) throw new HttpError(404, `${what} not found`)
  return value
}
