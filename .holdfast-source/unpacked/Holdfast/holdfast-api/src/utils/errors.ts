// A small typed error so route handlers can throw something that carries an
// HTTP status code, and the global error handler in app.ts can turn it into
// a consistent JSON body instead of leaking a stack trace.
export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string, code = "bad_request") {
    return new ApiError(400, code, message);
  }
  static unauthorized(message = "You need to log in to do that.") {
    return new ApiError(401, "unauthorized", message);
  }
  static forbidden(message = "You don't have permission to do that.") {
    return new ApiError(403, "forbidden", message);
  }
  static notFound(message = "That doesn't exist, or you don't have access to it.") {
    return new ApiError(404, "not_found", message);
  }
  static conflict(message: string, code = "conflict") {
    return new ApiError(409, code, message);
  }
}
