import { readFile } from "node:fs/promises";

import { LexerError } from "./lexer-error.js";
import { BOOLEAN_LITERALS, KEYWORDS } from "../tokens/keywords.js";
import { TOKEN_KINDS } from "../tokens/token-kinds.js";

const SINGLE_CHAR_TOKENS = new Map([
  [":", TOKEN_KINDS.COLON],
  [",", TOKEN_KINDS.COMMA],
  [".", TOKEN_KINDS.DOT],
  ["+", TOKEN_KINDS.PLUS],
  ["-", TOKEN_KINDS.MINUS],
  ["*", TOKEN_KINDS.STAR],
  ["/", TOKEN_KINDS.SLASH],
  ["(", TOKEN_KINDS.LPAREN],
  [")", TOKEN_KINDS.RPAREN],
  ["{", TOKEN_KINDS.LBRACE],
  ["}", TOKEN_KINDS.RBRACE]
]);

const DOUBLE_CHAR_TOKENS = new Map([
  [">=", TOKEN_KINDS.GTE],
  ["<=", TOKEN_KINDS.LTE],
  ["==", TOKEN_KINDS.EQEQ],
  ["!=", TOKEN_KINDS.NEQ]
]);

export function lex(source) {
  const lexer = new FlowScriptLexer(source);
  return lexer.lex();
}

export async function lexFile(path) {
  const source = await readFile(path, "utf8");
  return lex(source);
}

class FlowScriptLexer {
  constructor(source) {
    this.source = source;
    this.tokens = [];
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.indentStack = [0];
    this.atLineStart = true;
  }

  lex() {
    while (!this.isAtEnd()) {
      if (this.atLineStart) {
        this.scanIndentation();
        if (this.isAtEnd()) {
          break;
        }
      }

      const char = this.peek();

      if (char === " ") {
        this.advance();
        continue;
      }

      if (char === "\t") {
        this.throwError("Tabs are not allowed in FlowScript source", this.index, this.index + 1);
      }

      if (char === "\n" || char === "\r") {
        this.scanNewline();
        continue;
      }

      if (char === "#") {
        this.scanComment();
        continue;
      }

      if (char === '"') {
        this.scanString();
        continue;
      }

      if (isDigit(char)) {
        this.scanNumber();
        continue;
      }

      if (isWordStart(char)) {
        this.scanWord();
        continue;
      }

      const doubleCharToken = DOUBLE_CHAR_TOKENS.get(char + this.peekNext());
      if (doubleCharToken) {
        this.pushToken(doubleCharToken, this.source.slice(this.index, this.index + 2), this.line, this.column, this.index, this.index + 2);
        this.advance();
        this.advance();
        continue;
      }

      if (char === ">") {
        this.pushToken(TOKEN_KINDS.GT, char, this.line, this.column, this.index, this.index + 1);
        this.advance();
        continue;
      }

      if (char === "<") {
        this.pushToken(TOKEN_KINDS.LT, char, this.line, this.column, this.index, this.index + 1);
        this.advance();
        continue;
      }

      const singleCharToken = SINGLE_CHAR_TOKENS.get(char);
      if (singleCharToken) {
        this.pushToken(singleCharToken, char, this.line, this.column, this.index, this.index + 1);
        this.advance();
        continue;
      }

      this.throwError(`Unsupported character ${JSON.stringify(char)}`, this.index, this.index + 1);
    }

    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.pushToken(TOKEN_KINDS.DEDENT, "", this.line, 1, this.index, this.index);
    }

