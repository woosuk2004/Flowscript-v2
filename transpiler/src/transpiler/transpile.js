import { readFile } from "node:fs/promises";

import { parse } from "../parser/parser.js";
import { TOKEN_KINDS } from "../tokens/token-kinds.js";

const RUNTIME_SOURCE = String.raw`
function createFlowScriptRuntime() {
  const cells = new Map();
  const evaluationStack = [];
  const makeContext = (parent = null, locals = Object.create(null)) => ({
    get(name) {
      if (Object.prototype.hasOwnProperty.call(locals, name)) {
        return locals[name];
      }

      if (parent) {
        return parent.get(name);
      }

      return runtime.get(name);
    }
  });
  const runtime = {
    output: [],
    set(name, value) {
      cells.set(name, { kind: "static", value });
      return value;
    },
    defineReactive(name, evaluator, definitionContext = runtime.context) {
      cells.set(name, { kind: "reactive", evaluator, definitionContext });
    },
    round(value, precision = 0) {
      const factor = 10 ** precision;
      return Math.round((value + Number.EPSILON) * factor) / factor;
    },
    fixed(value, precision) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("fixed expects a numeric value");
      }

      return value.toFixed(precision);
    },
    isPrimitive(value) {
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    },
    primitiveKey(value) {
      return typeof value + ":" + String(value);
    },
    createList(items) {
      return items.slice();
    },
    createSet(items) {
      const result = [];
      const seen = new Set();

      for (const item of items) {
        if (!runtime.isPrimitive(item)) {
          throw new Error("Sets only support primitive values");
        }

        const key = runtime.primitiveKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      }

      return result;
    },
    asCollection(value) {
      if (!Array.isArray(value)) {
        throw new Error("Expected a list or set value");
      }

      return value;
    },
    repeatCount(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error("Repeat count must be a non-negative integer");
      }

      return value;
    },
    evaluate(evaluator, evaluationContext = runtime.context) {
      return evaluator(evaluationContext);
    },
    compareValues(left, right) {
      if (left === right) {
        return 0;
      }

      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }

      const leftText = String(left);
      const rightText = String(right);
      if (leftText < rightText) {
        return -1;
      }

      if (leftText > rightText) {
        return 1;
      }

      return 0;
    },
    filterCollection(collection, predicate) {
      return runtime.asCollection(collection).filter((item, index) => predicate(item, index));
    },
    selectCollection(collection, projector) {
      return runtime.asCollection(collection).map((item, index) => projector(item, index));
    },
    sortCollection(collection, accessor, direction = "ascending") {
      const normalized = runtime.asCollection(collection).slice();
      normalized.sort((leftItem, rightItem) => {
        const comparison = runtime.compareValues(accessor(leftItem), accessor(rightItem));
        return direction === "descending" ? -comparison : comparison;
      });
      return normalized;
    },
    takeFirstItems(collection, count) {
      return runtime.asCollection(collection).slice(0, runtime.repeatCount(count));
    },
    get(name) {
      if (!cells.has(name)) {
        throw new Error('Undefined variable "' + name + '"');
      }

      const cell = cells.get(name);
      if (cell.kind === "static") {
        return cell.value;
      }

      const cycleStart = evaluationStack.indexOf(name);
      if (cycleStart !== -1) {
        const cycle = evaluationStack.slice(cycleStart).concat(name).join(" -> ");
        throw new Error('Reactive cycle detected: ' + cycle);
      }

      evaluationStack.push(name);
      try {
        return cell.evaluator(cell.definitionContext ?? runtime.context);
      } finally {
        evaluationStack.pop();
      }
    },
    formatValue(value) {
      if (Array.isArray(value)) {
        return "[" + value.map((item) => runtime.formatValue(item)).join(", ") + "]";
      }

      if (value && typeof value === "object") {
        return "{" + Object.entries(value).map(([key, item]) => key + ": " + runtime.formatValue(item)).join(", ") + "}";
      }

      return String(value);
    },
    print(value) {
      runtime.output.push(runtime.formatValue(value));
      return value;
    },
    interpolate(text, evaluationContext = runtime.context) {
      const source = String(text);
      let output = "";

      for (let index = 0; index < source.length; index += 1) {
        if (source[index] === "(" && source[index + 1] === "(") {
          output += "(";
          index += 1;
          continue;
        }

        if (source[index] === ")" && source[index + 1] === ")") {
          output += ")";
          index += 1;
          continue;
        }

        if (source[index] !== "(") {
          output += source[index];
          continue;
        }

        const closeIndex = source.indexOf(")", index + 1);
        if (closeIndex === -1) {
          output += source[index];
          continue;
        }

        const rawName = source.slice(index + 1, closeIndex);
        const normalizedName = rawName
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .join(" ");

        if (!normalizedName) {
          output += "()";
          index = closeIndex;
          continue;
        }

        if (!/^[_A-Za-z][_A-Za-z0-9']*(\s+[_A-Za-z][_A-Za-z0-9']*)*$/.test(normalizedName)) {
          throw new Error('Invalid interpolation reference "' + rawName + '"');
        }

        output += runtime.formatValue(evaluationContext.get(normalizedName));
        index = closeIndex;
      }

      return output;
    },
    has(name) {
      return cells.has(name);
    },
    makeChildContext(parent, locals) {
      return makeContext(parent, locals);
    }
  };

  runtime.context = makeContext();
  return runtime;
}
`;

