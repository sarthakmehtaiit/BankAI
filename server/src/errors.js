// An error we expect (wrong input, not enough balance...). Its message is safe to show the user.
export class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
