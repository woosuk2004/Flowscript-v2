import { readFile } from "node:fs/promises";

import { lex } from "../lexer/lexer.js";
import { TOKEN_KINDS } from "../tokens/token-kinds.js";
import { ParserError } from "./parser-error.js";

const ARITHMETIC_TOKENS = new Set([
  TOKEN_KINDS.PLUS,
  TOKEN_KINDS.MINUS,
  TOKEN_KINDS.STAR,
  TOKEN_KINDS.SLASH
]);

const BUILTIN_FUNCTION_KINDS = new Set([
  TOKEN_KINDS.ROUND,
  TOKEN_KINDS.FLOOR,
  TOKEN_KINDS.CEIL
]);

const VALUE_BUILTIN_FUNCTION_KINDS = new Set([TOKEN_KINDS.FIXED]);

export function parse(source) {
  return parseTokens(lex(source));
}

export async function parseFile(path) {
  const source = await readFile(path, "utf8");
  return parse(source);
}

export function parseTokens(tokens) {
  const parser = new FlowScriptParser(tokens);
  return parser.parseProgram();
}

class FlowScriptParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parseProgram() {
    const body = [];
    this.skipIgnorable();

    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
      this.consumeStatementEnd();
      this.skipIgnorable();
    }

    return {
      type: "Program",
      body
    };
  }

  parseStatement() {
    this.skipSoftWords();

    if (this.match(TOKEN_KINDS.SET)) {
      return this.parseSetStatement();
    }

    if (this.match(TOKEN_KINDS.PRINT)) {
      return this.parsePrintStatement();
    }

    if (this.match(TOKEN_KINDS.CREATE)) {
      return this.parseCollectionDeclarationStatement();
    }

    if (this.match(TOKEN_KINDS.TAKE)) {
      return this.parseCollectionPipelineStatement();
    }

    if (this.match(TOKEN_KINDS.WHEN)) {
      return this.parseWhenStatement();
    }

    if (this.match(TOKEN_KINDS.CHECK)) {
      return this.parseCheckStatement();
    }

    if (this.match(TOKEN_KINDS.FOR)) {
      return this.parseForEachStatement();
    }

    if (this.match(TOKEN_KINDS.REPEAT)) {
      return this.parseRepeatStatement();
    }

    if (this.match(TOKEN_KINDS.KEEP)) {
      return this.parseWhileStatement();
    }

    throw this.error(this.peek(), `Unsupported statement starting with ${this.peek().lexeme || this.peek().kind}`);
  }

  parseSetStatement() {
    this.consume(TOKEN_KINDS.SET, "Expected 'Set' to start an assignment statement");
    const nameParts = this.parseNameUntil(new Set([TOKEN_KINDS.TO, TOKEN_KINDS.ALWAYS]));

    if (this.match(TOKEN_KINDS.ALWAYS)) {
      this.advance();
      this.consume(TOKEN_KINDS.IS, "Expected 'is' after 'always'");
      const expression = this.parseResultExpression();
      return {
        type: "ReactiveSetStatement",
        nameParts,
        expression
      };
    }

    this.consume(TOKEN_KINDS.TO, "Expected 'to' after the assignment name");
    const value = this.parseValueExpression();
    this.ensureNoRawArithmetic();

    return {
      type: "SetStatement",
      nameParts,
      value
    };
  }

  parsePrintStatement() {
    this.consume(TOKEN_KINDS.PRINT, "Expected 'Print' to start a print statement");
    const value = this.parseValueExpression();
    this.ensureNoRawArithmetic();
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "PrintStatement",
      value,
      terminated
    };
  }

  parseCollectionDeclarationStatement() {
    this.consume(TOKEN_KINDS.CREATE, "Expected 'Create' to start a collection declaration");
    this.consumeWord("a", "Expected 'a' after 'Create'");
    const collectionKind = this.parseCollectionKind();
    this.consumeWord("called", "Expected 'called' after the collection kind");
    const nameParts = this.parseCollectionName();

    if (this.matchWord("defined")) {
      this.advance();
      this.consumeWord("as", "Expected 'as' after 'defined'");
      const items = this.parseCollectionDefinitionBlock(collectionKind);
      return {
        type: "CollectionDeclarationStatement",
        collectionKind,
        nameParts,
        items,
        source: null,
        where: null,
        select: null
      };
    }

    if (this.matchWord("from")) {
      this.advance();
      const source = this.parseCollectionSourceReference(new Set(["where", "select"]), new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]));

      let where = null;
      let select = null;

      if (this.matchWord("where")) {
        this.advance();
        where = this.parseCollectionPredicate();
      }

      if (this.matchWord("select")) {
        this.advance();
        select = this.parseCollectionProjection();
      }

      if (this.match(TOKEN_KINDS.DOT)) {
        this.advance();
      }

      return {
        type: "CollectionDeclarationStatement",
        collectionKind,
        nameParts,
        items: null,
        source,
        where,
        select
      };
    }

    if (this.match(TOKEN_KINDS.DOT)) {
      this.advance();
    }

    return {
      type: "CollectionDeclarationStatement",
      collectionKind,
      nameParts,
      items: [],
      source: null,
      where: null,
      select: null
    };
  }

  parseCollectionPipelineStatement() {
    this.consume(TOKEN_KINDS.TAKE, "Expected 'Take' to start a pipeline");
    const source = this.parseCollectionSourceReference(new Set(), new Set([TOKEN_KINDS.COLON]));

    this.consume(TOKEN_KINDS.COLON, "Expected ':' after the pipeline source");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented pipeline block");

    const steps = [];
    this.skipIgnorable();

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      this.consumeWord("then", "Expected 'Then' at the start of each pipeline step");
      steps.push(this.parseCollectionPipelineStep());
      this.consumeLineEnd("Expected the end of the pipeline step");
      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the pipeline block");

    if (steps.length === 0) {
      throw this.error(this.peek(), "A pipeline must include at least one step");
    }

    if (steps.at(-1)?.type !== "SaveStep") {
      throw this.error(this.peek(), "A pipeline must end with 'Then save to ... as a list' or 'Then save to ... as a set'");
    }

    for (let index = 0; index < steps.length - 1; index += 1) {
      if (steps[index].type === "SaveStep") {
        throw this.error(this.peek(), "The save step must be the final pipeline step");
      }
    }

    return {
      type: "CollectionPipelineStatement",
      source,
      steps
    };
  }

  parseCollectionPipelineStep() {
    if (this.matchWord("filter")) {
      this.advance();
      this.consumeWord("where", "Expected 'where' after 'filter'");
      return {
        type: "FilterStep",
        condition: this.parseCollectionPredicate()
      };
    }

    if (this.matchWord("sort")) {
      this.advance();
      this.consumeWord("by", "Expected 'by' after 'sort'");
      const fieldName = this.parseCollectionFieldName();
      let direction = "ascending";

      if (this.matchWord("ascending")) {
        this.advance();
      } else if (this.matchWord("descending")) {
        this.advance();
        direction = "descending";
      }

      return {
        type: "SortStep",
        fieldName,
        direction
      };
    }

    if (this.match(TOKEN_KINDS.TAKE)) {
      this.advance();
      this.consume(TOKEN_KINDS.THE, "Expected 'the' after 'take'");
      this.consumeWord("first", "Expected 'first' after 'take the'");
      const count = this.parseValueExpression();
      this.ensureNoRawArithmetic();
      this.consumeWord("items", "Expected 'items' after the take count");
      return {
        type: "TakeFirstStep",
        count
      };
    }

    if (this.matchWord("select")) {
      this.advance();
      return {
        type: "SelectStep",
        projection: this.parseCollectionProjection()
      };
    }

    if (this.matchWord("save")) {
      this.advance();
      this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'save'");
      const targetNameParts = this.parseNameUntilWord("as");
      this.consumeWord("as", "Expected 'as' after the save target");
      this.consumeWord("a", "Expected 'a' after 'as'");
      const collectionKind = this.parseCollectionKind();
      return {
        type: "SaveStep",
        targetNameParts,
        collectionKind
      };
    }

    throw this.error(this.peek(), "Unsupported pipeline step");
  }

  parseWhenStatement() {
    this.consume(TOKEN_KINDS.WHEN, "Expected 'When' to start a conditional block");
    const branches = [
      {
        condition: this.parseValueExpression(),
        body: this.parseBlock()
      }
    ];

    while (this.match(TOKEN_KINDS.IN)) {
      this.advance();
      this.consume(TOKEN_KINDS.CASE, "Expected 'case' after 'In'");
      branches.push({
        condition: this.parseValueExpression(),
        body: this.parseBlock()
      });
    }

    let otherwiseBody = null;
    if (this.match(TOKEN_KINDS.OTHERWISE)) {
      this.advance();
      otherwiseBody = this.parseBlock();
    }

    return {
      type: "WhenStatement",
      branches,
      otherwiseBody
    };
  }

  parseCheckStatement() {
    this.consume(TOKEN_KINDS.CHECK, "Expected 'Check' to start a check block");
    const target = this.parseValueExpression();

    this.consume(TOKEN_KINDS.COLON, "Expected ':' after the check target");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented block after 'Check ...:'");
    this.skipIgnorable();

    const cases = [];
    let defaultBody = null;

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      if (this.match(TOKEN_KINDS.CASE)) {
        this.advance();
        const match = this.parseValueExpression();
        const body = this.parseBlock();
        cases.push({ match, body });
      } else if (this.match(TOKEN_KINDS.DEFAULT)) {
        this.advance();
        defaultBody = this.parseBlock();
      } else {
        throw this.error(this.peek(), "Expected 'Case' or 'Default' inside a Check block");
      }

      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the Check block");

    return {
      type: "CheckStatement",
      target,
      cases,
      defaultBody
    };
  }

  parseForEachStatement() {
    this.consume(TOKEN_KINDS.FOR, "Expected 'For' to start a for-each loop");
    this.consume(TOKEN_KINDS.EACH, "Expected 'each' after 'For'");
    const itemNameParts = this.parseNameUntil(new Set([TOKEN_KINDS.IN]));
    this.consume(TOKEN_KINDS.IN, "Expected 'in' after the loop item name");
    const collection = this.parseValueExpression();
    const body = this.parseBlock();

    return {
      type: "ForEachStatement",
      itemNameParts,
      collection,
      body
    };
  }

  parseRepeatStatement() {
    this.consume(TOKEN_KINDS.REPEAT, "Expected 'Repeat' to start a repeat loop");
    const count = this.parseValueExpression();
    this.consume(TOKEN_KINDS.TIMES, "Expected 'times' after the repeat count");
    const body = this.parseBlock();

    return {
      type: "RepeatStatement",
      count,
      body
    };
  }

  parseWhileStatement() {
    this.consume(TOKEN_KINDS.KEEP, "Expected 'Keep' to start a loop");
    this.consume(TOKEN_KINDS.DOING, "Expected 'doing' after 'Keep'");
    this.consume(TOKEN_KINDS.THIS, "Expected 'this' after 'Keep doing'");

    const isUntil = this.match(TOKEN_KINDS.UNTIL);
    if (isUntil) {
      this.advance();
    } else {
      this.consume(TOKEN_KINDS.WHILE, "Expected 'while' or 'until' after 'Keep doing this'");
    }

    let condition = this.parseValueExpression();
    if (isUntil) {
      condition = {
        type: "UnaryExpression",
        operator: TOKEN_KINDS.NOT,
        argument: condition
      };
    }

    const body = this.parseBlock();

    return {
      type: "WhileStatement",
      condition,
      body
    };
  }

  parseBlock() {
    this.consume(TOKEN_KINDS.COLON, "Expected ':' before a block");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented block");

    const body = [];
    this.skipIgnorable();

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      body.push(this.parseStatement());
      this.consumeStatementEnd();
      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the block");
    return body;
  }

  parseValueExpression() {
    return this.parseOrExpression();
  }

  parseOrExpression() {
    let expression = this.parseAndExpression();

    while (this.match(TOKEN_KINDS.OR)) {
      const operator = this.advance();
      const right = this.parseAndExpression();
      expression = {
        type: "LogicalExpression",
        operator: operator.kind,
        left: expression,
        right
      };
    }

    return expression;
  }

  parseAndExpression() {
    let expression = this.parseNotExpression();

    while (this.match(TOKEN_KINDS.AND)) {
      const operator = this.advance();
      const right = this.parseNotExpression();
      expression = {
        type: "LogicalExpression",
        operator: operator.kind,
        left: expression,
        right
      };
    }

    return expression;
  }

  parseNotExpression() {
    if (this.match(TOKEN_KINDS.NOT)) {
      const operator = this.advance();
      return {
        type: "UnaryExpression",
        operator: operator.kind,
        argument: this.parseNotExpression()
      };
    }

    return this.parseComparisonExpression();
  }

  parseComparisonExpression() {
    const left = this.parseStringOperationExpression();
    const operator = this.parseComparisonOperator();

    if (!operator) {
      return left;
    }

    const right = this.parseStringOperationExpression();

    return {
      type: "ComparisonExpression",
      operator,
      left,
      right
    };
  }

  parseStringOperationExpression() {
    let expression = this.parseAtomicValueExpression();

    while (true) {
      if (this.match(TOKEN_KINDS.CONTAINS)) {
        this.advance();
        expression = {
          type: "StringOperationExpression",
          operator: "CONTAINS",
          left: expression,
          right: this.parseAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.STARTS)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'starts'");
        expression = {
          type: "StringOperationExpression",
          operator: "STARTS_WITH",
          left: expression,
          right: this.parseAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.ENDS)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'ends'");
        expression = {
          type: "StringOperationExpression",
          operator: "ENDS_WITH",
          left: expression,
          right: this.parseAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.JOINED)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'joined'");
        expression = {
          type: "StringOperationExpression",
          operator: "JOINED_WITH",
          left: expression,
          right: this.parseAtomicValueExpression()
        };
        continue;
      }

      return expression;
    }
  }

  parseAtomicValueExpression() {
    if (this.checkListPhrase()) {
      return this.parseListExpression();
    }

    if (this.checkResultPhrase()) {
      return this.parseResultExpression();
    }

    if (VALUE_BUILTIN_FUNCTION_KINDS.has(this.peek().kind)) {
      return this.parseBuiltinCallExpression();
    }

    if (this.match(TOKEN_KINDS.NUMBER)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "number",
        value: Number(token.lexeme),
        raw: token.lexeme
      };
    }

    if (this.match(TOKEN_KINDS.STRING)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "string",
        value: JSON.parse(token.lexeme),
        raw: token.lexeme
      };
    }

    if (this.match(TOKEN_KINDS.BOOLEAN)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "boolean",
        value: this.toBooleanValue(token.lexeme),
        raw: token.lexeme
      };
    }

    return this.parseReferenceExpression();
  }

  parseListExpression() {
    this.consume(TOKEN_KINDS.THE, "Expected 'the' before 'list of (...)'");
    this.consume(TOKEN_KINDS.LIST, "Expected 'list' in 'the list of (...)'");
    this.consumeWord("of", "Expected 'of' in 'the list of (...)'");
    this.consume(TOKEN_KINDS.LPAREN, "Expected '(' after 'the list of'");

    const items = [];
    if (!this.match(TOKEN_KINDS.RPAREN)) {
      items.push(this.parseValueExpression());

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        items.push(this.parseValueExpression());
      }
    }

    this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the list items");

    return {
      type: "ListExpression",
      items
    };
  }

  parseComparisonOperator() {
    if (!this.match(TOKEN_KINDS.IS)) {
      return null;
    }

    const checkpoint = this.index;
    this.advance();

    if (this.match(TOKEN_KINDS.NOT)) {
      this.advance();
      this.consume(TOKEN_KINDS.EQUAL, "Expected 'equal' after 'is not'");
      this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is not equal'");
      return "NOT_EQUAL";
    }

    if (this.match(TOKEN_KINDS.EQUAL)) {
      this.advance();
      this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is equal'");
      return "EQUAL";
    }

    if (this.match(TOKEN_KINDS.GREATER)) {
      this.advance();
      this.consume(TOKEN_KINDS.THAN, "Expected 'than' after 'is greater'");

      if (this.match(TOKEN_KINDS.OR)) {
        this.advance();
        this.consume(TOKEN_KINDS.EQUAL, "Expected 'equal' after 'is greater than or'");
        this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is greater than or equal'");
        return "GREATER_THAN_OR_EQUAL";
      }

      return "GREATER_THAN";
    }

    if (this.match(TOKEN_KINDS.LESS)) {
      this.advance();
      this.consume(TOKEN_KINDS.THAN, "Expected 'than' after 'is less'");

      if (this.match(TOKEN_KINDS.OR)) {
        this.advance();
        this.consume(TOKEN_KINDS.EQUAL, "Expected 'equal' after 'is less than or'");
        this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is less than or equal'");
        return "LESS_THAN_OR_EQUAL";
      }

      return "LESS_THAN";
    }

    this.index = checkpoint;
    return null;
  }

  parseCollectionPredicate() {
    return this.parseCollectionOrExpression();
  }

  parseCollectionOrExpression() {
    let expression = this.parseCollectionAndExpression();

    while (this.match(TOKEN_KINDS.OR)) {
      const operator = this.advance();
      const right = this.parseCollectionAndExpression();
      expression = {
        type: "LogicalExpression",
        operator: operator.kind,
        left: expression,
        right
      };
    }

    return expression;
  }

  parseCollectionAndExpression() {
    let expression = this.parseCollectionNotExpression();

    while (this.match(TOKEN_KINDS.AND)) {
      const operator = this.advance();
      const right = this.parseCollectionNotExpression();
      expression = {
        type: "LogicalExpression",
        operator: operator.kind,
        left: expression,
        right
      };
    }

    return expression;
  }

  parseCollectionNotExpression() {
    if (this.match(TOKEN_KINDS.NOT)) {
      const operator = this.advance();
      return {
        type: "UnaryExpression",
        operator: operator.kind,
        argument: this.parseCollectionNotExpression()
      };
    }

    return this.parseCollectionComparisonExpression();
  }

  parseCollectionComparisonExpression() {
    const left = this.parseCollectionStringOperationExpression();
    const operator = this.parseCollectionComparisonOperator();

    if (!operator) {
      return left;
    }

    const right = this.parseCollectionStringOperationExpression();

    return {
      type: "ComparisonExpression",
      operator,
      left,
      right
    };
  }

  parseCollectionStringOperationExpression() {
    let expression = this.parseCollectionAtomicValueExpression();

    while (true) {
      if (this.match(TOKEN_KINDS.CONTAINS)) {
        this.advance();
        expression = {
          type: "StringOperationExpression",
          operator: "CONTAINS",
          left: expression,
          right: this.parseCollectionAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.STARTS)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'starts'");
        expression = {
          type: "StringOperationExpression",
          operator: "STARTS_WITH",
          left: expression,
          right: this.parseCollectionAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.ENDS)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'ends'");
        expression = {
          type: "StringOperationExpression",
          operator: "ENDS_WITH",
          left: expression,
          right: this.parseCollectionAtomicValueExpression()
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.JOINED)) {
        this.advance();
        this.consume(TOKEN_KINDS.WITH, "Expected 'with' after 'joined'");
        expression = {
          type: "StringOperationExpression",
          operator: "JOINED_WITH",
          left: expression,
          right: this.parseCollectionAtomicValueExpression()
        };
        continue;
      }

      return expression;
    }
  }

  parseCollectionAtomicValueExpression() {
    if (this.match(TOKEN_KINDS.NUMBER)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "number",
        value: Number(token.lexeme),
        raw: token.lexeme
      };
    }

    if (this.match(TOKEN_KINDS.STRING)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "string",
        value: JSON.parse(token.lexeme),
        raw: token.lexeme
      };
    }

    if (this.match(TOKEN_KINDS.BOOLEAN)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "boolean",
        value: this.toBooleanValue(token.lexeme),
        raw: token.lexeme
      };
    }

    if (this.match(TOKEN_KINDS.LPAREN)) {
      this.advance();
      const expression = this.parseCollectionPredicate();
      this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the grouped collection expression");
      return expression;
    }

    return this.parseFieldReferenceExpression();
  }

  parseCollectionComparisonOperator() {
    if (this.match(TOKEN_KINDS.GTE)) {
      this.advance();
      return "GREATER_THAN_OR_EQUAL";
    }

    if (this.match(TOKEN_KINDS.LTE)) {
      this.advance();
      return "LESS_THAN_OR_EQUAL";
    }

    if (this.match(TOKEN_KINDS.GT)) {
      this.advance();
      return "GREATER_THAN";
    }

    if (this.match(TOKEN_KINDS.LT)) {
      this.advance();
      return "LESS_THAN";
    }

    if (this.match(TOKEN_KINDS.EQEQ)) {
      this.advance();
      return "EQUAL";
    }

    if (this.match(TOKEN_KINDS.NEQ)) {
      this.advance();
      return "NOT_EQUAL";
    }

    if (!this.match(TOKEN_KINDS.IS)) {
      return null;
    }

    const checkpoint = this.index;
    this.advance();

    if (this.match(TOKEN_KINDS.NOT)) {
      this.advance();
      if (this.match(TOKEN_KINDS.EQUAL)) {
        this.advance();
        this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is not equal'");
      }
      return "NOT_EQUAL";
    }

    if (this.match(TOKEN_KINDS.EQUAL)) {
      this.advance();
      this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is equal'");
      return "EQUAL";
    }

    if (this.match(TOKEN_KINDS.GREATER)) {
      this.advance();
      this.consume(TOKEN_KINDS.THAN, "Expected 'than' after 'is greater'");

      if (this.match(TOKEN_KINDS.OR)) {
        this.advance();
        this.consume(TOKEN_KINDS.EQUAL, "Expected 'equal' after 'is greater than or'");
        this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is greater than or equal'");
        return "GREATER_THAN_OR_EQUAL";
      }

      return "GREATER_THAN";
    }

    if (this.match(TOKEN_KINDS.LESS)) {
      this.advance();
      this.consume(TOKEN_KINDS.THAN, "Expected 'than' after 'is less'");

      if (this.match(TOKEN_KINDS.OR)) {
        this.advance();
        this.consume(TOKEN_KINDS.EQUAL, "Expected 'equal' after 'is less than or'");
        this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'is less than or equal'");
        return "LESS_THAN_OR_EQUAL";
      }

      return "LESS_THAN";
    }

    this.index = checkpoint;
    this.consume(TOKEN_KINDS.IS, "Expected 'is' in the collection comparison");
    return "EQUAL";
  }

  parseCollectionProjection() {
    if (this.match(TOKEN_KINDS.LBRACE)) {
      return this.parseProjectionRecordLiteralExpression();
    }

    return this.parseFieldReferenceExpression();
  }

  parseProjectionRecordLiteralExpression() {
    this.consume(TOKEN_KINDS.LBRACE, "Expected '{' to start the projection record");
    const fieldNames = [];

    if (!this.match(TOKEN_KINDS.RBRACE)) {
      fieldNames.push(this.parseCollectionFieldName());

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        fieldNames.push(this.parseCollectionFieldName());
      }
    }

    this.consume(TOKEN_KINDS.RBRACE, "Expected '}' after the projection fields");

    return {
      type: "RecordLiteralExpression",
      fields: fieldNames.map((fieldName) => ({
        name: fieldName,
        value: {
          type: "FieldReferenceExpression",
          fieldName
        }
      }))
    };
  }

  parseCollectionRecordLiteralExpression() {
    this.consume(TOKEN_KINDS.LBRACE, "Expected '{' to start the record literal");
    const fields = [];

    if (!this.match(TOKEN_KINDS.RBRACE)) {
      fields.push(this.parseCollectionRecordField());

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        fields.push(this.parseCollectionRecordField());
      }
    }

    this.consume(TOKEN_KINDS.RBRACE, "Expected '}' after the record fields");

    return {
      type: "RecordLiteralExpression",
      fields
    };
  }

  parseCollectionRecordField() {
    const name = this.parseCollectionFieldName();
    this.consume(TOKEN_KINDS.COLON, "Expected ':' after the record field name");
    const value = this.parseValueExpression();
    this.ensureNoRawArithmetic();
    return { name, value };
  }

  parseFieldReferenceExpression() {
    const fieldName = this.parseCollectionFieldName();
    return {
      type: "FieldReferenceExpression",
      fieldName
    };
  }

  parseCollectionFieldName() {
    const token = this.peek();
    if (token.kind !== TOKEN_KINDS.WORD) {
      throw this.error(token, "Expected a collection field name");
    }

    return this.advance().lexeme;
  }

  parseCollectionDefinitionBlock(collectionKind) {
    this.consume(TOKEN_KINDS.COLON, "Expected ':' before the collection definition block");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented collection definition block");

    const items = [];
    this.skipIgnorable();

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      this.consume(TOKEN_KINDS.MINUS, "Expected '-' before each collection item");
      const item = this.parseCollectionDefinitionItem(collectionKind);
      items.push(item);
      this.consumeLineEnd("Expected the end of the collection item");
      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the collection definition block");
    return items;
  }

  parseCollectionDefinitionItem(collectionKind) {
    if (this.match(TOKEN_KINDS.LBRACE)) {
      if (collectionKind === "set") {
        throw this.error(this.peek(), "Sets only support primitive values in this version of FlowScript");
      }

      return this.parseCollectionRecordLiteralExpression();
    }

    const item = this.parseValueExpression();
    this.ensureNoRawArithmetic();
    return item;
  }

  parseCollectionKind() {
    if (this.match(TOKEN_KINDS.LIST)) {
      this.advance();
      return "list";
    }

    if (this.match(TOKEN_KINDS.SET)) {
      this.advance();
      return "set";
    }

    throw this.error(this.peek(), "Expected 'List' or 'Set'");
  }

  parseCollectionName() {
    const nameParts = [];

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token.kind === TOKEN_KINDS.DOT || token.kind === TOKEN_KINDS.NEWLINE || token.kind === TOKEN_KINDS.EOF) {
        break;
      }

      if (token.kind === TOKEN_KINDS.WORD && ["defined", "from"].includes(token.lexeme.toLowerCase())) {
        break;
      }

      if (token.kind !== TOKEN_KINDS.WORD) {
        throw this.error(token, "Expected a collection name");
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), "Expected a collection name");
    }

    return nameParts;
  }

  parseCollectionSourceReference(boundaryWords, boundaryKinds) {
    if (this.match(TOKEN_KINDS.THE)) {
      this.advance();
    }

    const nameParts = [];

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (boundaryKinds.has(token.kind)) {
        break;
      }

      if (token.kind === TOKEN_KINDS.WORD && boundaryWords.has(token.lexeme.toLowerCase())) {
        break;
      }

      if (token.kind !== TOKEN_KINDS.WORD) {
        throw this.error(token, "Expected a collection source name");
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), "Expected a collection source name");
    }

    return {
      type: "ReferenceExpression",
      nameParts
    };
  }

  parseNameUntilWord(expectedWord) {
    const nameParts = [];

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token.kind === TOKEN_KINDS.WORD && token.lexeme.toLowerCase() === expectedWord.toLowerCase()) {
        break;
      }

      if (token.kind !== TOKEN_KINDS.WORD) {
        throw this.error(token, "Expected a variable name");
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), "Expected a variable name");
    }

    return nameParts;
  }

  parseResultExpression() {
    this.consume(TOKEN_KINDS.THE, "Expected 'the' before 'result of (...)'");
    this.consume(TOKEN_KINDS.RESULT, "Expected 'result' in 'the result of (...)'");
    this.consumeWord("of", "Expected 'of' in 'the result of (...)'");

    if (!this.match(TOKEN_KINDS.LPAREN) && !BUILTIN_FUNCTION_KINDS.has(this.peek().kind)) {
      throw this.error(this.peek(), "Expected '(' or a math function after 'the result of'");
    }

    return {
      type: "ResultExpression",
      expression: this.parseAdditiveExpression()
    };
  }

  parseAdditiveExpression() {
    let expression = this.parseMultiplicativeExpression();

    while (this.match(TOKEN_KINDS.PLUS) || this.match(TOKEN_KINDS.MINUS)) {
      const operator = this.advance();
      expression = {
        type: "BinaryExpression",
        operator: operator.kind,
        left: expression,
        right: this.parseMultiplicativeExpression()
      };
    }

    return expression;
  }

  parseMultiplicativeExpression() {
    let expression = this.parsePrimaryExpression();

    while (this.match(TOKEN_KINDS.STAR) || this.match(TOKEN_KINDS.SLASH)) {
      const operator = this.advance();
      expression = {
        type: "BinaryExpression",
        operator: operator.kind,
        left: expression,
        right: this.parsePrimaryExpression()
      };
    }

    return expression;
  }

  parsePrimaryExpression() {
    if (this.match(TOKEN_KINDS.NUMBER)) {
      const token = this.advance();
      return {
        type: "LiteralExpression",
        valueType: "number",
        value: Number(token.lexeme),
        raw: token.lexeme
      };
    }

    if (BUILTIN_FUNCTION_KINDS.has(this.peek().kind)) {
      return this.parseBuiltinCallExpression();
    }

    if (this.match(TOKEN_KINDS.LPAREN)) {
      this.advance();
      const expression = this.parseAdditiveExpression();
      this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the grouped expression");
      return expression;
    }

    return this.parseReferenceExpression();
  }

  parseReferenceExpression() {
    if (this.match(TOKEN_KINDS.THE)) {
      this.advance();
    }

    if (this.startsSoftWordPhrase()) {
      throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
    }

    const nameParts = [];
    while (this.match(TOKEN_KINDS.WORD)) {
      if (this.startsSoftWordPhrase()) {
        throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), "Expected a value or variable reference");
    }

    return {
      type: "ReferenceExpression",
      nameParts
    };
  }

  parseBuiltinCallExpression() {
    const calleeToken = this.advance();
    const callee = calleeToken.lexeme.toLowerCase();

    this.consume(TOKEN_KINDS.LPAREN, `Expected '(' after '${callee}'`);

    const args = [];
    if (callee === "fixed") {
      if (!this.match(TOKEN_KINDS.RPAREN)) {
        args.push(this.parseValueExpression());

        while (this.match(TOKEN_KINDS.COMMA)) {
          this.advance();
          args.push(this.parseValueExpression());
        }
      }
    } else if (!this.match(TOKEN_KINDS.RPAREN)) {
      args.push(this.parseAdditiveExpression());

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        args.push(this.parseAdditiveExpression());
      }
    }

    this.consume(TOKEN_KINDS.RPAREN, `Expected ')' after '${callee}' arguments`);

    if (callee === "round") {
      if (args.length < 1 || args.length > 2) {
        throw this.error(calleeToken, "round expects one value argument and an optional precision argument");
      }

      if (args.length === 2) {
        this.assertRoundPrecision(args[1], calleeToken);
      }
    } else if (callee === "fixed") {
      if (args.length !== 2) {
        throw this.error(calleeToken, "fixed expects one value argument and one precision argument");
      }

      this.assertFixedPrecision(args[1], calleeToken);
    } else if (args.length !== 1) {
      throw this.error(calleeToken, `${callee} expects exactly one argument`);
    }

    return {
      type: "BuiltinCallExpression",
      callee,
      args
    };
  }

  parseNameUntil(boundaryKinds) {
    const nameParts = [];

    while (!this.isAtEnd() && !boundaryKinds.has(this.peek().kind)) {
      if (this.startsSoftWordPhrase()) {
        throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
      }

      if (!this.match(TOKEN_KINDS.WORD)) {
        throw this.error(this.peek(), "Expected a variable name");
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), "Expected a variable name");
    }

    return nameParts;
  }

  consumeLineEnd(message) {
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }

    if (this.match(TOKEN_KINDS.NEWLINE)) {
      this.advance();
      return;
    }

    if (this.isAtEnd() || this.match(TOKEN_KINDS.DEDENT)) {
      return;
    }

    throw this.error(this.peek(), message);
  }

  ensureNoRawArithmetic() {
    if (ARITHMETIC_TOKENS.has(this.peek().kind)) {
      throw this.error(this.peek(), "Arithmetic expressions must be wrapped in 'the result of (...)'");
    }
  }

  assertRoundPrecision(expression, token) {
    if (expression.type !== "LiteralExpression" || expression.valueType !== "number") {
      throw this.error(token, "round precision must be a non-negative integer literal");
    }

    if (!Number.isInteger(expression.value) || expression.value < 0) {
      throw this.error(token, "round precision must be a non-negative integer literal");
    }
  }

  assertFixedPrecision(expression, token) {
    if (expression.type !== "LiteralExpression" || expression.valueType !== "number") {
      throw this.error(token, "fixed precision must be a non-negative integer literal");
    }

    if (!Number.isInteger(expression.value) || expression.value < 0) {
      throw this.error(token, "fixed precision must be a non-negative integer literal");
    }
  }

  toBooleanValue(lexeme) {
    return ["true", "yes", "on", "y"].includes(lexeme.toLowerCase());
  }

  consumeStatementEnd() {
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }

    if (this.match(TOKEN_KINDS.NEWLINE)) {
      this.advance();
      return;
    }

    if (this.isAtEnd() || this.match(TOKEN_KINDS.DEDENT)) {
      return;
    }

    if (
      this.match(TOKEN_KINDS.SET) ||
      this.match(TOKEN_KINDS.PRINT) ||
      this.match(TOKEN_KINDS.CREATE) ||
      this.match(TOKEN_KINDS.TAKE) ||
      this.match(TOKEN_KINDS.WHEN) ||
      this.match(TOKEN_KINDS.CHECK) ||
      this.match(TOKEN_KINDS.FOR) ||
      this.match(TOKEN_KINDS.REPEAT) ||
      this.match(TOKEN_KINDS.KEEP)
    ) {
      return;
    }

    throw this.error(this.peek(), `Unexpected token ${this.peek().lexeme || this.peek().kind}`);
  }

  skipIgnorable() {
    while (this.match(TOKEN_KINDS.NEWLINE) || this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
  }

  skipSoftWords() {
    while (this.startsSoftWordPhrase()) {
      this.advanceSoftWordPhrase();
    }
  }

  checkResultPhrase() {
    return (
      this.match(TOKEN_KINDS.THE) &&
      this.tokens[this.index + 1]?.kind === TOKEN_KINDS.RESULT &&
      this.tokens[this.index + 2]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + 2]?.lexeme.toLowerCase() === "of"
    );
  }

  checkListPhrase() {
    return (
      this.match(TOKEN_KINDS.THE) &&
      this.tokens[this.index + 1]?.kind === TOKEN_KINDS.LIST &&
      this.tokens[this.index + 2]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + 2]?.lexeme.toLowerCase() === "of"
    );
  }

  consumeWord(expectedLexeme, message) {
    const token = this.peek();
    if (token.kind === TOKEN_KINDS.WORD && token.lexeme.toLowerCase() === expectedLexeme.toLowerCase()) {
      return this.advance();
    }

    throw this.error(token, message);
  }

  matchWord(expectedLexeme) {
    return this.peek().kind === TOKEN_KINDS.WORD && this.peek().lexeme.toLowerCase() === expectedLexeme.toLowerCase();
  }

  consume(kind, message) {
    if (this.match(kind)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
  }

  match(kind) {
    return this.peek().kind === kind;
  }

  startsSoftWordPhrase() {
    return this.checkWordSequence("so") || this.checkWordSequence("then") || this.checkWordSequence("that's", "why");
  }

  advanceSoftWordPhrase() {
    if (this.checkWordSequence("so") || this.checkWordSequence("then")) {
      this.advance();
      return;
    }

    if (this.checkWordSequence("that's", "why")) {
      this.advance();
      this.advance();
    }
  }

  checkWordSequence(...words) {
    for (let offset = 0; offset < words.length; offset += 1) {
      const token = this.tokens[this.index + offset];
      if (!token || token.kind !== TOKEN_KINDS.WORD || token.lexeme.toLowerCase() !== words[offset]) {
        return false;
      }
    }

    return true;
  }

  advance() {
    if (!this.isAtEnd()) {
      this.index += 1;
    }

    return this.tokens[this.index - 1];
  }

  peek() {
    return this.tokens[this.index];
  }

  isAtEnd() {
    return this.peek().kind === TOKEN_KINDS.EOF;
  }

  error(token, message) {
    return new ParserError(message, token);
  }
}