    this.pushToken(TOKEN_KINDS.EOF, "", this.line, this.column, this.index, this.index);
    return this.tokens;
  }

  scanIndentation() {
    const startIndex = this.index;
    const startColumn = this.column;
    let indentWidth = 0;

    while (!this.isAtEnd() && this.peek() === " ") {
      this.advance();
      indentWidth += 1;
    }

    if (this.peek() === "\t") {
      this.throwError("Tabs are not allowed in FlowScript source", this.index, this.index + 1);
    }

    if (this.peek() === "\n" || this.peek() === "\r") {
      this.atLineStart = false;
      return;
    }

    if (this.peek() === "#") {
      this.atLineStart = false;
      return;
    }

    const currentIndent = this.indentStack[this.indentStack.length - 1];
    if (indentWidth > currentIndent) {
      this.indentStack.push(indentWidth);
      this.pushToken(TOKEN_KINDS.INDENT, "", this.line, startColumn, startIndex, this.index);
    } else if (indentWidth < currentIndent) {
      while (this.indentStack.length > 1 && indentWidth < this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.pop();
        this.pushToken(TOKEN_KINDS.DEDENT, "", this.line, startColumn, this.index, this.index);
      }

      if (indentWidth !== this.indentStack[this.indentStack.length - 1]) {
        this.throwError("Inconsistent indentation", startIndex, this.index);
      }
    }

    this.atLineStart = false;
  }

  scanNewline() {
    const start = this.index;
    const line = this.line;
    const column = this.column;

    if (this.peek() === "\r" && this.peekNext() === "\n") {
      this.advance();
      this.advance();
      this.pushToken(TOKEN_KINDS.NEWLINE, "\r\n", line, column, start, this.index);
    } else {
      this.advance();
      this.pushToken(TOKEN_KINDS.NEWLINE, this.source.slice(start, this.index), line, column, start, this.index);
    }

    this.line += 1;
    this.column = 1;
    this.atLineStart = true;
  }

  scanComment() {
    const start = this.index;
    const line = this.line;
    const column = this.column;

    while (!this.isAtEnd() && this.peek() !== "\n" && this.peek() !== "\r") {
      this.advance();
    }

    this.pushToken(TOKEN_KINDS.COMMENT, this.source.slice(start, this.index), line, column, start, this.index);
  }

  scanString() {
    const start = this.index;
    const line = this.line;
    const column = this.column;

    this.advance();

    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === '"') {
        this.advance();
        this.pushToken(TOKEN_KINDS.STRING, this.source.slice(start, this.index), line, column, start, this.index);
        return;
      }

      if (char === "\\") {
        this.advance();
        if (this.isAtEnd()) {
          this.throwError("Unterminated string literal", start, this.index);
        }

        const escape = this.peek();
        if (!isSupportedEscape(escape)) {
          this.throwError(`Unsupported escape sequence \\${escape}`, this.index - 1, this.index + 1);
        }

        this.advance();
        continue;
      }

      if (char === "\n" || char === "\r") {
        this.throwError("String literals cannot span multiple lines", start, this.index);
      }

      this.advance();
    }

    this.throwError("Unterminated string literal", start, this.index);
  }

  scanNumber() {
    const start = this.index;
    const line = this.line;
    const column = this.column;

    if (this.peek() === "0" && isDigit(this.peekNext())) {
      this.throwError("Leading zeroes are not allowed in number literals", start, start + 2);
    }

    while (isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.advance();
      while (isDigit(this.peek())) {
        this.advance();
      }
    }

    const invalidFollower = this.peek();
    if (isWordStart(invalidFollower) || invalidFollower === "_") {
      this.throwError("Invalid number literal", start, this.index + 1);
    }

    this.pushToken(TOKEN_KINDS.NUMBER, this.source.slice(start, this.index), line, column, start, this.index);
  }

  scanWord() {
    const start = this.index;
    const line = this.line;
    const column = this.column;

    this.advance();
    while (isWordPart(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(start, this.index);
    const normalizedLexeme = lexeme.toLowerCase();

    if (BOOLEAN_LITERALS.has(normalizedLexeme)) {
      this.pushToken(TOKEN_KINDS.BOOLEAN, lexeme, line, column, start, this.index);
      return;
    }

    const keyword = KEYWORDS.get(normalizedLexeme);
    if (keyword) {
      this.pushToken(keyword, lexeme, line, column, start, this.index);
      return;
    }

    this.pushToken(TOKEN_KINDS.WORD, lexeme, line, column, start, this.index);
  }

  pushToken(kind, lexeme, line, column, start, end) {
    this.tokens.push({ kind, lexeme, line, column, start, end });
  }

  advance() {
    const char = this.source[this.index] ?? "";
    this.index += 1;
    this.column += 1;
    return char;
  }

  peek() {
    return this.source[this.index] ?? "";
  }

  peekNext() {
    return this.source[this.index + 1] ?? "";
  }

  isAtEnd() {
    return this.index >= this.source.length;
  }

  throwError(message, start, end) {
    throw new LexerError(message, this.line, this.column, start, end);
  }
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isWordStart(char) {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

function isWordPart(char) {
  return isWordStart(char) || isDigit(char) || char === "'";
}

function isSupportedEscape(char) {
  return char === "\\" || char === '"' || char === "n" || char === "r" || char === "t";
}