const OPERATOR_MAP = {
  [TOKEN_KINDS.PLUS]: "+",
  [TOKEN_KINDS.MINUS]: "-",
  [TOKEN_KINDS.STAR]: "*",
  [TOKEN_KINDS.SLASH]: "/"
};

const COMPARISON_OPERATOR_MAP = {
  EQUAL: "===",
  NOT_EQUAL: "!==",
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_THAN_OR_EQUAL: ">=",
  LESS_THAN_OR_EQUAL: "<="
};

const LOGICAL_OPERATOR_MAP = {
  [TOKEN_KINDS.AND]: "&&",
  [TOKEN_KINDS.OR]: "||"
};

export function transpile(source) {
  return transpileProgram(parse(source));
}

export async function transpileFile(path) {
  const source = await readFile(path, "utf8");
  return transpile(source);
}

export function execute(source) {
  const compiled = transpile(source);
  return new Function(`return ${compiled};`)();
}

export async function executeFile(path) {
  const source = await readFile(path, "utf8");
  return execute(source);
}

export function transpileProgram(program) {
  const compilerState = { tempIndex: 0 };
  const lines = [
    "(() => {",
    indent(RUNTIME_SOURCE.trimEnd()),
    "  const __flowRuntime = createFlowScriptRuntime();"
  ];

  for (const statement of program.body) {
    lines.push(...compileStatement(statement, compilerState, 1, "__flowRuntime.context"));
  }

  lines.push("  return { scope: __flowRuntime, output: __flowRuntime.output };", "})()");
  return lines.join("\n");
}

function compileStatement(statement, compilerState, level, contextName) {
  switch (statement.type) {
    case "SetStatement":
      return [
        line(level, `__flowRuntime.set(${compileName(statement.nameParts)}, __flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.value, "__flowContext")}, ${contextName}));`)
      ];
    case "ReactiveSetStatement":
      return [
        line(level, `__flowRuntime.defineReactive(${compileName(statement.nameParts)}, (__flowContext) => ${compileExpression(statement.expression, "__flowContext")}, ${contextName});`)
      ];
    case "PrintStatement":
      return [
        line(level, `__flowRuntime.print(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.value, "__flowContext")}, ${contextName}));`)
      ];
    case "CollectionDeclarationStatement":
      return compileCollectionDeclarationStatement(statement, compilerState, level, contextName);
    case "CollectionPipelineStatement":
      return compileCollectionPipelineStatement(statement, compilerState, level, contextName);
    case "WhenStatement":
      return compileWhenStatement(statement, compilerState, level, contextName);
    case "CheckStatement":
      return compileCheckStatement(statement, compilerState, level, contextName);
    case "ForEachStatement":
      return compileForEachStatement(statement, compilerState, level, contextName);
    case "RepeatStatement":
      return compileRepeatStatement(statement, compilerState, level, contextName);
    case "WhileStatement":
      return compileWhileStatement(statement, compilerState, level, contextName);
    default:
      throw new Error(`Unsupported statement type: ${statement.type}`);
  }
}

function compileExpression(expression, contextName, recordName = null) {
  switch (expression.type) {
    case "LiteralExpression":
      if (expression.valueType === "string") {
        return `__flowRuntime.interpolate(${JSON.stringify(expression.value)}, ${contextName})`;
      }

      return JSON.stringify(expression.value);
    case "ReferenceExpression":
      return `${contextName}.get(${compileName(expression.nameParts)})`;
    case "FieldReferenceExpression":
      if (!recordName) {
        throw new Error(`Field references require a record context: ${expression.fieldName}`);
      }

      return `${recordName}[${JSON.stringify(expression.fieldName)}]`;
    case "RecordLiteralExpression":
      return `{ ${expression.fields.map((field) => `${JSON.stringify(field.name)}: ${compileExpression(field.value, contextName, recordName)}`).join(", ")} }`;
    case "ListExpression":
      return `[${expression.items.map((item) => compileExpression(item, contextName, recordName)).join(", ")}]`;
    case "ResultExpression":
      return `(${compileExpression(expression.expression, contextName, recordName)})`;
    case "BinaryExpression":
      return `(${compileExpression(expression.left, contextName, recordName)} ${OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName)})`;
    case "UnaryExpression":
      return `(!${compileExpression(expression.argument, contextName, recordName)})`;
    case "LogicalExpression":
      return `(${compileExpression(expression.left, contextName, recordName)} ${LOGICAL_OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName)})`;
    case "BuiltinCallExpression":
      return compileBuiltinCallExpression(expression, contextName, recordName);
    case "ComparisonExpression":
      return `(${compileExpression(expression.left, contextName, recordName)} ${COMPARISON_OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName)})`;
    case "StringOperationExpression":
      return compileStringOperationExpression(expression, contextName, recordName);
    default:
      throw new Error(`Unsupported expression type: ${expression.type}`);
  }
}

