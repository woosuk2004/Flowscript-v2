import test from "node:test";
import assert from "node:assert/strict";

import { TOKEN_KINDS, lex } from "../../src/index.js";

test("lexer tokenizes sentence-style Set and Print statements", () => {
  const source = [
    "Set user age to 20",
    "Set pi to 3.14",
    "Set greeting to \"Hello World\"",
    "Print \"Hello, World!\"",
    "Print \"Age is (user age)\"."
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes multiple boolean spellings case-insensitively", () => {
  const source = [
    "Set active flag to yes",
    "Set visible flag to NO",
    "Set enabled flag to On",
    "Set complete flag to n"
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.BOOLEAN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.BOOLEAN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.BOOLEAN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.BOOLEAN,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes arithmetic, math functions, and reactive bindings", () => {
  const source = [
    "Set rounded total to the result of round(price * quantity / 3, 2)",
    "Set total always is the result of round(price * quantity, 2)"
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.THE,
    TOKEN_KINDS.RESULT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.ROUND,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STAR,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.SLASH,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.ALWAYS,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.THE,
    TOKEN_KINDS.RESULT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.ROUND,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STAR,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes fixed formatting calls and leading soft words", () => {
  const source = [
    "So Set total label to fixed(total, 2)",
    "THEN Print total label.",
    "Also Print total label.",
    "THEREFORE Print total label.",
    "Meanwhile Print total label.",
    "THAT'S why Print \"Use (( and ))\"."
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.FIXED,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes comparison phrases", () => {
  const source = [
    "Set adult status to user age is greater than 18",
    "Set exact match to total is equal to 20",
    "Set small status to total is less than or equal to 10",
    "Set different status to total is not equal to 0"
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.GREATER,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.EQUAL,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.LESS,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.OR,
    TOKEN_KINDS.EQUAL,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.NOT,
    TOKEN_KINDS.EQUAL,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes break and continue loop statements", () => {
  const source = [
    "Repeat 3 times:",
    "    Break.",
    "For each item in numbers:",
    "    Continue"
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.REPEAT,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.TIMES,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.BREAK,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.FOR,
    TOKEN_KINDS.EACH,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.CONTINUE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes logical and string operators", () => {
  const source = [
    "Set title status to title contains \"Flow\" and not title ends with \"Draft\"",
    "Set label to first name joined with last name",
    "Set greeting status to greeting starts with \"Hello\" or greeting ends with \"!\""
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.CONTAINS,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.AND,
    TOKEN_KINDS.NOT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.ENDS,
    TOKEN_KINDS.WITH,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.JOINED,
    TOKEN_KINDS.WITH,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STARTS,
    TOKEN_KINDS.WITH,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.OR,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.ENDS,
    TOKEN_KINDS.WITH,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes collection helper phrases and the no value sentinel", () => {
  const source = [
    "Set first user to first item of users",
    "Set picked user to item at index 2 of users",
    "Set user slice to items from index 1 to 5 of users",
    "Set total users to count of users",
    "Set has alice to users contains item \"Alice\"",
    "When item at index 0 of users is no value:",
    "    Print \"Missing\"."
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.CONTAINS,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.WHEN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.BOOLEAN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes extended collection helper phrases", () => {
  const source = [
    "Set first users to first 3 items of users",
    "Set last users to last 2 items of users",
    'Set alice index to index of "Alice" in users',
    'Set has any match to users has any of ("Alice", "Bob")',
    'Set has all match to users has all of ("Alice", "Bob")'
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.IN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes conditional and check blocks with indentation", () => {
  const source = [
    "When user age is greater than 18:",
    "    Print \"Adult\".",
    "In case user age is greater than 12:",
    "    Print \"Teen\".",
    "Otherwise:",
    "    Print \"Child\".",
    "Check role:",
    "    Case \"admin\":",
    "        Print \"Admin\".",
    "    Default:",
    "        Print \"Guest\"."
  ].join("\n");

  const kinds = lex(source).map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.WHEN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.GREATER,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.IN,
    TOKEN_KINDS.CASE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.GREATER,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.OTHERWISE,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.CHECK,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.CASE,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.DEFAULT,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer tokenizes list literals and loop blocks with indentation", () => {
  const source = [
    "Set numbers to the list of (1, 2, 3)",
    "For each item in numbers:",
    "    Print item.",
    "Repeat 2 times:",
    "    Print \"Again\".",
    "Keep doing this while total is less than 10:",
    "    Print total.",
    "Keep doing this until total is greater than 10:",
    "    Print total."
  ].join("\n");

  const tokens = lex(source);
  const kinds = tokens.map((token) => token.kind);

  assert.deepEqual(kinds, [
    TOKEN_KINDS.SET,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.TO,
    TOKEN_KINDS.THE,
    TOKEN_KINDS.LIST,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.LPAREN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COMMA,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.RPAREN,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.FOR,
    TOKEN_KINDS.EACH,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IN,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.REPEAT,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.TIMES,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.STRING,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.KEEP,
    TOKEN_KINDS.DOING,
    TOKEN_KINDS.THIS,
    TOKEN_KINDS.WHILE,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.LESS,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.KEEP,
    TOKEN_KINDS.DOING,
    TOKEN_KINDS.THIS,
    TOKEN_KINDS.UNTIL,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.IS,
    TOKEN_KINDS.GREATER,
    TOKEN_KINDS.THAN,
    TOKEN_KINDS.NUMBER,
    TOKEN_KINDS.COLON,
    TOKEN_KINDS.NEWLINE,
    TOKEN_KINDS.INDENT,
    TOKEN_KINDS.PRINT,
    TOKEN_KINDS.WORD,
    TOKEN_KINDS.DOT,
    TOKEN_KINDS.DEDENT,
    TOKEN_KINDS.EOF
  ]);
});

test("lexer preserves line, column, and offset positions", () => {
  const tokens = lex("Set total to 10\nPrint total\n");
  const setToken = tokens[0];
  const nameToken = tokens[1];
  const printToken = tokens[5];
  const eofToken = tokens.at(-1);

  assert.deepEqual(setToken, {
    kind: TOKEN_KINDS.SET,
    lexeme: "Set",
    line: 1,
    column: 1,
    start: 0,
    end: 3
  });

  assert.deepEqual(nameToken, {
    kind: TOKEN_KINDS.WORD,
    lexeme: "total",
    line: 1,
    column: 5,
    start: 4,
    end: 9
  });

  assert.deepEqual(printToken, {
    kind: TOKEN_KINDS.PRINT,
    lexeme: "Print",
    line: 2,
    column: 1,
    start: 16,
    end: 21
  });

  assert.equal(eofToken?.line, 3);
  assert.equal(eofToken?.column, 1);
});

test("lexer emits explicit COMMENT and NEWLINE tokens", () => {
  const tokens = lex("# first\n\n# second\n");

  assert.deepEqual(
    tokens.map((token) => token.kind),
    [
      TOKEN_KINDS.COMMENT,
      TOKEN_KINDS.NEWLINE,
      TOKEN_KINDS.NEWLINE,
      TOKEN_KINDS.COMMENT,
      TOKEN_KINDS.NEWLINE,
      TOKEN_KINDS.EOF
    ]
  );
});
