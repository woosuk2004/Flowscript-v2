export class ParserError extends Error {
  constructor(message, token) {
    const location = token ? `${token.line}:${token.column}` : "unknown location";
    super(`${message} at ${location}`);
    this.name = "ParserError";
    this.token = token;
  }
}