function compileWhenStatement(statement, compilerState, level, contextName) {
  const lines = [];

  for (let index = 0; index < statement.branches.length; index += 1) {
    const branch = statement.branches[index];
    const keyword = index === 0 ? "if" : "else if";
    lines.push(
      line(
        level,
        `${keyword} (__flowRuntime.evaluate((__flowContext) => ${compileExpression(branch.condition, "__flowContext")}, ${contextName})) {`
      )
    );
    lines.push(...compileStatements(statement.branches[index].body, compilerState, level + 1, contextName));
    lines.push(line(level, "}"));
  }

  if (statement.otherwiseBody) {
    lines.push(line(level, "else {"));
    lines.push(...compileStatements(statement.otherwiseBody, compilerState, level + 1, contextName));
    lines.push(line(level, "}"));
  }

  return lines;
}

function compileCollectionDeclarationStatement(statement, compilerState, level, contextName) {
  const collectionFactory = statement.collectionKind === "set" ? "__flowRuntime.createSet" : "__flowRuntime.createList";

  if (statement.items !== null) {
    const compiledItems = statement.items.map((item) => compileExpression(item, "__flowContext")).join(", ");
    return [
      line(
        level,
        `__flowRuntime.set(${compileName(statement.nameParts)}, __flowRuntime.evaluate((__flowContext) => ${collectionFactory}([${compiledItems}]), ${contextName}));`
      )
    ];
  }

  const tempName = `__collection${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `let ${tempName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.source, "__flowContext")}, ${contextName}));`
    )
  );

  if (statement.where) {
    lines.push(
      line(
        level + 1,
        `${tempName} = __flowRuntime.filterCollection(${tempName}, (__flowRecord) => ${compileExpression(statement.where, contextName, "__flowRecord")});`
      )
    );
  }

  if (statement.select) {
    lines.push(
      line(
        level + 1,
        `${tempName} = __flowRuntime.selectCollection(${tempName}, (__flowRecord) => ${compileExpression(statement.select, contextName, "__flowRecord")});`
      )
    );
  }

  lines.push(line(level + 1, `__flowRuntime.set(${compileName(statement.nameParts)}, ${collectionFactory}(${tempName}));`));
  lines.push(line(level, "}"));
  return lines;
}

function compileCollectionPipelineStatement(statement, compilerState, level, contextName) {
  const tempName = `__pipeline${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const lines = [line(level, "{")];

  lines.push(
    line(
      level + 1,
      `let ${tempName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.source, "__flowContext")}, ${contextName}));`
    )
  );

  for (const step of statement.steps) {
    switch (step.type) {
      case "FilterStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.filterCollection(${tempName}, (__flowRecord) => ${compileExpression(step.condition, contextName, "__flowRecord")});`
          )
        );
        break;
      case "SortStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.sortCollection(${tempName}, (__flowRecord) => __flowRecord[${JSON.stringify(step.fieldName)}], ${JSON.stringify(step.direction)});`
          )
        );
        break;
      case "TakeFirstStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.takeFirstItems(${tempName}, __flowRuntime.evaluate((__flowContext) => ${compileExpression(step.count, "__flowContext")}, ${contextName}));`
          )
        );
        break;
      case "SelectStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.selectCollection(${tempName}, (__flowRecord) => ${compileExpression(step.projection, contextName, "__flowRecord")});`
          )
        );
        break;
      case "SaveStep": {
        const collectionFactory = step.collectionKind === "set" ? "__flowRuntime.createSet" : "__flowRuntime.createList";
        lines.push(line(level + 1, `__flowRuntime.set(${compileName(step.targetNameParts)}, ${collectionFactory}(${tempName}));`));
        break;
      }
      default:
        throw new Error(`Unsupported pipeline step type: ${step.type}`);
    }
  }

  lines.push(line(level, "}"));
  return lines;
}

