export class LexerError extends Error {
  constructor(message, line, column, start, end) {
    super(`${message} at ${line}:${column}`);
    this.name = "LexerError";
    this.line = line;
    this.column = column;
    this.start = start;
    this.end = end;
  }
}
