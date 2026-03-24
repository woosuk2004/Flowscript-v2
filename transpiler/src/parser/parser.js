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
    this.loopDepth = 0;
    this.actionDepth = 0;
    this.functionDepth = 0;
    this.returnAllowanceStack = [];
    this.blockContextStack = [];
    this.expressionBoundaryStack = [];
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

    if (this.match(TOKEN_KINDS.HOW)) {
      return this.parseFunctionDeclarationStatement();
    }

    if (this.match(TOKEN_KINDS.SHARE)) {
      return this.parseShareStatement();
    }

    if (this.match(TOKEN_KINDS.USE)) {
      return this.parseUseStatement();
    }

    if (this.match(TOKEN_KINDS.WAIT)) {
      return this.parseWaitStatement();
    }

    if (this.match(TOKEN_KINDS.TRY)) {
      return this.parseTryStatement();
    }

    if (this.match(TOKEN_KINDS.ENSURE)) {
      return this.parseEnsureStatement();
    }

    if (this.match(TOKEN_KINDS.VERIFY)) {
      return this.parseVerifyStatement();
    }

    if (this.match(TOKEN_KINDS.RETURN)) {
      return this.parseReturnStatement();
    }

    if (this.match(TOKEN_KINDS.CREATE)) {
      return this.parseCreateStatement();
    }

    if (this.match(TOKEN_KINDS.DEFINE)) {
      return this.parseTypeDeclarationStatement();
    }

    if (this.match(TOKEN_KINDS.ASK)) {
      return this.parseActionCallStatement();
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

    if (this.match(TOKEN_KINDS.BREAK)) {
      return this.parseBreakStatement();
    }

    if (this.match(TOKEN_KINDS.CONTINUE)) {
      return this.parseContinueStatement();
    }

    if (this.match(TOKEN_KINDS.KEEP)) {
      return this.parseWhileStatement();
    }

    if (this.matchWord("cancel")) {
      return this.parseCancelStatement();
    }

    if (this.matchWord("after")) {
      return this.parseAfterStatement();
    }

    if (this.match(TOKEN_KINDS.IN) && this.checkBackgroundClause()) {
      return this.parseBackgroundStatement();
    }

    if (this.peek().kind === TOKEN_KINDS.WORD || this.checkFunctionCallStatementStart()) {
      return this.parseFunctionCallStatement();
    }

    throw this.error(this.peek(), `Unsupported statement starting with ${this.peek().lexeme || this.peek().kind}`);
  }

  parseSetStatement() {
    this.consume(TOKEN_KINDS.SET, "Expected 'Set' to start an assignment statement");
    const target = this.parseSetTarget();

    if (this.match(TOKEN_KINDS.ALWAYS)) {
      if (target.type !== "VariableAssignmentTarget") {
        throw this.error(this.peek(), "Reactive assignments only support variable names in this version of FlowScript");
      }

      this.advance();
      this.consume(TOKEN_KINDS.IS, "Expected 'is' after 'always'");
      const expression = this.parseResultExpression();
      return {
        type: "ReactiveSetStatement",
        nameParts: target.nameParts,
        expression
      };
    }

    this.consume(TOKEN_KINDS.TO, "Expected 'to' after the assignment name");
    const value = this.parseValueExpression();
    this.ensureNoRawArithmetic();
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "SetStatement",
      target,
      nameParts: target.type === "VariableAssignmentTarget" ? target.nameParts : null,
      value,
      terminated
    };
  }

  parseSetTarget() {
    if (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS)) {
      return this.parseSelfPropertyAssignmentTarget();
    }

    if (this.checkPropertyAccessPhrase()) {
      return this.parsePropertyAssignmentTarget();
    }

    return {
      type: "VariableAssignmentTarget",
      nameParts: this.parseNameUntil(new Set([TOKEN_KINDS.TO, TOKEN_KINDS.ALWAYS]))
    };
  }

  parsePropertyAssignmentTarget() {
    this.consumeOptionalArticle();
    const propertyNameParts = this.parseNormalizedName({
      boundaryWords: new Set(["of"]),
      errorMessage: "Expected a property name"
    });
    this.consumeWord("of", "Expected 'of' after the property name");
    const instanceNameParts = this.parseNormalizedName({
      boundaryKinds: new Set([TOKEN_KINDS.TO, TOKEN_KINDS.ALWAYS]),
      errorMessage: "Expected an instance name"
    });

    return {
      type: "PropertyAssignmentTarget",
      propertyNameParts,
      instanceNameParts
    };
  }

  parseSelfPropertyAssignmentTarget() {
    if (this.actionDepth === 0) {
      throw this.error(this.peek(), "its is only allowed inside actions");
    }

    this.consume(TOKEN_KINDS.ITS, "Expected 'its' in a self property assignment");
    return {
      type: "SelfPropertyAssignmentTarget",
      propertyNameParts: this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.TO, TOKEN_KINDS.ALWAYS]),
        errorMessage: "Expected a property name after 'its'"
      })
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

  parseReturnStatement() {
    if (this.functionDepth > 0) {
      if (this.returnAllowanceStack.at(-1) !== true) {
        throw this.error(this.peek(), "Return is only allowed inside functions that declare a return type");
      }
    } else if (this.actionDepth > 0) {
      if (this.returnAllowanceStack.at(-1) !== true) {
        throw this.error(this.peek(), "Return is only allowed inside actions that declare a return type");
      }
    } else {
      throw this.error(this.peek(), "Return is only allowed inside actions that declare a return type");
    }

    this.consume(TOKEN_KINDS.RETURN, "Expected 'Return' to start a return statement");
    const value = this.parseValueExpression();
    this.ensureNoRawArithmetic();
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "ReturnStatement",
      value,
      terminated
    };
  }

  parseEnsureStatement() {
    if (this.currentBlockContext() !== "function") {
      throw this.error(this.peek(), "Ensure is only allowed at the top level of a function body");
    }

    this.consume(TOKEN_KINDS.ENSURE, "Expected 'Ensure' to start a pre-condition");
    const condition = this.parseValueExpressionWithBoundaries(new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]));
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "EnsureStatement",
      condition,
      terminated
    };
  }

  parseVerifyStatement() {
    if (this.currentBlockContext() !== "function") {
      throw this.error(this.peek(), "Verify is only allowed at the top level of a function body");
    }

    this.consume(TOKEN_KINDS.VERIFY, "Expected 'Verify' to start a post-condition");
    const condition = this.parseValueExpressionWithBoundaries(new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]));
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "VerifyStatement",
      condition,
      terminated
    };
  }

  parseCollectionDeclarationStatement() {
    this.consume(TOKEN_KINDS.CREATE, "Expected 'Create' to start a collection declaration");
    this.consumeOptionalArticle();
    return this.parseCollectionDeclarationStatementRest();
  }

  parseCreateStatement() {
    this.consume(TOKEN_KINDS.CREATE, "Expected 'Create' to start a declaration or instance creation");
    this.consumeOptionalArticle();

    if (this.match(TOKEN_KINDS.LIST) || this.match(TOKEN_KINDS.SET)) {
      return this.parseCollectionDeclarationStatementRest();
    }

    return this.parseInstanceCreationStatementRest();
  }

  parseCollectionDeclarationStatementRest() {
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

  parseFunctionDeclarationStatement() {
    if (this.blockContextStack.length > 0) {
      throw this.error(this.peek(), "Functions may only be declared at the top level");
    }

    this.consume(TOKEN_KINDS.HOW, "Expected 'How' to start a function declaration");
    this.consume(TOKEN_KINDS.TO, "Expected 'to' after 'How'");

    const nameParts = this.parseNormalizedName({
      boundaryKinds: new Set([TOKEN_KINDS.COLON]),
      boundaryWords: new Set(["using"]),
      errorMessage: "Expected a function name",
      stopAtAndReturnsPhrase: true
    });

    const params = [];
    if (this.matchWord("using")) {
      this.advance();
      params.push(
        this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.COLON]),
          errorMessage: "Expected a function parameter name",
          stopAtAndSeparator: true,
          stopAtAndReturnsPhrase: true
        })
      );

      while (this.match(TOKEN_KINDS.AND) && !this.checkAndReturnsPhrase()) {
        this.advance();
        params.push(
          this.parseNormalizedName({
            boundaryKinds: new Set([TOKEN_KINDS.COLON]),
            errorMessage: "Expected a function parameter name",
            stopAtAndSeparator: true,
            stopAtAndReturnsPhrase: true
          })
        );
      }
    }

    let returnType = null;
    if (this.checkAndReturnsPhrase()) {
      this.advance();
      this.consume(TOKEN_KINDS.RETURNS, "Expected 'returns' after 'and'");
      returnType = this.parseTypeReference();
    }

    const body = this.parseFunctionBlock(returnType !== null, nameParts);

    return {
      type: "FunctionDeclarationStatement",
      nameParts,
      params,
      returnType,
      body
    };
  }

  parseShareStatement() {
    if (this.blockContextStack.length > 0) {
      throw this.error(this.peek(), "Share statements may only appear at the top level");
    }

    this.consume(TOKEN_KINDS.SHARE, "Expected 'Share' to start an export statement");
    const namePartsList = [
      this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]),
        errorMessage: "Expected a shared name",
        stopAtAndSeparator: true
      })
    ];

    while (this.match(TOKEN_KINDS.AND)) {
      this.advance();
      namePartsList.push(
        this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]),
          errorMessage: "Expected a shared name",
          stopAtAndSeparator: true
        })
      );
    }

    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "ShareStatement",
      namePartsList,
      terminated
    };
  }

  parseUseStatement() {
    if (this.blockContextStack.length > 0) {
      throw this.error(this.peek(), "Use statements may only appear at the top level");
    }

    this.consume(TOKEN_KINDS.USE, "Expected 'Use' to start an import statement");

    if (this.match(TOKEN_KINDS.STRING)) {
      const sourcePath = JSON.parse(this.advance().lexeme);
      this.consumeWord("as", "Expected 'as' after the module path");
      const aliasNameParts = this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]),
        errorMessage: "Expected a module alias name"
      });

      const terminated = this.match(TOKEN_KINDS.DOT);
      if (terminated) {
        this.advance();
      }

      return {
        type: "UseModuleAliasStatement",
        sourcePath,
        aliasNameParts,
        terminated
      };
    }

    const imports = [];
    let currentImportName = [];

    while (!this.isAtEnd()) {
      if (this.startsSoftWordPhrase()) {
        throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
      }

      if (this.matchWord("from") && this.tokens[this.index + 1]?.kind === TOKEN_KINDS.STRING) {
        if (currentImportName.length === 0) {
          throw this.error(this.peek(), "Expected an imported name");
        }

        imports.push(currentImportName);
        break;
      }

      if (this.match(TOKEN_KINDS.AND)) {
        if (currentImportName.length === 0) {
          throw this.error(this.peek(), "Expected an imported name");
        }

        imports.push(currentImportName);
        currentImportName = [];
        this.advance();
        continue;
      }

      if (this.isIgnorableArticleToken(this.peek())) {
        this.advance();
        continue;
      }

      if (this.peek().kind !== TOKEN_KINDS.WORD && this.peek().kind !== TOKEN_KINDS.TO) {
        throw this.error(this.peek(), "Expected an imported name");
      }

      currentImportName.push(this.advance().lexeme);
    }

    this.consumeWord("from", "Expected 'from' after the imported name list");
    const sourceToken = this.consume(TOKEN_KINDS.STRING, "Expected a quoted relative .flow path after 'from'");
    const sourcePath = JSON.parse(sourceToken.lexeme);

    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "UseNamedStatement",
      imports,
      sourcePath,
      terminated
    };
  }

  parseBackgroundStatement() {
    this.consume(TOKEN_KINDS.IN, "Expected 'In' to start a background block");
    this.consumeOptionalArticle();
    this.consumeWord("background", "Expected 'background' after 'In'");
    const body = this.parseBlock("generic");

    return {
      type: "BackgroundStatement",
      body
    };
  }

  parseWaitStatement() {
    this.consume(TOKEN_KINDS.WAIT, "Expected 'Wait' to start a wait statement");
    const target = this.parseWaitTarget();
    const timeout = this.parseOptionalWaitTimeoutClause();
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "WaitStatement",
      target,
      timeout,
      terminated
    };
  }

  parseTryStatement() {
    this.consume(TOKEN_KINDS.TRY, "Expected 'Try' to start a try block");
    this.consume(TOKEN_KINDS.THIS, "Expected 'this' after 'Try'");
    const tryBody = this.parseBlock("generic");
    this.skipIgnorable();
    this.consumeWord("if", "Expected 'If it fails:' after the try block");
    this.consumeWord("it", "Expected 'it' after 'If'");
    this.consumeWord("fails", "Expected 'fails' after 'If it'");
    let errorNameParts = null;
    if (this.matchWord("as")) {
      this.advance();
      errorNameParts = this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COLON]),
        errorMessage: "Expected an error binding name after 'If it fails as'"
      });
    }
    const failureBody = this.parseBlock("generic");
    this.skipIgnorable();

    let finallyBody = null;
    if (this.checkInAnyCasePhrase()) {
      this.consume(TOKEN_KINDS.IN, "Expected 'In any case:' to start a cleanup block");
      this.consumeWord("any", "Expected 'any' after 'In'");
      this.consume(TOKEN_KINDS.CASE, "Expected 'case' after 'In any'");
      finallyBody = this.parseBlock("generic");
    }

    return {
      type: "TryStatement",
      tryBody,
      errorNameParts,
      failureBody,
      finallyBody
    };
  }

  parseCancelStatement() {
    this.consumeWord("cancel", "Expected 'Cancel' to start a cancel statement");
    const target = this.parseValueExpressionWithBoundaries(new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]));
    this.ensureNoRawArithmetic();
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "CancelStatement",
      target,
      terminated
    };
  }

  parseAfterStatement() {
    this.consumeWord("after", "Expected 'After' to start a delayed block");
    const delay = this.parseDelayDuration();
    const body = this.parseBlock("generic");

    return {
      type: "DelayedStatement",
      delay,
      body
    };
  }

  parseTypeDeclarationStatement() {
    this.consume(TOKEN_KINDS.DEFINE, "Expected 'Define' to start a type declaration");
    this.consumeOptionalArticle();
    this.consume(TOKEN_KINDS.TYPE, "Expected 'Type' after 'Define'");
    this.consumeWord("called", "Expected 'called' after 'Define a Type'");
    const nameParts = this.parseNormalizedName({
      boundaryWords: new Set(["which"]),
      boundaryKinds: new Set([TOKEN_KINDS.COLON]),
      errorMessage: "Expected a type name"
    });

    let parentTypeNameParts = null;
    if (this.matchWord("which")) {
      this.advance();
      this.consume(TOKEN_KINDS.IS, "Expected 'is' after 'which'");
      this.consumeOptionalArticle();

      if (this.matchWord("kind")) {
        this.advance();
        this.consumeWord("of", "Expected 'of' after 'kind'");
      }

      parentTypeNameParts = this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COLON]),
        errorMessage: "Expected a parent type name"
      });
    }

    this.consume(TOKEN_KINDS.COLON, "Expected ':' after the type header");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after the type header");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented type block");

    const properties = [];
    const actions = [];
    let createdHook = null;
    let updatedHook = null;
    const beforeHooks = [];
    const afterHooks = [];
    this.skipIgnorable();

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      const member = this.parseTypeMember();

      if (member.type === "TypePropertyDeclaration") {
        properties.push(member);
        this.consumeLineEnd("Expected the end of the property declaration");
      } else if (member.type === "TypeLifecycleHook") {
        if (member.hookKind === "created") {
          if (createdHook) {
            throw this.error(this.peek(), "A type can only define one 'When created:' hook");
          }

          createdHook = member;
        } else if (member.hookKind === "updated") {
          if (updatedHook) {
            throw this.error(this.peek(), "A type can only define one 'When updated:' hook");
          }

          updatedHook = member;
        }
      } else if (member.type === "TypeActionHookDeclaration") {
        if (member.hookKind === "before") {
          beforeHooks.push(member);
        } else {
          afterHooks.push(member);
        }
      } else {
        actions.push(member);
      }

      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the type block");

    return {
      type: "TypeDeclarationStatement",
      nameParts,
      parentTypeNameParts,
      properties,
      actions,
      createdHook,
      updatedHook,
      beforeHooks,
      afterHooks
    };
  }

  parseTypeMember() {
    if (this.match(TOKEN_KINDS.WHEN)) {
      return this.parseTypeInitializationHook();
    }

    if (this.matchWord("before") || this.matchWord("after")) {
      return this.parseTypeActionHookDeclaration();
    }

    this.consumeWord("it", "Expected 'It' to start a type member declaration");

    if (this.matchWord("has")) {
      return this.parseTypePropertyDeclaration();
    }

    if (this.matchWord("can")) {
      return this.parseTypeActionDeclaration();
    }

    throw this.error(this.peek(), "Expected 'has' or 'can' after 'It'");
  }

  parseTypeInitializationHook() {
    this.consume(TOKEN_KINDS.WHEN, "Expected 'When' to start an initialization hook");
    const hookKeyword = this.peek();
    if (!this.matchWord("created") && !this.matchWord("updated")) {
      throw this.error(hookKeyword, "Expected 'created' or 'updated' after 'When'");
    }

    const hookKind = this.advance().lexeme.toLowerCase();
    const params = [];

    if (this.matchWord("using")) {
      if (hookKind !== "created") {
        throw this.error(this.peek(), "Only 'When created:' may declare parameters");
      }

      this.advance();
      params.push(this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
        errorMessage: "Expected a constructor parameter name"
      }));

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        params.push(this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
          errorMessage: "Expected a constructor parameter name"
        }));
      }
    }

    const body = this.parseActionBlock();
    return {
      type: "TypeLifecycleHook",
      hookKind,
      params,
      body
    };
  }

  parseTypePropertyDeclaration() {
    this.consumeWord("has", "Expected 'has' after 'It'");
    this.consumeOptionalArticle();
    const accessLevel = this.parseOptionalAccessModifier();
    const nameParts = this.parseNormalizedName({
      boundaryKinds: new Set([TOKEN_KINDS.LPAREN]),
      errorMessage: "Expected a property name"
    });
    this.consume(TOKEN_KINDS.LPAREN, "Expected '(' after the property name");
    const valueType = this.parseTypeReference();

    let defaultValue = null;
    if (this.match(TOKEN_KINDS.COMMA)) {
      this.advance();
      this.consume(TOKEN_KINDS.DEFAULT, "Expected 'default' after ','");
      this.consume(TOKEN_KINDS.IS, "Expected 'is' after 'default'");
      defaultValue = this.parseValueExpression();
      this.ensureNoRawArithmetic();
    }

    this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the property type");
    if (this.match(TOKEN_KINDS.DOT)) {
      this.advance();
    }

    return {
      type: "TypePropertyDeclaration",
      accessLevel,
      nameParts,
      valueType,
      defaultValue
    };
  }

  parseTypeActionHookDeclaration() {
    const hookKeyword = this.peek();
    if (!this.matchWord("before") && !this.matchWord("after")) {
      throw this.error(hookKeyword, "Expected 'Before' or 'After' to start an action hook");
    }

    const hookKind = this.advance().lexeme.toLowerCase();
    const actionNameToken = this.consume(TOKEN_KINDS.STRING, `Expected a quoted action name after '${hookKind}'`);
    const actionName = JSON.parse(actionNameToken.lexeme);
    const params = [];

    if (this.matchWord("using")) {
      this.advance();
      params.push(this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
        errorMessage: "Expected a hook parameter name"
      }));

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        params.push(this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
          errorMessage: "Expected a hook parameter name"
        }));
      }
    }

    const body = this.parseActionBlock();
    return {
      type: "TypeActionHookDeclaration",
      hookKind,
      actionName,
      params,
      body
    };
  }

  parseTypeActionDeclaration() {
    this.consumeWord("can", "Expected 'can' after 'It'");
    const actionNameToken = this.consume(TOKEN_KINDS.STRING, "Expected a quoted action name after 'It can'");
    const actionName = JSON.parse(actionNameToken.lexeme);
    let accessLevel = "public";
    if (this.matchWord("as")) {
      this.advance();
      accessLevel = this.parseRequiredAccessModifier();
    }
    const params = [];

    if (this.matchWord("using")) {
      this.advance();
      params.push(this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
        errorMessage: "Expected an action parameter name"
      }));

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        params.push(this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA]),
          errorMessage: "Expected an action parameter name"
        }));
      }
    }

    let returnType = null;
    if (this.match(TOKEN_KINDS.AND)) {
      this.advance();
      this.consume(TOKEN_KINDS.RETURNS, "Expected 'returns' after 'and'");
      returnType = this.parseTypeReference();
    }

    const body = this.parseActionBlock(returnType !== null);
    return {
      type: "TypeActionDeclaration",
      actionName,
      accessLevel,
      params,
      returnType,
      body
    };
  }

  parseInstanceCreationStatementRest() {
    const typeNameParts = this.parseNormalizedName({
      boundaryWords: new Set(["called"]),
      errorMessage: "Expected a type name after 'Create'"
    });
    this.consumeWord("called", "Expected 'called' after the type name");
    const nameParts = this.parseNormalizedName({
      boundaryKinds: new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]),
      boundaryWords: new Set(["using"]),
      errorMessage: "Expected an instance name"
    });

    let constructorArgs = [];
    let initializers = [];

    if (this.matchWord("using")) {
      this.advance();
      constructorArgs = this.parseDelimitedValueExpressionList(new Set([TOKEN_KINDS.COLON, TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]));
      this.ensureNoRawArithmetic();
    }

    if (this.match(TOKEN_KINDS.COLON)) {
      initializers = this.parseInstanceInitializerBlock();
      return {
        type: "InstanceCreationStatement",
        typeNameParts,
        nameParts,
        constructorArgs,
        initializers
      };
    }

    if (this.match(TOKEN_KINDS.DOT)) {
      this.advance();
    }

    return {
      type: "InstanceCreationStatement",
      typeNameParts,
      nameParts,
      constructorArgs,
      initializers
    };
  }

  parseInstanceInitializerBlock() {
    this.consume(TOKEN_KINDS.COLON, "Expected ':' before the instance initializer block");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented instance initializer block");

    const initializers = [];
    this.skipIgnorable();

    while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
      const nameParts = this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.IS]),
        errorMessage: "Expected a property name in the instance initializer"
      });
      this.consume(TOKEN_KINDS.IS, "Expected 'is' after the property name");
      const value = this.parseValueExpression();
      this.ensureNoRawArithmetic();
      if (this.match(TOKEN_KINDS.DOT)) {
        this.advance();
      }

      initializers.push({ nameParts, value });
      this.consumeLineEnd("Expected the end of the instance initializer");
      this.skipIgnorable();
    }

    this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the instance initializer block");
    return initializers;
  }

  parseActionCallTarget() {
    let targetType = "InstanceReference";
    let targetNameParts = null;

    if (this.match(TOKEN_KINDS.ITSELF)) {
      if (this.actionDepth === 0) {
        throw this.error(this.peek(), "itself is only allowed inside actions");
      }

      this.advance();
      targetType = "SelfActionTarget";
    } else if (this.match(TOKEN_KINDS.SUPER)) {
      if (this.actionDepth === 0) {
        throw this.error(this.peek(), "super is only allowed inside actions and lifecycle hooks");
      }

      this.advance();
      targetType = "SuperActionTarget";
    } else {
      targetNameParts = this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.TO]),
        errorMessage: "Expected an instance name after 'Ask'"
      });
    }

    return {
      targetType,
      targetNameParts
    };
  }

  parseActionInvocation() {
    this.consume(TOKEN_KINDS.ASK, "Expected 'Ask' to start an action call");
    return this.parseActionInvocationRest();
  }

  parseActionInvocationAfterAskingWord() {
    this.consumeWord("asking", "Expected 'asking' in 'the result of asking ...'");
    return this.parseActionInvocationRest();
  }

  parseActionInvocationRest() {
    const { targetType, targetNameParts } = this.parseActionCallTarget();

    this.consume(TOKEN_KINDS.TO, "Expected 'to' after the action target");
    const actionNameToken = this.consume(TOKEN_KINDS.STRING, "Expected a quoted action name after 'to'");
    const actionName = JSON.parse(actionNameToken.lexeme);
    const args = [];

    if (this.matchWord("using")) {
      this.advance();
      args.push(this.parseValueExpression());
      this.ensureNoRawArithmetic();

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        args.push(this.parseValueExpression());
        this.ensureNoRawArithmetic();
      }
    }

    return {
      targetType,
      targetNameParts,
      actionName,
      args
    };
  }

  parseActionCallStatement() {
    const invocation = this.parseActionInvocation();

    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "ActionCallStatement",
      ...invocation,
      terminated
    };
  }

  parseFunctionCallStatement() {
    const startToken = this.peek();
    const invocation = this.parseFunctionInvocation(false);

    if (
      !this.match(TOKEN_KINDS.DOT) &&
      !this.match(TOKEN_KINDS.NEWLINE) &&
      !this.match(TOKEN_KINDS.EOF) &&
      !this.match(TOKEN_KINDS.DEDENT) &&
      !this.match(TOKEN_KINDS.COMMENT)
    ) {
      throw this.error(startToken, `Unsupported statement starting with ${startToken.lexeme || startToken.kind}`);
    }

    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "FunctionCallStatement",
      ...invocation,
      terminated
    };
  }

  parseFunctionCallExpression() {
    return {
      type: "FunctionCallExpression",
      ...this.parseFunctionInvocation(true)
    };
  }

  parseFunctionInvocation(valueContext = false) {
    const boundaryKinds = new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF, TOKEN_KINDS.COLON, TOKEN_KINDS.COMMA, TOKEN_KINDS.RPAREN]);
    const callee = this.parseFunctionInvocationTarget(boundaryKinds);

    const args = [];
    if (this.matchWord("using")) {
      this.advance();
      args.push(...this.parseAndSeparatedValueExpressions(boundaryKinds));
      this.ensureNoRawArithmetic();
    }

    if (!valueContext && args.length === 0 && this.peek().kind === TOKEN_KINDS.AND) {
      throw this.error(this.peek(), "Function call arguments must follow 'using'");
    }

    return {
      callee,
      args
    };
  }

  parseFunctionInvocationTarget(boundaryKinds) {
    const invocationBoundaryKinds = new Set(boundaryKinds);

    if (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS)) {
      return this.parseSelfPropertyExpression(invocationBoundaryKinds);
    }

    if (this.checkPropertyAccessPhrase()) {
      return this.parsePropertyAccessExpression(invocationBoundaryKinds, new Set(["using"]));
    }

    return {
      type: "ReferenceExpression",
      nameParts: this.parseNormalizedName({
        boundaryKinds: invocationBoundaryKinds,
        boundaryWords: new Set(["using"]),
        errorMessage: "Expected a function name or callable reference",
        extraNameKinds: new Set([TOKEN_KINDS.TO])
      })
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
      this.consumeOptionalArticle();
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
      this.consumeOptionalArticle();
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
    const body = this.parseLoopBlock();

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
    const body = this.parseLoopBlock();

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

    const body = this.parseLoopBlock();

    return {
      type: "WhileStatement",
      condition,
      body
    };
  }

  parseBreakStatement() {
    if (this.loopDepth === 0) {
      throw this.error(this.peek(), "Break is only allowed inside loops");
    }

    this.consume(TOKEN_KINDS.BREAK, "Expected 'Break' to start a break statement");
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "BreakStatement",
      terminated
    };
  }

  parseContinueStatement() {
    if (this.loopDepth === 0) {
      throw this.error(this.peek(), "Continue is only allowed inside loops");
    }

    this.consume(TOKEN_KINDS.CONTINUE, "Expected 'Continue' to start a continue statement");
    const terminated = this.match(TOKEN_KINDS.DOT);
    if (terminated) {
      this.advance();
    }

    return {
      type: "ContinueStatement",
      terminated
    };
  }

  parseLoopBlock() {
    this.loopDepth += 1;

    try {
      return this.parseBlock("generic");
    } finally {
      this.loopDepth -= 1;
    }
  }

  parseActionBlock(allowReturn = false) {
    this.actionDepth += 1;
    this.returnAllowanceStack.push(allowReturn);

    try {
      return this.parseBlock("action");
    } finally {
      this.returnAllowanceStack.pop();
      this.actionDepth -= 1;
    }
  }

  parseFunctionBlock(allowReturn = false, functionNameParts = []) {
    this.functionDepth += 1;
    this.returnAllowanceStack.push(allowReturn);

    try {
      const body = this.parseBlock("function");
      this.validateFunctionBody(body, allowReturn, functionNameParts);
      return body;
    } finally {
      this.returnAllowanceStack.pop();
      this.functionDepth -= 1;
    }
  }

  parseBlock(blockContext = "generic") {
    this.consume(TOKEN_KINDS.COLON, "Expected ':' before a block");
    if (this.match(TOKEN_KINDS.COMMENT)) {
      this.advance();
    }
    this.consume(TOKEN_KINDS.NEWLINE, "Expected a newline after ':'");
    this.consume(TOKEN_KINDS.INDENT, "Expected an indented block");
    this.blockContextStack.push(blockContext);

    const body = [];
    try {
      this.skipIgnorable();

      while (!this.match(TOKEN_KINDS.DEDENT) && !this.isAtEnd()) {
        body.push(this.parseStatement());
        this.consumeStatementEnd();
        this.skipIgnorable();
      }

      this.consume(TOKEN_KINDS.DEDENT, "Expected the end of the block");
      return body;
    } finally {
      this.blockContextStack.pop();
    }
  }

  validateFunctionBody(body, allowReturn, functionNameParts) {
    let phase = "ensure";
    let sawReturn = false;
    const functionDisplayName = functionNameParts.length > 0 ? functionNameParts.join(" ") : "anonymous function";

    for (let index = 0; index < body.length; index += 1) {
      const statement = body[index];

      if (statement.type === "EnsureStatement") {
        if (phase !== "ensure") {
          throw this.error(this.peek(), `Ensure statements must appear at the top of function "${functionDisplayName}"`);
        }

        continue;
      }

      if (statement.type === "VerifyStatement") {
        if (phase === "afterReturn") {
          throw this.error(this.peek(), `Verify statements must appear before the final Return in function "${functionDisplayName}"`);
        }

        phase = "verify";
        continue;
      }

      if (statement.type === "ReturnStatement") {
        if (!allowReturn) {
          throw this.error(this.peek(), `Function "${functionDisplayName}" does not declare a return type`);
        }

        if (index !== body.length - 1) {
          throw this.error(this.peek(), `Returning function "${functionDisplayName}" must end with a single final Return`);
        }

        sawReturn = true;
        phase = "afterReturn";
        continue;
      }

      if (phase === "verify" || phase === "afterReturn") {
        throw this.error(this.peek(), `Ordinary statements must appear before Verify clauses in function "${functionDisplayName}"`);
      }

      phase = "body";
    }

    if (allowReturn && !sawReturn) {
      throw this.error(this.peek(), `Returning function "${functionDisplayName}" must end with a Return statement`);
    }
  }

  parseValueExpression() {
    return this.parseOrExpression();
  }

  parseValueExpressionWithBoundaries(boundaryKinds) {
    this.expressionBoundaryStack.push(boundaryKinds);

    try {
      return this.parseValueExpression();
    } finally {
      this.expressionBoundaryStack.pop();
    }
  }

  parseAndSeparatedValueExpressions(boundaryKinds) {
    const values = [this.parseValueExpressionWithBoundaries(new Set([...boundaryKinds, TOKEN_KINDS.AND]))];

    while (this.match(TOKEN_KINDS.AND) && !this.checkAndReturnsPhrase()) {
      this.advance();
      values.push(this.parseValueExpressionWithBoundaries(new Set([...boundaryKinds, TOKEN_KINDS.AND])));
    }

    return values;
  }

  parseOrExpression() {
    let expression = this.parseAndExpression();

    while (this.match(TOKEN_KINDS.OR) && !this.isCurrentExpressionBoundary(TOKEN_KINDS.OR)) {
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

    while (this.match(TOKEN_KINDS.AND) && !this.isCurrentExpressionBoundary(TOKEN_KINDS.AND)) {
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
      if (this.match(TOKEN_KINDS.IS) && this.tokens[this.index + 1]?.kind === TOKEN_KINDS.WORD && this.tokens[this.index + 1]?.lexeme.toLowerCase() === "empty") {
        this.advance();
        this.advance();
        expression = {
          type: "CollectionIsEmptyExpression",
          collection: expression
        };
        continue;
      }

      if (this.match(TOKEN_KINDS.CONTAINS)) {
        this.advance();

        if (this.matchWord("item")) {
          this.advance();
          expression = {
            type: "CollectionContainsExpression",
            collection: expression,
            item: this.parseAtomicValueExpression()
          };
          continue;
        }

        expression = {
          type: "StringOperationExpression",
          operator: "CONTAINS",
          left: expression,
          right: this.parseAtomicValueExpression()
        };
        continue;
      }

      if (this.matchWord("has")) {
        this.advance();

        if (this.matchWord("any")) {
          this.advance();
          expression = {
            type: "CollectionHasExpression",
            mode: "any",
            collection: expression,
            items: this.parseLiteralCollectionItemList()
          };
          continue;
        }

        if (this.matchWord("all")) {
          this.advance();
          expression = {
            type: "CollectionHasExpression",
            mode: "all",
            collection: expression,
            items: this.parseLiteralCollectionItemList()
          };
          continue;
        }

        throw this.error(this.peek(), "Expected 'any' or 'all' after 'has'");
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
    if (this.checkDelayedTaskPhrase()) {
      return this.parseDelayedTaskExpression();
    }

    if (this.checkBackgroundTaskPhrase()) {
      return this.parseBackgroundTaskExpression();
    }

    if (this.checkListPhrase()) {
      return this.parseListExpression();
    }

    if (this.checkAnonymousDoThisPhrase()) {
      return this.parseAnonymousCallableExpression(false);
    }

    if (this.checkResultPhrase()) {
      return this.parseResultExpression();
    }

    if (this.checkNoValuePhrase()) {
      return this.parseNoValueLiteralExpression();
    }

    if (this.matchWord("first")) {
      return this.parseFirstAccessExpression();
    }

    if (this.matchWord("last")) {
      return this.parseLastAccessExpression();
    }

    if (this.checkItemAtIndexPhrase()) {
      return this.parseItemAtIndexExpression();
    }

    if (this.checkItemsFromIndexPhrase()) {
      return this.parseItemsFromIndexRangeExpression();
    }

    if (this.checkIndexOfPhrase()) {
      return this.parseIndexOfExpression();
    }

    if (this.checkCountPhrase()) {
      return this.parseCountExpression();
    }

    if (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS)) {
      return this.parseSelfPropertyExpression();
    }

    if (this.checkPropertyAccessPhrase()) {
      return this.parsePropertyAccessExpression();
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

  parseFirstAccessExpression() {
    const checkpoint = this.index;

    try {
      if (this.checkFirstItemPhrase()) {
        return this.parseFirstItemExpression();
      }

      return this.parseCollectionTakeExpression("first");
    } catch (error) {
      this.index = checkpoint;
      return this.parseReferenceExpression();
    }
  }

  parseLastAccessExpression() {
    const checkpoint = this.index;

    try {
      if (this.checkLastItemPhrase()) {
        return this.parseLastItemExpression();
      }

      return this.parseCollectionTakeExpression("last");
    } catch (error) {
      this.index = checkpoint;
      return this.parseReferenceExpression();
    }
  }

  parseNoValueLiteralExpression() {
    const noToken = this.peek();
    if (noToken.lexeme.toLowerCase() !== "no") {
      throw this.error(noToken, "Expected 'no' in 'no value'");
    }

    this.advance();
    this.consumeWord("value", "Expected 'value' after 'no'");
    return {
      type: "LiteralExpression",
      valueType: "no_value",
      value: null,
      raw: "no value"
    };
  }

  parseFirstItemExpression() {
    this.consumeWord("first", "Expected 'first' in 'first item of ...'");
    this.consumeWord("item", "Expected 'item' after 'first'");
    this.consumeWord("of", "Expected 'of' after 'first item'");
    const collection = this.parseCollectionAccessTargetExpression(new Set(["where"]));

    let where = null;
    if (this.matchWord("where")) {
      this.advance();
      where = this.parseCollectionPredicate();
    }

    return {
      type: "CollectionAccessExpression",
      accessKind: "first",
      collection,
      where
    };
  }

  parseLastItemExpression() {
    this.consumeWord("last", "Expected 'last' in 'last item of ...'");
    this.consumeWord("item", "Expected 'item' after 'last'");
    this.consumeWord("of", "Expected 'of' after 'last item'");
    return {
      type: "CollectionAccessExpression",
      accessKind: "last",
      collection: this.parseCollectionAccessTargetExpression(),
      where: null
    };
  }

  parseItemAtIndexExpression() {
    this.consumeWord("item", "Expected 'item' in 'item at index ... of ...'");
    this.consumeWord("at", "Expected 'at' after 'item'");
    this.consumeWord("index", "Expected 'index' after 'item at'");
    const index = this.parseAtomicValueExpression();
    this.consumeWord("of", "Expected 'of' after the index value");
    return {
      type: "CollectionIndexExpression",
      collection: this.parseCollectionAccessTargetExpression(),
      index
    };
  }

  parseItemsFromIndexRangeExpression() {
    this.consumeWord("items", "Expected 'items' in 'items from index ... to ... of ...'");
    this.consumeWord("from", "Expected 'from' after 'items'");
    this.consumeWord("index", "Expected 'index' after 'items from'");
    const start = this.parseAtomicValueExpression();
    this.consume(TOKEN_KINDS.TO, "Expected 'to' after the start index");
    const end = this.parseAtomicValueExpression();
    this.consumeWord("of", "Expected 'of' after the end index");
    return {
      type: "CollectionSliceExpression",
      collection: this.parseCollectionAccessTargetExpression(),
      start,
      end
    };
  }

  parseCountExpression() {
    this.consumeWord("count", "Expected 'count' in 'count of ...'");
    this.consumeWord("of", "Expected 'of' after 'count'");
    const collection = this.parseCollectionAccessTargetExpression(new Set(["where"]));

    let where = null;
    if (this.matchWord("where")) {
      this.advance();
      where = this.parseCollectionPredicate();
    }

    return {
      type: "CollectionCountExpression",
      collection,
      where
    };
  }

  parseCollectionTakeExpression(side) {
    this.consumeWord(side, `Expected '${side}' in '${side} N items of ...'`);
    const count = this.parseAtomicValueExpression();
    this.consumeWord("items", `Expected 'items' after '${side} <count>'`);
    this.consumeWord("of", "Expected 'of' after the item count");
    return {
      type: "CollectionTakeExpression",
      side,
      count,
      collection: this.parseCollectionAccessTargetExpression()
    };
  }

  parseIndexOfExpression() {
    this.consumeWord("index", "Expected 'index' in 'index of ... in ...'");
    this.consumeWord("of", "Expected 'of' after 'index'");
    const item = this.parseAtomicValueExpression();
    this.consume(TOKEN_KINDS.IN, "Expected 'in' after the target item");
    return {
      type: "CollectionIndexOfExpression",
      item,
      collection: this.parseCollectionAccessTargetExpression()
    };
  }

  parseLiteralCollectionItemList() {
    this.consumeWord("of", "Expected 'of' after the collection helper mode");
    this.consume(TOKEN_KINDS.LPAREN, "Expected '(' to start the helper item list");

    const items = [];
    if (!this.match(TOKEN_KINDS.RPAREN)) {
      items.push(this.parseLiteralCollectionItem());

      while (this.match(TOKEN_KINDS.COMMA)) {
        this.advance();
        items.push(this.parseLiteralCollectionItem());
      }
    }

    this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the helper item list");
    return items;
  }

  parseLiteralCollectionItem() {
    const expression = this.parseAtomicValueExpression();

    if (expression.type !== "LiteralExpression") {
      throw this.error(this.peek(), "Collection membership helpers expect a literal item list");
    }

    return expression;
  }

  parseCollectionAccessTargetExpression(boundaryWords = new Set()) {
    if (this.checkListPhrase()) {
      return this.parseListExpression();
    }

    if (this.checkResultPhrase()) {
      return this.parseResultExpression();
    }

    if (this.checkNoValuePhrase()) {
      return this.parseNoValueLiteralExpression();
    }

    if (this.matchWord("first")) {
      return this.parseFirstAccessExpression();
    }

    if (this.matchWord("last")) {
      return this.parseLastAccessExpression();
    }

    if (this.checkItemAtIndexPhrase()) {
      return this.parseItemAtIndexExpression();
    }

    if (this.checkItemsFromIndexPhrase()) {
      return this.parseItemsFromIndexRangeExpression();
    }

    if (this.checkIndexOfPhrase()) {
      return this.parseIndexOfExpression();
    }

    if (this.checkCountPhrase()) {
      return this.parseCountExpression();
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

    return this.parseReferenceExpression(boundaryWords);
  }

  parsePropertyAccessExpression(boundaryKinds = new Set(), boundaryWords = new Set()) {
    this.consumeOptionalArticle();
    const propertyNameParts = this.parseNormalizedName({
      boundaryWords: new Set(["of"]),
      errorMessage: "Expected a property name",
      extraNameKinds: new Set([TOKEN_KINDS.TO])
    });
    this.consumeWord("of", "Expected 'of' after the property name");
    const instanceNameParts = this.parseNormalizedName({
      boundaryKinds,
      boundaryWords,
      errorMessage: "Expected an instance name"
    });

    return {
      type: "PropertyAccessExpression",
      propertyNameParts,
      instanceNameParts
    };
  }

  parseSelfPropertyExpression(boundaryKinds = new Set(), boundaryWords = new Set()) {
    if (this.actionDepth === 0) {
      throw this.error(this.peek(), "its is only allowed inside actions");
    }

    this.consume(TOKEN_KINDS.ITS, "Expected 'its' in a self property expression");
    return {
      type: "SelfPropertyExpression",
      propertyNameParts: this.parseNormalizedName({
        boundaryKinds,
        boundaryWords,
        errorMessage: "Expected a property name after 'its'",
        extraNameKinds: new Set([TOKEN_KINDS.TO])
      })
    };
  }

  parseAnonymousCallableExpression(isReturning) {
    if (!isReturning) {
      this.consume(TOKEN_KINDS.DO, "Expected 'do' to start an anonymous callable");
      this.consume(TOKEN_KINDS.THIS, "Expected 'this' after 'do'");
    } else {
      this.consume(TOKEN_KINDS.THIS, "Expected 'this' after 'the result of'");
    }

    const params = [];
    if (this.matchWord("using")) {
      this.advance();
      params.push(
        this.parseNormalizedName({
          boundaryKinds: new Set([TOKEN_KINDS.COLON]),
          errorMessage: "Expected a callable parameter name",
          stopAtAndSeparator: true,
          stopAtAndReturnsPhrase: true
        })
      );

      while (this.match(TOKEN_KINDS.AND) && !this.checkAndReturnsPhrase()) {
        this.advance();
        params.push(
          this.parseNormalizedName({
            boundaryKinds: new Set([TOKEN_KINDS.COLON]),
            errorMessage: "Expected a callable parameter name",
            stopAtAndSeparator: true,
            stopAtAndReturnsPhrase: true
          })
        );
      }
    }

    let returnType = null;
    if (isReturning) {
      if (!this.checkAndReturnsPhrase()) {
        throw this.error(this.peek(), "Returning anonymous callables must declare 'and returns <Type>'");
      }

      this.advance();
      this.consume(TOKEN_KINDS.RETURNS, "Expected 'returns' after 'and'");
      returnType = this.parseTypeReference();
    } else if (this.checkAndReturnsPhrase()) {
      throw this.error(this.peek(), "Non-returning anonymous callables cannot declare a return type");
    }

    const body = this.parseFunctionBlock(isReturning, []);

    return {
      type: "AnonymousCallableExpression",
      params,
      returnType,
      body,
      isReturning
    };
  }

  parseListExpression() {
    this.consumeOptionalArticle();
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
    this.consume(TOKEN_KINDS.IS, "Expected 'is' in the comparison");
    return "EQUAL";
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

  parseTypeReference() {
    if (this.match(TOKEN_KINDS.LIST)) {
      this.advance();
      this.consumeWord("of", "Expected 'of' after 'List'");
      return {
        kind: "list",
        itemType: this.parseTypeReference()
      };
    }

    return {
      kind: "named",
      nameParts: this.parseNormalizedName({
        boundaryKinds: new Set([TOKEN_KINDS.COMMA, TOKEN_KINDS.RPAREN, TOKEN_KINDS.COLON, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.DOT]),
        errorMessage: "Expected a type name"
      })
    };
  }

  parseCollectionName() {
    return this.parseNormalizedName({
      boundaryKinds: new Set([TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]),
      boundaryWords: new Set(["defined", "from"]),
      errorMessage: "Expected a collection name"
    });
  }

  parseCollectionSourceReference(boundaryWords, boundaryKinds) {
    return {
      type: "ReferenceExpression",
      nameParts: this.parseNormalizedName({
        boundaryKinds,
        boundaryWords,
        errorMessage: "Expected a collection source name"
      })
    };
  }

  parseNameUntilWord(expectedWord) {
    return this.parseNormalizedName({
      boundaryWords: new Set([expectedWord.toLowerCase()]),
      errorMessage: "Expected a variable name"
    });
  }

  parseResultExpression() {
    this.consumeOptionalArticle();
    this.consume(TOKEN_KINDS.RESULT, "Expected 'result' in 'the result of (...)'");
    this.consumeWord("of", "Expected 'of' in 'the result of (...)'");

    if (this.match(TOKEN_KINDS.WAIT)) {
      return this.parseWaitExpression();
    }

    if (this.matchWord("asking")) {
      return {
        type: "ActionCallExpression",
        ...this.parseActionInvocationAfterAskingWord()
      };
    }

    if (this.match(TOKEN_KINDS.THIS)) {
      return this.parseAnonymousCallableExpression(true);
    }

    if (!this.match(TOKEN_KINDS.LPAREN) && !BUILTIN_FUNCTION_KINDS.has(this.peek().kind)) {
      return this.parseFunctionCallExpression();
    }

    return {
      type: "ResultExpression",
      expression: this.parseAdditiveExpression()
    };
  }

  parseBackgroundTaskExpression() {
    this.consumeOptionalArticle();
    this.consumeWord("background", "Expected 'background' in 'the background task:'");
    this.consumeWord("task", "Expected 'task' after 'background'");
    const body = this.parseBlock("generic");

    return {
      type: "BackgroundTaskExpression",
      body
    };
  }

  parseDelayedTaskExpression() {
    this.consumeOptionalArticle();
    this.consumeWord("delayed", "Expected 'delayed' in 'the delayed task after ...:'");
    this.consumeWord("task", "Expected 'task' after 'delayed'");
    this.consumeWord("after", "Expected 'after' in 'the delayed task after ...:'");
    const delay = this.parseDelayDuration();
    const body = this.parseBlock("generic");

    return {
      type: "DelayedTaskExpression",
      delay,
      body
    };
  }

  parseWaitExpression() {
    this.consume(TOKEN_KINDS.WAIT, "Expected 'wait' in 'the result of wait for ...'");
    return {
      type: "WaitExpression",
      target: this.parseWaitTarget(),
      timeout: this.parseOptionalWaitTimeoutClause()
    };
  }

  parseWaitTarget() {
    this.consume(TOKEN_KINDS.FOR, "Expected 'for' after 'wait'");

    if (this.matchWord("all")) {
      this.advance();
      this.consumeWord("of", "Expected 'of' after 'all'");
      return {
        type: "WaitAllExpression",
        tasks: this.parseWaitTaskList()
      };
    }

    if (this.matchWord("any")) {
      this.advance();
      this.consumeWord("of", "Expected 'of' after 'any'");
      return {
        type: "WaitAnyExpression",
        tasks: this.parseWaitTaskList()
      };
    }

    const waitBoundaryKinds = new Set([TOKEN_KINDS.FOR, TOKEN_KINDS.DOT, TOKEN_KINDS.NEWLINE, TOKEN_KINDS.EOF]);

    if (this.hasWordBeforeBoundary("using", waitBoundaryKinds)) {
      return this.parseFunctionCallExpression();
    }

    const target = this.parseValueExpressionWithBoundaries(waitBoundaryKinds);
    this.ensureNoRawArithmetic();
    return target;
  }

  parseOptionalWaitTimeoutClause() {
    if (!this.match(TOKEN_KINDS.FOR)) {
      return null;
    }

    this.advance();
    return this.parseDelayDuration("WaitTimeoutClause");
  }

  parseDelayDuration(type = "DelayClause") {
    const amount = this.parseDurationValueExpression();
    const unit = this.parseWaitTimeoutUnit();

    return {
      type,
      amount,
      unit
    };
  }

  parseDurationValueExpression() {
    const unitWords = new Set(["millisecond", "milliseconds", "second", "seconds", "minute", "minutes"]);

    if (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS)) {
      return this.parseSelfPropertyExpression(new Set(), unitWords);
    }

    if (this.checkPropertyAccessPhrase()) {
      return this.parsePropertyAccessExpression(new Set(), unitWords);
    }

    return this.parseCollectionAccessTargetExpression(unitWords);
  }

  parseWaitTimeoutUnit() {
    const token = this.peek();
    const normalizedLexeme = token.lexeme?.toLowerCase?.();

    if (!normalizedLexeme) {
      throw this.error(token, "Expected a timeout unit such as 'seconds' or 'minutes'");
    }

    if (!["millisecond", "milliseconds", "second", "seconds", "minute", "minutes"].includes(normalizedLexeme)) {
      throw this.error(token, "Expected a timeout unit such as 'seconds' or 'minutes'");
    }

    this.advance();
    return normalizedLexeme;
  }

  parseWaitTaskList() {
    this.consume(TOKEN_KINDS.LPAREN, "Expected '(' to start the wait task list");

    if (this.match(TOKEN_KINDS.RPAREN)) {
      throw this.error(this.peek(), "Wait task lists cannot be empty");
    }

    const tasks = [this.parseValueExpression()];

    while (this.match(TOKEN_KINDS.COMMA)) {
      this.advance();
      tasks.push(this.parseValueExpression());
    }

    this.consume(TOKEN_KINDS.RPAREN, "Expected ')' after the wait task list");
    return tasks;
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
    if (this.checkNoValuePhrase()) {
      return this.parseNoValueLiteralExpression();
    }

    if (this.matchWord("first")) {
      return this.parseFirstAccessExpression();
    }

    if (this.matchWord("last")) {
      return this.parseLastAccessExpression();
    }

    if (this.checkItemAtIndexPhrase()) {
      return this.parseItemAtIndexExpression();
    }

    if (this.checkItemsFromIndexPhrase()) {
      return this.parseItemsFromIndexRangeExpression();
    }

    if (this.checkIndexOfPhrase()) {
      return this.parseIndexOfExpression();
    }

    if (this.checkCountPhrase()) {
      return this.parseCountExpression();
    }

    if (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS)) {
      return this.parseSelfPropertyExpression();
    }

    if (this.checkPropertyAccessPhrase()) {
      return this.parsePropertyAccessExpression();
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

  parseReferenceExpression(boundaryWords = new Set()) {
    if (this.startsSoftWordPhrase()) {
      throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
    }

    return {
      type: "ReferenceExpression",
      nameParts: this.parseNormalizedName({
        boundaryWords,
        errorMessage: "Expected a value or variable reference",
        stopAtHasPhrase: true,
        extraNameKinds: new Set([TOKEN_KINDS.TO])
      })
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
    return this.parseNormalizedName({
      boundaryKinds,
      errorMessage: "Expected a variable name"
    });
  }

  parseDelimitedValueExpressionList(boundaryKinds) {
    const values = [this.parseValueExpression()];

    while (this.match(TOKEN_KINDS.COMMA)) {
      this.advance();
      values.push(this.parseValueExpression());
    }

    if (!boundaryKinds.has(this.peek().kind)) {
      throw this.error(this.peek(), "Expected the end of the argument list");
    }

    return values;
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
      this.match(TOKEN_KINDS.HOW) ||
      this.match(TOKEN_KINDS.SHARE) ||
      this.match(TOKEN_KINDS.USE) ||
      this.match(TOKEN_KINDS.WAIT) ||
      this.match(TOKEN_KINDS.TRY) ||
      this.match(TOKEN_KINDS.ENSURE) ||
      this.match(TOKEN_KINDS.VERIFY) ||
      this.match(TOKEN_KINDS.RETURN) ||
      this.match(TOKEN_KINDS.CREATE) ||
      this.match(TOKEN_KINDS.DEFINE) ||
      this.match(TOKEN_KINDS.ASK) ||
      this.match(TOKEN_KINDS.TAKE) ||
      this.match(TOKEN_KINDS.WHEN) ||
      this.match(TOKEN_KINDS.CHECK) ||
      this.match(TOKEN_KINDS.FOR) ||
      this.match(TOKEN_KINDS.REPEAT) ||
      this.match(TOKEN_KINDS.BREAK) ||
      this.match(TOKEN_KINDS.CONTINUE) ||
      this.match(TOKEN_KINDS.KEEP) ||
      (this.match(TOKEN_KINDS.IN) && this.checkBackgroundClause()) ||
      this.peek().kind === TOKEN_KINDS.WORD
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
    const offset = this.peekResultTokenOffset();
    return (
      offset !== null &&
      this.tokens[this.index + offset]?.kind === TOKEN_KINDS.RESULT &&
      this.tokens[this.index + offset + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset + 1]?.lexeme.toLowerCase() === "of"
    );
  }

  checkAnonymousDoThisPhrase() {
    return this.match(TOKEN_KINDS.DO) && this.tokens[this.index + 1]?.kind === TOKEN_KINDS.THIS;
  }

  checkBackgroundClause() {
    let offset = 1;
    const nextToken = this.tokens[this.index + offset];

    if (this.isIgnorableArticleToken(nextToken)) {
      offset += 1;
    }

    return this.tokens[this.index + offset]?.kind === TOKEN_KINDS.WORD && this.tokens[this.index + offset]?.lexeme.toLowerCase() === "background";
  }

  checkBackgroundTaskPhrase() {
    const offset = this.isIgnorableArticleToken(this.peek()) ? 1 : 0;
    return (
      this.tokens[this.index + offset]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset]?.lexeme.toLowerCase() === "background" &&
      this.tokens[this.index + offset + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset + 1]?.lexeme.toLowerCase() === "task"
    );
  }

  checkDelayedTaskPhrase() {
    const offset = this.isIgnorableArticleToken(this.peek()) ? 1 : 0;
    return (
      this.tokens[this.index + offset]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset]?.lexeme.toLowerCase() === "delayed" &&
      this.tokens[this.index + offset + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset + 1]?.lexeme.toLowerCase() === "task" &&
      this.tokens[this.index + offset + 2]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset + 2]?.lexeme.toLowerCase() === "after"
    );
  }

  checkListPhrase() {
    const offset = this.peekListTokenOffset();
    return (
      offset !== null &&
      this.tokens[this.index + offset]?.kind === TOKEN_KINDS.LIST &&
      this.tokens[this.index + offset + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + offset + 1]?.lexeme.toLowerCase() === "of"
    );
  }

  checkNoValuePhrase() {
    return this.peek().lexeme?.toLowerCase?.() === "no" && this.tokens[this.index + 1]?.kind === TOKEN_KINDS.WORD && this.tokens[this.index + 1]?.lexeme.toLowerCase() === "value";
  }

  checkFirstItemPhrase() {
    return this.checkWordSequence("first", "item", "of");
  }

  checkLastItemPhrase() {
    return this.checkWordSequence("last", "item", "of");
  }

  checkIndexOfPhrase() {
    return (
      this.matchWord("index") &&
      this.tokens[this.index + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + 1]?.lexeme.toLowerCase() === "of"
    );
  }

  checkItemAtIndexPhrase() {
    return this.checkWordSequence("item", "at", "index");
  }

  checkItemsFromIndexPhrase() {
    return this.checkWordSequence("items", "from", "index");
  }

  checkCountPhrase() {
    return this.checkWordSequence("count", "of");
  }

  checkAndReturnsPhrase() {
    return this.match(TOKEN_KINDS.AND) && this.tokens[this.index + 1]?.kind === TOKEN_KINDS.RETURNS;
  }

  checkHasCollectionPhrase() {
    return (
      this.matchWord("has") &&
      this.tokens[this.index + 1]?.kind === TOKEN_KINDS.WORD &&
      ["any", "all"].includes(this.tokens[this.index + 1]?.lexeme.toLowerCase()) &&
      this.tokens[this.index + 2]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + 2]?.lexeme.toLowerCase() === "of"
    );
  }

  checkInAnyCasePhrase() {
    return (
      this.match(TOKEN_KINDS.IN) &&
      this.tokens[this.index + 1]?.kind === TOKEN_KINDS.WORD &&
      this.tokens[this.index + 1]?.lexeme.toLowerCase() === "any" &&
      this.tokens[this.index + 2]?.kind === TOKEN_KINDS.CASE
    );
  }

  checkPropertyAccessPhrase() {
    if (!this.isIgnorableArticleToken(this.peek())) {
      return false;
    }

    let offset = 0;
    let sawPropertyWord = false;

    while (!this.isAtEnd()) {
      const token = this.tokens[this.index + offset];

      if (!token) {
        return false;
      }

      if (this.isIgnorableArticleToken(token)) {
        offset += 1;
        continue;
      }

      if (token.kind !== TOKEN_KINDS.WORD) {
        return false;
      }

      if (token.lexeme.toLowerCase() === "of") {
        return sawPropertyWord;
      }

      sawPropertyWord = true;
      offset += 1;
    }

    return false;
  }

  checkFunctionCallStatementStart() {
    return this.checkPropertyAccessPhrase() || (this.actionDepth > 0 && this.match(TOKEN_KINDS.ITS));
  }

  peekResultTokenOffset() {
    if (this.match(TOKEN_KINDS.RESULT)) {
      return 0;
    }

    if (this.isIgnorableArticleToken(this.peek())) {
      return 1;
    }

    return null;
  }

  peekListTokenOffset() {
    if (this.match(TOKEN_KINDS.LIST)) {
      return 0;
    }

    if (this.isIgnorableArticleToken(this.peek())) {
      return 1;
    }

    return null;
  }

  isIgnorableArticleToken(token) {
    if (!token) {
      return false;
    }

    if (token.kind === TOKEN_KINDS.THE) {
      return true;
    }

    return token.kind === TOKEN_KINDS.WORD && ["a", "an"].includes(token.lexeme.toLowerCase());
  }

  consumeOptionalArticle() {
    if (this.isIgnorableArticleToken(this.peek())) {
      this.advance();
    }
  }

  parseOptionalAccessModifier() {
    if (this.match(TOKEN_KINDS.PRIVATE)) {
      this.advance();
      return "private";
    }

    if (this.match(TOKEN_KINDS.PROTECTED)) {
      this.advance();
      return "protected";
    }

    if (this.match(TOKEN_KINDS.PUBLIC)) {
      this.advance();
      return "public";
    }

    return "public";
  }

  parseRequiredAccessModifier() {
    if (!this.match(TOKEN_KINDS.PUBLIC) && !this.match(TOKEN_KINDS.PRIVATE) && !this.match(TOKEN_KINDS.PROTECTED)) {
      throw this.error(this.peek(), "Expected 'private', 'protected', or 'public'");
    }

    return this.parseOptionalAccessModifier();
  }

  parseNormalizedName({
    boundaryKinds = new Set(),
    boundaryWords = new Set(),
    errorMessage,
    stopAtHasPhrase = false,
    stopAtAndSeparator = false,
    stopAtAndReturnsPhrase = false,
    extraNameKinds = new Set()
  }) {
    const nameParts = [];

    while (!this.isAtEnd() && !boundaryKinds.has(this.peek().kind)) {
      if (this.startsSoftWordPhrase()) {
        throw this.error(this.peek(), "Soft words are only allowed at the start of a statement");
      }

      if (this.peek().kind === TOKEN_KINDS.WORD && boundaryWords.has(this.peek().lexeme.toLowerCase())) {
        break;
      }

      if (stopAtHasPhrase && nameParts.length > 0 && this.checkHasCollectionPhrase()) {
        break;
      }

      if (stopAtAndSeparator && nameParts.length > 0 && this.match(TOKEN_KINDS.AND) && !this.checkAndReturnsPhrase()) {
        break;
      }

      if (stopAtAndReturnsPhrase && nameParts.length > 0 && this.checkAndReturnsPhrase()) {
        break;
      }

      if (this.isIgnorableArticleToken(this.peek())) {
        this.advance();
        continue;
      }

      if (this.peek().kind !== TOKEN_KINDS.WORD && !extraNameKinds.has(this.peek().kind)) {
        if (nameParts.length > 0) {
          break;
        }

        throw this.error(this.peek(), errorMessage);
      }

      nameParts.push(this.advance().lexeme);
    }

    if (nameParts.length === 0) {
      throw this.error(this.peek(), errorMessage);
    }

    return nameParts;
  }

  currentBlockContext() {
    return this.blockContextStack.at(-1) ?? null;
  }

  isCurrentExpressionBoundary(kind) {
    return this.expressionBoundaryStack.some((boundaryKinds) => boundaryKinds.has(kind));
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
    return (
      this.checkWordSequence("so") ||
      this.checkWordSequence("then") ||
      this.checkWordSequence("also") ||
      this.checkWordSequence("therefore") ||
      this.checkWordSequence("meanwhile") ||
      this.checkWordSequence("that's", "why")
    );
  }

  advanceSoftWordPhrase() {
    if (
      this.checkWordSequence("so") ||
      this.checkWordSequence("then") ||
      this.checkWordSequence("also") ||
      this.checkWordSequence("therefore") ||
      this.checkWordSequence("meanwhile")
    ) {
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
      if (!token || (token.kind !== TOKEN_KINDS.WORD && token.kind !== TOKEN_KINDS.BOOLEAN) || token.lexeme.toLowerCase() !== words[offset]) {
        return false;
      }
    }

    return true;
  }

  hasWordBeforeBoundary(expectedWord, boundaryKinds = new Set()) {
    let offset = 0;

    while (!this.isAtEnd()) {
      const token = this.tokens[this.index + offset];

      if (!token || boundaryKinds.has(token.kind)) {
        return false;
      }

      if (token.kind === TOKEN_KINDS.WORD && token.lexeme.toLowerCase() === expectedWord.toLowerCase()) {
        return true;
      }

      offset += 1;
    }

    return false;
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