function compileCheckStatement(statement, compilerState, level, contextName) {
  const tempName = `__checkValue${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${tempName} = __flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.target, "__flowContext")}, ${contextName});`
    )
  );

  for (let index = 0; index < statement.cases.length; index += 1) {
    const currentCase = statement.cases[index];
    const keyword = index === 0 ? "if" : "else if";
    lines.push(
      line(
        level + 1,
        `${keyword} (${tempName} === __flowRuntime.evaluate((__flowContext) => ${compileExpression(currentCase.match, "__flowContext")}, ${contextName})) {`
      )
    );
    lines.push(...compileStatements(currentCase.body, compilerState, level + 2, contextName));
    lines.push(line(level + 1, "}"));
  }

  if (statement.defaultBody) {
    lines.push(line(level + 1, "else {"));
    lines.push(...compileStatements(statement.defaultBody, compilerState, level + 2, contextName));
    lines.push(line(level + 1, "}"));
  }

  lines.push(line(level, "}"));
  return lines;
}

function compileForEachStatement(statement, compilerState, level, contextName) {
  const collectionName = `__loopCollection${compilerState.tempIndex}`;
  const itemValueName = `__loopItem${compilerState.tempIndex}`;
  const loopContextName = `__loopContext${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${collectionName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.collection, "__flowContext")}, ${contextName}));`
    )
  );
  lines.push(line(level + 1, `for (const ${itemValueName} of ${collectionName}) {`));
  lines.push(
    line(
      level + 2,
      `const ${loopContextName} = __flowRuntime.makeChildContext(${contextName}, { [${compileName(statement.itemNameParts)}]: ${itemValueName} });`
    )
  );
  lines.push(...compileStatements(statement.body, compilerState, level + 2, loopContextName));
  lines.push(line(level + 1, "}"));
  lines.push(line(level, "}"));
  return lines;
}

function compileRepeatStatement(statement, compilerState, level, contextName) {
  const countName = `__repeatCount${compilerState.tempIndex}`;
  const indexName = `__repeatIndex${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${countName} = __flowRuntime.repeatCount(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.count, "__flowContext")}, ${contextName}));`
    )
  );
  lines.push(line(level + 1, `for (let ${indexName} = 0; ${indexName} < ${countName}; ${indexName} += 1) {`));
  lines.push(...compileStatements(statement.body, compilerState, level + 2, contextName));
  lines.push(line(level + 1, "}"));
  lines.push(line(level, "}"));
  return lines;
}

function compileWhileStatement(statement, compilerState, level, contextName) {
  const lines = [
    line(
      level,
      `while (__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.condition, "__flowContext")}, ${contextName})) {`
    )
  ];
  lines.push(...compileStatements(statement.body, compilerState, level + 1, contextName));
  lines.push(line(level, "}"));
  return lines;
}

function compileStatements(statements, compilerState, level, contextName) {
  const lines = [];

  for (const statement of statements) {
    lines.push(...compileStatement(statement, compilerState, level, contextName));
  }

  return lines;
}

function compileBuiltinCallExpression(expression, contextName, recordName = null) {
  const compiledArgs = expression.args.map((arg) => compileExpression(arg, contextName, recordName));

  switch (expression.callee) {
    case "round":
      if (compiledArgs.length === 1) {
        return `__flowRuntime.round(${compiledArgs[0]})`;
      }

      return `__flowRuntime.round(${compiledArgs[0]}, ${compiledArgs[1]})`;
    case "floor":
      return `Math.floor(${compiledArgs[0]})`;
    case "ceil":
      return `Math.ceil(${compiledArgs[0]})`;
    case "fixed":
      return `__flowRuntime.fixed(${compiledArgs[0]}, ${compiledArgs[1]})`;
    default:
      throw new Error(`Unsupported builtin call: ${expression.callee}`);
  }
}

function compileStringOperationExpression(expression, contextName, recordName = null) {
  const left = compileExpression(expression.left, contextName, recordName);
  const right = compileExpression(expression.right, contextName, recordName);

  switch (expression.operator) {
    case "CONTAINS":
      return `(String(${left}).includes(String(${right})))`;
    case "STARTS_WITH":
      return `(String(${left}).startsWith(String(${right})))`;
    case "ENDS_WITH":
      return `(String(${left}).endsWith(String(${right})))`;
    case "JOINED_WITH":
      return `(__flowRuntime.formatValue(${left}) + __flowRuntime.formatValue(${right}))`;
    default:
      throw new Error(`Unsupported string operation: ${expression.operator}`);
  }
}

function compileName(nameParts) {
  return JSON.stringify(nameParts.join(" "));
}

function line(level, text) {
  return `${"  ".repeat(level)}${text}`;
}

function indent(source) {
  return source
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
