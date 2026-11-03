class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

class ValidationError extends AppError {
  constructor(message = "Invalid input") {
    super(message, 422);
  }
}

class RateLimitError extends AppError {
  constructor(windowMs) {
    const minutes = Math.ceil(windowMs / 60000);
    const unit = minutes === 1 ? "minute" : "minutes";
    super(
      `You've hit the rate limit. Please try again in ${minutes} ${unit}.`,
      429
    );
  }
}

class DuplicateKeyError extends Error {
  constructor(message = "Duplicate key") {
    super(message);
    this.name = this.constructor.name;
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  DuplicateKeyError,
};
