export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotionError';
  }
}