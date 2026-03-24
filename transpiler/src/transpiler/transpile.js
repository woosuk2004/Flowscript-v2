import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize as normalizePath, relative as relativePath, resolve as resolvePath } from "node:path";

import { parse } from "../parser/parser.js";
import { TOKEN_KINDS } from "../tokens/token-kinds.js";

const BUILT_IN_MODULE_PATHS = Object.freeze({
  files: "__flowscript_builtin__/standard/files.flow"
});

function isBuiltInModuleSourcePath(sourcePath) {
  return sourcePath === "./standard/files.flow";
}

function isBuiltInResolvedModulePath(resolvedPath) {
  return Object.values(BUILT_IN_MODULE_PATHS).includes(resolvedPath);
}

function createHostError(message, code, kind = "FileError", details = null, source = null) {
  const error = new Error(message);
  error.code = code;
  error.name = kind;
  error.details = details;
  error.source = source;
  return error;
}

function isPathInsideWorkspace(workspaceRoot, candidatePath) {
  const relative = relativePath(workspaceRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !isAbsolute(relative));
}

function createHostApi(entryPath = null) {
  const normalizedEntryPath = entryPath ? resolvePath(entryPath) : null;
  const workspaceRoot = normalizedEntryPath ? dirname(normalizedEntryPath) : resolvePath(process.cwd());

  function resolveWorkspaceFilePath(rawPath, baseFilePath = null) {
    if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
      throw createHostError("File path must be Text", "INVALID_FILE_PATH", "FilePathError", rawPath);
    }

    if (isAbsolute(rawPath)) {
      throw createHostError("Absolute file paths are not allowed", "INVALID_FILE_PATH", "FilePathError", rawPath);
    }

    const baseDirectory = baseFilePath ? dirname(baseFilePath) : workspaceRoot;
    const resolvedPath = normalizePath(resolvePath(baseDirectory, rawPath));

    if (!isPathInsideWorkspace(workspaceRoot, resolvedPath)) {
      throw createHostError("File path must stay inside the workspace", "INVALID_FILE_PATH", "FilePathError", rawPath, resolvedPath);
    }

    return resolvedPath;
  }

  return {
    workspaceRoot,
    resolveWorkspaceFilePath,
    readTextFile(rawPath, baseFilePath = null) {
      const resolvedPath = resolveWorkspaceFilePath(rawPath, baseFilePath);

      try {
        return readFileSync(resolvedPath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw createHostError(`File not found: ${rawPath}`, "FILE_NOT_FOUND", "FileError", rawPath, resolvedPath);
        }

        throw createHostError(`Could not read file: ${rawPath}`, "FILE_NOT_READABLE", "FileError", rawPath, resolvedPath);
      }
    },
    writeTextFile(rawPath, text, baseFilePath = null) {
      const resolvedPath = resolveWorkspaceFilePath(rawPath, baseFilePath);

      if (typeof text !== "string") {
        throw createHostError("File contents must be Text", "INVALID_FILE_CONTENT", "FileError", text, resolvedPath);
      }

      try {
        writeFileSync(resolvedPath, text, "utf8");
        return null;
      } catch (error) {
        throw createHostError(`Could not write file: ${rawPath}`, "FILE_NOT_WRITABLE", "FileError", rawPath, resolvedPath);
      }
    },
    appendTextFile(rawPath, text, baseFilePath = null) {
      const resolvedPath = resolveWorkspaceFilePath(rawPath, baseFilePath);

      if (typeof text !== "string") {
        throw createHostError("File contents must be Text", "INVALID_FILE_CONTENT", "FileError", text, resolvedPath);
      }

      try {
        appendFileSync(resolvedPath, text, "utf8");
        return null;
      } catch (error) {
        throw createHostError(`Could not append file: ${rawPath}`, "FILE_NOT_WRITABLE", "FileError", rawPath, resolvedPath);
      }
    },
    fileExists(rawPath, baseFilePath = null) {
      const resolvedPath = resolveWorkspaceFilePath(rawPath, baseFilePath);
      return existsSync(resolvedPath);
    },
    deleteFile(rawPath, baseFilePath = null) {
      const resolvedPath = resolveWorkspaceFilePath(rawPath, baseFilePath);

      try {
        unlinkSync(resolvedPath);
        return null;
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw createHostError(`File not found: ${rawPath}`, "FILE_NOT_FOUND", "FileError", rawPath, resolvedPath);
        }

        throw createHostError(`Could not delete file: ${rawPath}`, "DELETE_FILE_FAILED", "FileError", rawPath, resolvedPath);
      }
    }
  };
}

function executeCompiledProgram(compiledSource, hostApi) {
  const previousHost = globalThis.__flowHost;
  globalThis.__flowHost = hostApi;

  try {
    return new Function(`return ${compiledSource};`)();
  } finally {
    if (previousHost === undefined) {
      delete globalThis.__flowHost;
    } else {
      globalThis.__flowHost = previousHost;
    }
  }
}

const RUNTIME_SOURCE = String.raw`
function createFlowScriptRuntime() {
  const cells = new Map();
  const types = new Map();
  const functions = new Map();
  const modules = new Map();
  const tasks = new Set();
  const evaluationStack = [];
  let taskCompletionIndex = 0;
  let taskScheduleIndex = 0;
  let taskVirtualTime = 0;
  const noValue = Object.freeze({ __flowKind: "NO_VALUE" });
  const normalizeName = (name) => String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !["a", "an", "the"].includes(part.toLowerCase()))
    .join(" ");
  const makeContext = (parent = null, locals = Object.create(null), localTarget = null, filePath = null) => ({
    __flowLocalTarget: localTarget,
    __flowFilePath: filePath ?? parent?.__flowFilePath ?? null,
    has(name) {
      const normalizedName = normalizeName(name);

      if (Object.prototype.hasOwnProperty.call(locals, normalizedName)) {
        return true;
      }

      if (parent) {
        return parent.has(normalizedName);
      }

      return runtime.has(normalizedName);
    },
    get(name) {
      const normalizedName = normalizeName(name);

      if (Object.prototype.hasOwnProperty.call(locals, normalizedName)) {
        return locals[normalizedName];
      }

      if (parent) {
        return parent.get(normalizedName);
      }

      return runtime.get(normalizedName);
    },
    setLocal(name, value) {
      const normalizedName = normalizeName(name);

      if (localTarget) {
        localTarget[normalizedName] = value;
        return value;
      }

      if (parent) {
        return parent.setLocal(normalizedName, value);
      }

      return runtime.set(normalizedName, value);
    }
  });
  const runtime = {
    output: [],
    noValue,
    normalizeName,
    set(name, value) {
      cells.set(normalizeName(name), { kind: "static", value });
      return value;
    },
    defineReactive(name, evaluator, definitionContext = runtime.context) {
      cells.set(normalizeName(name), { kind: "reactive", evaluator, definitionContext });
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
    normalizeActionName(name) {
      return String(name);
    },
    normalizeFunctionName(name) {
      return normalizeName(name);
    },
    isCallable(value) {
      return Boolean(value && typeof value === "object" && value.__flowKind === "CALLABLE");
    },
    isTask(value) {
      return Boolean(value && typeof value === "object" && value.__flowKind === "TASK");
    },
    isErrorValue(value) {
      return Boolean(value && typeof value === "object" && value.__flowKind === "ERROR");
    },
    createErrorValue(message, code = "RUNTIME_ERROR", kind = "RuntimeError", details = noValue, source = noValue) {
      return {
        __flowKind: "ERROR",
        message: String(message),
        code: String(code),
        kind: String(kind),
        details,
        source
      };
    },
    toErrorValue(error) {
      if (runtime.isErrorValue(error)) {
        return error;
      }

      if (error instanceof Error) {
        return runtime.createErrorValue(
          error.message,
          error.code ?? "RUNTIME_ERROR",
          error.name ?? "RuntimeError",
          error.details ?? noValue,
          error.source ?? noValue
        );
      }

      return runtime.createErrorValue(String(error));
    },
    isModuleNamespace(value) {
      return Boolean(value && typeof value === "object" && value.__flowKind === "MODULE_NAMESPACE");
    },
    typeRefsEqual(left, right) {
      if (!left || !right) {
        return left === right;
      }

      if (left.kind !== right.kind) {
        return false;
      }

      if (left.kind === "list") {
        return runtime.typeRefsEqual(left.itemType, right.itemType);
      }

      return normalizeName(left.name) === normalizeName(right.name);
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
    isNoValue(value) {
      return value === noValue;
    },
    normalizeIntegerIndex(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
        return null;
      }

      return value;
    },
    normalizeTakeCount(value) {
      const normalized = runtime.normalizeIntegerIndex(value);

      if (normalized === null || normalized <= 0) {
        return 0;
      }

      return normalized;
    },
    firstItemOf(collection) {
      const normalized = runtime.asCollection(collection);
      return normalized.length === 0 ? noValue : normalized[0];
    },
    lastItemOf(collection) {
      const normalized = runtime.asCollection(collection);
      return normalized.length === 0 ? noValue : normalized[normalized.length - 1];
    },
    itemAtIndex(collection, index) {
      const normalized = runtime.asCollection(collection);
      const normalizedIndex = runtime.normalizeIntegerIndex(index);

      if (normalizedIndex === null || normalizedIndex < 0 || normalizedIndex >= normalized.length) {
        return noValue;
      }

      return normalized[normalizedIndex];
    },
    firstItemsOf(collection, count) {
      const normalized = runtime.asCollection(collection);
      return normalized.slice(0, runtime.normalizeTakeCount(count));
    },
    lastItemsOf(collection, count) {
      const normalized = runtime.asCollection(collection);
      const takeCount = runtime.normalizeTakeCount(count);

      if (takeCount === 0) {
        return [];
      }

      return normalized.slice(Math.max(0, normalized.length - takeCount));
    },
    itemsFromIndexToIndex(collection, start, end) {
      const normalized = runtime.asCollection(collection);
      const normalizedStart = runtime.normalizeIntegerIndex(start);
      const normalizedEnd = runtime.normalizeIntegerIndex(end);

      if (normalizedStart === null || normalizedEnd === null || normalized.length === 0) {
        return [];
      }

      const startIndex = Math.max(0, normalizedStart);
      const endIndex = Math.min(normalized.length - 1, normalizedEnd);

      if (endIndex < startIndex) {
        return [];
      }

      return normalized.slice(startIndex, endIndex + 1);
    },
    valuesEqual(left, right) {
      if (runtime.isNoValue(left) || runtime.isNoValue(right)) {
        return left === right;
      }

      if (runtime.isPrimitive(left) && runtime.isPrimitive(right)) {
        return runtime.primitiveKey(left) === runtime.primitiveKey(right);
      }

      return left === right;
    },
    indexOfItem(collection, item) {
      const normalized = runtime.asCollection(collection);
      const index = normalized.findIndex((candidate) => runtime.valuesEqual(candidate, item));
      return index === -1 ? noValue : index;
    },
    countOf(collection) {
      return runtime.asCollection(collection).length;
    },
    isCollectionEmpty(collection) {
      return runtime.countOf(collection) === 0;
    },
    collectionContainsItem(collection, item) {
      if (!runtime.isPrimitive(item)) {
        return false;
      }

      const targetKey = runtime.primitiveKey(item);
      return runtime.asCollection(collection).some((candidate) => runtime.isPrimitive(candidate) && runtime.primitiveKey(candidate) === targetKey);
    },
    collectionHasAnyOf(collection, items) {
      return items.some((item) => runtime.isPrimitive(item) && runtime.collectionContainsItem(collection, item));
    },
    collectionHasAllOf(collection, items) {
      return items.every((item) => runtime.isPrimitive(item) && runtime.collectionContainsItem(collection, item));
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
    accessLevelRank(accessLevel) {
      if (accessLevel === "private") {
        return 0;
      }

      if (accessLevel === "protected") {
        return 1;
      }

      return 2;
    },
    isTypeNameKindOf(typeName, ancestorTypeName) {
      let currentType = runtime.getType(typeName);
      const normalizedAncestorTypeName = normalizeName(ancestorTypeName);

      while (currentType) {
        if (currentType.normalizedName === normalizedAncestorTypeName) {
          return true;
        }

        currentType = currentType.parentTypeName ? runtime.getType(currentType.parentTypeName) : null;
      }

      return false;
    },
    canAccessMember(member, accessContext = null) {
      if (member.accessLevel === "public") {
        return true;
      }

      if (!accessContext || accessContext.kind !== "internal" || !accessContext.declaringTypeName) {
        return false;
      }

      const normalizedCallerTypeName = normalizeName(accessContext.declaringTypeName);
      if (member.accessLevel === "private") {
        return normalizedCallerTypeName === member.declaredOnTypeName;
      }

      return runtime.isTypeNameKindOf(normalizedCallerTypeName, member.declaredOnTypeName);
    },
    finalizeActionResult(action, result, expectReturn = false) {
      if (expectReturn && !action.returnType) {
        throw new Error('Action "' + action.name + '" does not declare a return value');
      }

      if (!action.returnType) {
        return result;
      }

      if (result === undefined) {
        throw new Error('Action "' + action.name + '" must return a value');
      }

      runtime.validateType(result, action.returnType, 'Return value of action "' + action.name + '"');
      return result;
    },
    finalizeFunctionResult(definition, result, expectReturn = false) {
      if (expectReturn && !definition.returnType) {
        throw new Error('Function "' + definition.displayName + '" does not declare a return value');
      }

      if (!definition.returnType) {
        return result;
      }

      if (result === undefined) {
        throw new Error('Function "' + definition.displayName + '" must return a value');
      }

      runtime.validateType(result, definition.returnType, 'Return value of function "' + definition.displayName + '"');
      return result;
    },
    assertContract(kind, functionName, description, passed) {
      if (!passed) {
        const label = kind === "ensure" ? "Ensure" : "Verify";
        throw new Error(label + ' failed in "' + functionName + '": ' + description);
      }
    },
    defineFunction(name, definition) {
      const normalizedName = runtime.normalizeFunctionName(name);

      functions.set(normalizedName, {
        __flowKind: "CALLABLE",
        ...definition,
        displayName: definition.displayName ?? String(name),
        normalizedName
      });
    },
    createAnonymousCallable(definition, closureContext = runtime.context) {
      return {
        __flowKind: "CALLABLE",
        ...definition,
        displayName: definition.displayName ?? "anonymous function",
        closureContext
      };
    },
    getFunction(name) {
      const normalizedName = runtime.normalizeFunctionName(name);

      if (!functions.has(normalizedName)) {
        throw new Error('Undefined function "' + normalizedName + '"');
      }

      return functions.get(normalizedName);
    },
    defineModule(moduleId, displayName, exportEntries) {
      const exports = new Map();

      for (const entry of exportEntries) {
        exports.set(normalizeName(entry.exportName), entry);
      }

      const namespace = {
        __flowKind: "MODULE_NAMESPACE",
        moduleId,
        displayName
      };

      modules.set(moduleId, {
        id: moduleId,
        displayName,
        exports,
        namespace
      });
    },
    getModuleNamespace(moduleId) {
      const moduleRecord = modules.get(moduleId);

      if (!moduleRecord) {
        throw new Error('Undefined module "' + moduleId + '"');
      }

      return moduleRecord.namespace;
    },
    getModuleExport(moduleId, exportName) {
      const moduleRecord = modules.get(moduleId);

      if (!moduleRecord) {
        throw new Error('Undefined module "' + moduleId + '"');
      }

      const normalizedExportName = normalizeName(exportName);
      const entry = moduleRecord.exports.get(normalizedExportName);

      if (!entry) {
        throw new Error('Module "' + moduleRecord.displayName + '" does not share "' + normalizedExportName + '"');
      }

      if (entry.kind === "function") {
        return runtime.getFunction(entry.internalName);
      }

      if (entry.kind === "type") {
        return runtime.getType(entry.internalName);
      }

      return runtime.get(entry.internalName);
    },
    createTask(body, displayName = "background task", delayMilliseconds = 0) {
      const task = {
        __flowKind: "TASK",
        displayName,
        state: "pending",
        result: undefined,
        error: null,
        handled: false,
        completedOrder: null,
        readyAt: taskVirtualTime + delayMilliseconds,
        scheduleOrder: taskScheduleIndex,
        body
      };

      taskScheduleIndex += 1;

      tasks.add(task);
      return task;
    },
    settleTask(task, state, payload) {
      if (task.state !== "pending") {
        return task;
      }

      task.state = state;
      if (state === "fulfilled") {
        task.result = payload;
      } else if (state === "failed" || state === "canceled") {
        task.error = runtime.toErrorValue(payload);
      }

      task.completedOrder = taskCompletionIndex;
      taskCompletionIndex += 1;
      return task;
    },
    runTask(task) {
      if (!runtime.isTask(task) || task.state !== "pending") {
        return task;
      }

      try {
        const result = task.body();
        return runtime.settleTask(task, "fulfilled", result);
      } catch (error) {
        return runtime.settleTask(task, "failed", error);
      }
    },
    advanceTaskClock(targetTime) {
      taskVirtualTime = Math.max(taskVirtualTime, targetTime);
      const runnableTasks = [...tasks]
        .filter((task) => task.state === "pending" && task.readyAt <= taskVirtualTime)
        .sort((left, right) => (left.readyAt - right.readyAt) || (left.scheduleOrder - right.scheduleOrder));

      for (const task of runnableTasks) {
        runtime.runTask(task);
      }
    },
    flushPendingTasks() {
      const pendingTasks = [...tasks].filter((task) => task.state === "pending");
      if (pendingTasks.length === 0) {
        return;
      }

      const finalReadyAt = pendingTasks.reduce((maximum, task) => Math.max(maximum, task.readyAt), taskVirtualTime);
      runtime.advanceTaskClock(finalReadyAt);
    },
    createBackgroundTask(body, displayName = "background task") {
      const task = runtime.createTask(body, displayName, 0);
      runtime.advanceTaskClock(task.readyAt);
      return task;
    },
    createDelayedTask(body, delayMilliseconds, displayName = "delayed task") {
      return runtime.createTask(body, displayName, delayMilliseconds);
    },
    startDelayedTask(body, delayMilliseconds, displayName = "delayed task") {
      return runtime.createDelayedTask(body, delayMilliseconds, displayName);
    },
    startBackgroundTask(body, displayName = "background task") {
      return runtime.createBackgroundTask(body, displayName);
    },
    cancelTask(value) {
      if (!runtime.isTask(value)) {
        throw runtime.createErrorValue("Cancel expects a background task", "CANCEL_EXPECTS_TASK", "TaskError");
      }

      if (value.state !== "pending") {
        return value;
      }

      return runtime.settleTask(
        value,
        "canceled",
        runtime.createErrorValue("Task was canceled", "TASK_CANCELED", "CanceledError")
      );
    },
    waitTimeoutMilliseconds(value, unit) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw runtime.createErrorValue("Wait timeout must be a non-negative number", "INVALID_WAIT_TIMEOUT", "WaitError");
      }

      switch (unit) {
        case "millisecond":
        case "milliseconds":
          return value;
        case "second":
        case "seconds":
          return value * 1000;
        case "minute":
        case "minutes":
          return value * 60 * 1000;
        default:
          throw runtime.createErrorValue('Unsupported wait timeout unit "' + unit + '"', "INVALID_WAIT_TIMEOUT_UNIT", "WaitError");
      }
    },
    formatDuration(milliseconds) {
      if (milliseconds % (60 * 1000) === 0) {
        const minutes = milliseconds / (60 * 1000);
        return minutes === 1 ? "1 minute" : String(minutes) + " minutes";
      }

      if (milliseconds % 1000 === 0) {
        const seconds = milliseconds / 1000;
        return seconds === 1 ? "1 second" : String(seconds) + " seconds";
      }

      return milliseconds === 1 ? "1 millisecond" : String(milliseconds) + " milliseconds";
    },
    assertWaitNotTimedOut(value, timeoutMilliseconds) {
      if (timeoutMilliseconds === null || timeoutMilliseconds === undefined) {
        return;
      }

      if (runtime.isTask(value) && value.state === "pending" && value.readyAt - taskVirtualTime > timeoutMilliseconds) {
        throw runtime.createErrorValue(
          "Wait timed out after " + runtime.formatDuration(timeoutMilliseconds),
          "WAIT_TIMEOUT",
          "TimeoutError"
        );
      }
    },
    waitFor(value, timeoutMilliseconds = null) {
      if (!runtime.isTask(value)) {
        throw runtime.createErrorValue("Wait for expects a background task", "WAIT_EXPECTS_TASK", "WaitError");
      }

      runtime.assertWaitNotTimedOut(value, timeoutMilliseconds);
      if (value.state === "pending") {
        runtime.advanceTaskClock(value.readyAt);
      }
      value.handled = true;

      if (value.state === "failed" || value.state === "canceled") {
        throw value.error;
      }

      return value.result === undefined ? runtime.noValue : value.result;
    },
    waitForAll(values, timeoutMilliseconds = null) {
      if (!Array.isArray(values) || values.length === 0) {
        throw runtime.createErrorValue("Wait for all of (...) expects at least one background task", "WAIT_ALL_EXPECTS_TASKS", "WaitError");
      }

      values.forEach((value) => {
        if (!runtime.isTask(value)) {
          throw runtime.createErrorValue("Wait for all of (...) expects background tasks", "WAIT_ALL_EXPECTS_TASKS", "WaitError");
        }
        runtime.assertWaitNotTimedOut(value, timeoutMilliseconds);
      });

      const latestReadyAt = values.reduce((maximum, value) => Math.max(maximum, value.readyAt ?? taskVirtualTime), taskVirtualTime);
      runtime.advanceTaskClock(latestReadyAt);
      return values.map((value) => runtime.waitFor(value, timeoutMilliseconds));
    },
    waitForAny(values, timeoutMilliseconds = null) {
      if (!Array.isArray(values) || values.length === 0) {
        throw runtime.createErrorValue("Wait for any of (...) expects at least one background task", "WAIT_ANY_EXPECTS_TASKS", "WaitError");
      }

      const tasksOnly = values.map((value) => {
        if (!runtime.isTask(value)) {
          throw runtime.createErrorValue("Wait for any of (...) expects background tasks", "WAIT_ANY_EXPECTS_TASKS", "WaitError");
        }

        return value;
      });

      const completedTasks = tasksOnly.filter((task) => task.state !== "pending").sort((left, right) => left.completedOrder - right.completedOrder);
      if (completedTasks.length > 0) {
        return runtime.waitFor(completedTasks[0], timeoutMilliseconds);
      }

      const nextReadyAt = tasksOnly.reduce((minimum, task) => Math.min(minimum, task.readyAt), Number.POSITIVE_INFINITY);
      if (timeoutMilliseconds !== null && nextReadyAt - taskVirtualTime > timeoutMilliseconds) {
        throw runtime.createErrorValue(
          "Wait timed out after " + runtime.formatDuration(timeoutMilliseconds),
          "WAIT_TIMEOUT",
          "TimeoutError"
        );
      }

      runtime.advanceTaskClock(nextReadyAt);
      const firstCompletedTask = tasksOnly
        .filter((task) => task.state !== "pending")
        .sort((left, right) => left.completedOrder - right.completedOrder)[0];
      return runtime.waitFor(firstCompletedTask, timeoutMilliseconds);
    },
    finish() {
      runtime.flushPendingTasks();
      const unhandledFailure = [...tasks].find((task) => task.state === "failed" && !task.handled);

      if (unhandledFailure) {
        const errorMessage = runtime.toErrorValue(unhandledFailure.error).message;
        throw new Error("Unhandled background task failure: " + errorMessage);
      }
    },
    resolveCallable(target, parentContext = runtime.context) {
      if (runtime.isCallable(target)) {
        return target;
      }

      if (typeof target !== "string") {
        throw new Error("Expected a callable value");
      }

      const normalizedName = runtime.normalizeFunctionName(target);

      if (parentContext?.has(normalizedName)) {
        const value = parentContext.get(normalizedName);

        if (!runtime.isCallable(value)) {
          throw new Error('"' + normalizedName + '" is not callable');
        }

        return value;
      }

      return runtime.getFunction(normalizedName);
    },
    callFunction(target, args = [], parentContext = runtime.context, expectReturn = false) {
      const definition = runtime.resolveCallable(target, parentContext);

      if (args.length !== definition.params.length) {
        throw new Error('Function "' + definition.displayName + '" expects ' + definition.params.length + " argument(s)");
      }

      return runtime.finalizeFunctionResult(definition, definition.body(args, definition.closureContext ?? parentContext), expectReturn);
    },
    defineType(name, definition) {
      const normalizedName = normalizeName(name);
      const parentDefinition = definition.parentTypeName ? runtime.getType(definition.parentTypeName) : null;
      const properties = [];
      const propertyMap = new Map();

      if (parentDefinition) {
        for (const property of parentDefinition.properties) {
          properties.push(property);
          propertyMap.set(property.normalizedName, property);
        }
      }

      for (const property of definition.properties) {
        if (propertyMap.has(property.normalizedName)) {
          throw new Error('Property "' + property.displayName + '" is already defined on type "' + definition.displayName + '"');
        }

        const resolvedProperty = {
          ...property,
          accessLevel: property.accessLevel ?? "public",
          declaredOnTypeName: normalizedName
        };
        properties.push(resolvedProperty);
        propertyMap.set(property.normalizedName, resolvedProperty);
      }

      const actions = new Map();
      if (parentDefinition) {
        for (const [actionName, bucket] of parentDefinition.actions.entries()) {
          actions.set(actionName, bucket.slice());
        }
      }

      const ownActionNames = new Set();

      for (const action of definition.actions) {
        const normalizedActionName = runtime.normalizeActionName(action.name);
        if (ownActionNames.has(normalizedActionName)) {
          throw new Error('Action "' + action.name + '" is already defined on type "' + definition.displayName + '"');
        }

        ownActionNames.add(normalizedActionName);
        const existingBucket = actions.get(normalizedActionName) ?? [];
        const overrideTarget = [...existingBucket].reverse().find((candidate) => candidate.accessLevel !== "private");
        const resolvedAction = {
          ...action,
          accessLevel: action.accessLevel ?? "public",
          declaredOnTypeName: normalizedName
        };

        if (overrideTarget && runtime.accessLevelRank(resolvedAction.accessLevel) < runtime.accessLevelRank(overrideTarget.accessLevel)) {
          throw new Error(
            'Action "' +
              action.name +
              '" on type "' +
              definition.displayName +
              '" cannot narrow visibility from ' +
              overrideTarget.accessLevel +
              " to " +
              resolvedAction.accessLevel
          );
        }

        if (overrideTarget && !runtime.typeRefsEqual(resolvedAction.returnType ?? null, overrideTarget.returnType ?? null)) {
          throw new Error(
            'Action "' + action.name + '" on type "' + definition.displayName + '" must keep the same return type as the parent action'
          );
        }

        existingBucket.push(resolvedAction);
        actions.set(normalizedActionName, existingBucket);
      }

      const beforeActionHooks = new Map();
      const afterActionHooks = new Map();
      if (parentDefinition) {
        for (const [actionName, bucket] of parentDefinition.beforeActionHooks.entries()) {
          beforeActionHooks.set(actionName, bucket.slice());
        }

        for (const [actionName, bucket] of parentDefinition.afterActionHooks.entries()) {
          afterActionHooks.set(actionName, bucket.slice());
        }
      }

      const attachHooks = (hooks, hookKind, targetMap) => {
        for (const hook of hooks) {
          const normalizedActionName = runtime.normalizeActionName(hook.actionName);
          const bucket = actions.get(normalizedActionName) ?? [];
          const targetAction =
            [...bucket].reverse().find((candidate) => candidate.declaredOnTypeName === normalizedName || candidate.accessLevel !== "private") ?? null;

          if (!targetAction) {
            throw new Error(
              'Type "' + definition.displayName + '" cannot define a ' + hookKind + ' hook for unknown or inaccessible action "' + hook.actionName + '"'
            );
          }

          if (hook.params.length !== targetAction.params.length) {
            throw new Error(
              'Type "' +
                definition.displayName +
                '" must use ' +
                targetAction.params.length +
                ' hook parameter(s) for action "' +
                hook.actionName +
                '"'
            );
          }

          const existingHooks = targetMap.get(normalizedActionName) ?? [];
          existingHooks.push({
            ...hook,
            hookKind,
            declaredOnTypeName: normalizedName
          });
          targetMap.set(normalizedActionName, existingHooks);
        }
      };

      attachHooks(definition.beforeHooks ?? [], "before", beforeActionHooks);
      attachHooks(definition.afterHooks ?? [], "after", afterActionHooks);

      const resolvedDefinition = {
        displayName: definition.displayName,
        normalizedName,
        parentTypeName: parentDefinition ? parentDefinition.normalizedName : null,
        properties,
        propertyMap,
        actions,
        beforeActionHooks,
        afterActionHooks,
        constructorArity: Math.max(parentDefinition ? parentDefinition.constructorArity : 0, definition.createdHook ? definition.createdHook.params.length : 0),
        createdHooks: [
          ...(parentDefinition ? parentDefinition.createdHooks : []),
          ...(definition.createdHook ? [{ ...definition.createdHook, declaredOnTypeName: normalizedName }] : [])
        ],
        updatedHooks: [
          ...(parentDefinition ? parentDefinition.updatedHooks : []),
          ...(definition.updatedHook ? [{ ...definition.updatedHook, declaredOnTypeName: normalizedName }] : [])
        ]
      };

      types.set(normalizedName, resolvedDefinition);
      return resolvedDefinition;
    },
    getType(name) {
      const normalizedName = normalizeName(name);

      if (!types.has(normalizedName)) {
        throw new Error('Undefined type "' + normalizedName + '"');
      }

      return types.get(normalizedName);
    },
    isInstance(value) {
      return Boolean(value && typeof value === "object" && value.__flowKind === "INSTANCE");
    },
    isInstanceOfType(value, typeName) {
      if (!runtime.isInstance(value)) {
        return false;
      }

      const expectedType = runtime.getType(typeName);
      let currentType = runtime.getType(value.typeName);

      while (currentType) {
        if (currentType.normalizedName === expectedType.normalizedName) {
          return true;
        }

        currentType = currentType.parentTypeName ? runtime.getType(currentType.parentTypeName) : null;
      }

      return false;
    },
    validateType(value, typeRef, context = "value") {
      if (typeRef.kind === "list") {
        if (!Array.isArray(value)) {
          throw new Error(context + " must be a list");
        }

        for (const item of value) {
          runtime.validateType(item, typeRef.itemType, context + " item");
        }

        return;
      }

      const normalizedTypeName = normalizeName(typeRef.name);
      if (normalizedTypeName.toLowerCase() === "text") {
        if (typeof value !== "string") {
          throw new Error(context + " must be Text");
        }
        return;
      }

      if (normalizedTypeName.toLowerCase() === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(context + " must be Number");
        }
        return;
      }

      if (normalizedTypeName.toLowerCase() === "yesno") {
        if (typeof value !== "boolean") {
          throw new Error(context + " must be YesNo");
        }
        return;
      }

      if (normalizedTypeName.toLowerCase() === "function") {
        if (!runtime.isCallable(value)) {
          throw new Error(context + " must be Function");
        }
        return;
      }

      if (normalizedTypeName.toLowerCase() === "task") {
        if (!runtime.isTask(value)) {
          throw new Error(context + " must be Task");
        }
        return;
      }

      if (!runtime.isInstanceOfType(value, normalizedTypeName)) {
        throw new Error(context + ' must be a "' + typeRef.displayName + '"');
      }
    },
    createInstance(typeName, constructorArgs = [], initialValues = new Map()) {
      const typeDefinition = runtime.getType(typeName);
      const values = Object.create(null);

      if (constructorArgs.length !== typeDefinition.constructorArity) {
        throw new Error('Type "' + typeDefinition.displayName + '" expects ' + typeDefinition.constructorArity + " constructor argument(s)");
      }

      for (const property of typeDefinition.properties) {
        if (initialValues.has(property.normalizedName)) {
          const value = initialValues.get(property.normalizedName);
          runtime.validateType(value, property.typeRef, 'Property "' + property.displayName + '"');
          values[property.normalizedName] = value;
          continue;
        }

        if (property.hasDefault) {
          const defaultValue = property.defaultEvaluator(runtime.context);
          runtime.validateType(defaultValue, property.typeRef, 'Property "' + property.displayName + '"');
          values[property.normalizedName] = defaultValue;
        }
      }

      for (const propertyName of initialValues.keys()) {
        if (!typeDefinition.propertyMap.has(propertyName)) {
          throw new Error('Unknown property "' + propertyName + '" for type "' + typeDefinition.displayName + '"');
        }
      }

      const instance = {
        __flowKind: "INSTANCE",
        typeName: typeDefinition.normalizedName,
        values,
        __flowSuppressUpdatedHooks: true,
        __flowRunningUpdatedHooks: false
      };

      for (const createdHook of typeDefinition.createdHooks) {
        createdHook.body(instance, constructorArgs);
      }

      instance.__flowSuppressUpdatedHooks = false;

      for (const property of typeDefinition.properties) {
        if (!(property.normalizedName in instance.values)) {
          throw new Error('Missing required property "' + property.displayName + '" for type "' + typeDefinition.displayName + '"');
        }

        runtime.validateType(instance.values[property.normalizedName], property.typeRef, 'Property "' + property.displayName + '"');
      }

      return instance;
    },
    getProperty(instance, propertyName, accessContext = null) {
      if (runtime.isModuleNamespace(instance)) {
        return runtime.getModuleExport(instance.moduleId, propertyName);
      }

      if (runtime.isErrorValue(instance)) {
        const normalizedPropertyName = normalizeName(propertyName);

        switch (normalizedPropertyName) {
          case "message":
            return instance.message;
          case "code":
            return instance.code;
          case "kind":
            return instance.kind;
          case "details":
            return instance.details ?? runtime.noValue;
          case "source":
            return instance.source ?? runtime.noValue;
          default:
            throw new Error('Unknown property "' + normalizedPropertyName + '" on error value');
        }
      }

      if (!runtime.isInstance(instance)) {
        throw new Error("Expected an instance value");
      }

      const typeDefinition = runtime.getType(instance.typeName);
      const normalizedPropertyName = normalizeName(propertyName);
      const property = typeDefinition.propertyMap.get(normalizedPropertyName);

      if (!property) {
        throw new Error('Unknown property "' + normalizedPropertyName + '" on type "' + typeDefinition.displayName + '"');
      }

      if (!runtime.canAccessMember(property, accessContext)) {
        throw new Error(
          'Cannot access ' +
            property.accessLevel +
            ' property "' +
            property.displayName +
            '" on type "' +
            typeDefinition.displayName +
            '"'
        );
      }

      return instance.values[normalizedPropertyName];
    },
    setProperty(instance, propertyName, value, accessContext = null) {
      if (runtime.isModuleNamespace(instance)) {
        throw new Error('Cannot assign to shared module value "' + normalizeName(propertyName) + '"');
      }

      if (!runtime.isInstance(instance)) {
        throw new Error("Expected an instance value");
      }

      const typeDefinition = runtime.getType(instance.typeName);
      const normalizedPropertyName = normalizeName(propertyName);
      const property = typeDefinition.propertyMap.get(normalizedPropertyName);

      if (!property) {
        throw new Error('Unknown property "' + normalizedPropertyName + '" on type "' + typeDefinition.displayName + '"');
      }

      if (!runtime.canAccessMember(property, accessContext)) {
        throw new Error(
          'Cannot access ' +
            property.accessLevel +
            ' property "' +
            property.displayName +
            '" on type "' +
            typeDefinition.displayName +
            '"'
        );
      }

      runtime.validateType(value, property.typeRef, 'Property "' + property.displayName + '"');
      instance.values[normalizedPropertyName] = value;

      if (!instance.__flowSuppressUpdatedHooks && !instance.__flowRunningUpdatedHooks) {
        runtime.runUpdatedHooks(instance);
      }

      return value;
    },
    runUpdatedHooks(instance) {
      if (!runtime.isInstance(instance)) {
        throw new Error("Expected an instance value");
      }

      const typeDefinition = runtime.getType(instance.typeName);
      if (typeDefinition.updatedHooks.length === 0) {
        return;
      }

      instance.__flowRunningUpdatedHooks = true;

      try {
        for (const updatedHook of typeDefinition.updatedHooks) {
          updatedHook.body(instance);
        }
      } finally {
        instance.__flowRunningUpdatedHooks = false;
      }
    },
    callAction(instance, actionName, args = [], accessContext = null, expectReturn = false) {
      if (!runtime.isInstance(instance)) {
        throw new Error("Expected an instance value");
      }

      const typeDefinition = runtime.getType(instance.typeName);
      const normalizedActionName = runtime.normalizeActionName(actionName);
      const bucket = typeDefinition.actions.get(normalizedActionName);

      if (!bucket || bucket.length === 0) {
        throw new Error('Unknown action "' + actionName + '" on type "' + typeDefinition.displayName + '"');
      }

      let action = null;
      if (accessContext && accessContext.kind === "internal" && accessContext.declaringTypeName) {
        const normalizedCallerTypeName = normalizeName(accessContext.declaringTypeName);
        action = [...bucket].reverse().find((candidate) => candidate.declaredOnTypeName === normalizedCallerTypeName && candidate.accessLevel === "private") ?? null;
      }

      if (!action) {
        action = [...bucket].reverse().find((candidate) => runtime.canAccessMember(candidate, accessContext)) ?? null;
      }

      if (!action) {
        throw new Error('Cannot call action "' + actionName + '" on type "' + typeDefinition.displayName + '"');
      }

      if (args.length !== action.params.length) {
        throw new Error('Action "' + actionName + '" expects ' + action.params.length + " argument(s)");
      }

      const beforeHooks = typeDefinition.beforeActionHooks.get(normalizedActionName) ?? [];
      for (const hook of beforeHooks) {
        hook.body(instance, args);
      }

      const result = action.body(instance, args);

      const afterHooks = [...(typeDefinition.afterActionHooks.get(normalizedActionName) ?? [])].reverse();
      for (const hook of afterHooks) {
        hook.body(instance, args);
      }

      return runtime.finalizeActionResult(action, result, expectReturn);
    },
    callSuperAction(instance, fromTypeName, actionName, args = [], accessContext = null, expectReturn = false) {
      if (!runtime.isInstance(instance)) {
        throw new Error("Expected an instance value");
      }

      const currentType = runtime.getType(fromTypeName);
      const normalizedActionName = runtime.normalizeActionName(actionName);
      let ancestorTypeName = currentType.parentTypeName;

      while (ancestorTypeName) {
        const ancestorType = runtime.getType(ancestorTypeName);
        const bucket = ancestorType.actions.get(normalizedActionName) ?? [];
        const candidate = [...bucket].reverse().find(
          (action) => action.declaredOnTypeName === ancestorType.normalizedName && runtime.canAccessMember(action, accessContext)
        );

        if (candidate) {
          if (args.length !== candidate.params.length) {
            throw new Error('Action "' + actionName + '" expects ' + candidate.params.length + " argument(s)");
          }

          const beforeHooks = ancestorType.beforeActionHooks.get(normalizedActionName) ?? [];
          for (const hook of beforeHooks) {
            hook.body(instance, args);
          }

          const result = candidate.body(instance, args);

          const afterHooks = [...(ancestorType.afterActionHooks.get(normalizedActionName) ?? [])].reverse();
          for (const hook of afterHooks) {
            hook.body(instance, args);
          }

          return runtime.finalizeActionResult(candidate, result, expectReturn);
        }

        ancestorTypeName = ancestorType.parentTypeName;
      }

      throw new Error('No parent action "' + actionName + '" exists for type "' + currentType.displayName + '"');
    },
    get(name) {
      const normalizedName = normalizeName(name);

      if (!cells.has(normalizedName)) {
        throw new Error('Undefined variable "' + normalizedName + '"');
      }

      const cell = cells.get(normalizedName);
      if (cell.kind === "static") {
        return cell.value;
      }

      const cycleStart = evaluationStack.indexOf(normalizedName);
      if (cycleStart !== -1) {
        const cycle = evaluationStack.slice(cycleStart).concat(normalizedName).join(" -> ");
        throw new Error('Reactive cycle detected: ' + cycle);
      }

      evaluationStack.push(normalizedName);
      try {
        return cell.evaluator(cell.definitionContext ?? runtime.context);
      } finally {
        evaluationStack.pop();
      }
    },
    formatValue(value) {
      if (runtime.isNoValue(value)) {
        return "no value";
      }

      if (runtime.isCallable(value)) {
        return value.displayName ?? "anonymous function";
      }

      if (runtime.isTask(value)) {
        return value.displayName ?? "background task";
      }

      if (runtime.isErrorValue(value)) {
        return value.message;
      }

      if (value instanceof Error) {
        return value.message;
      }

      if (runtime.isModuleNamespace(value)) {
        return value.displayName;
      }

      if (Array.isArray(value)) {
        return "[" + value.map((item) => runtime.formatValue(item)).join(", ") + "]";
      }

      if (runtime.isInstance(value)) {
        const typeDefinition = runtime.getType(value.typeName);
        return typeDefinition.displayName + "{" + typeDefinition.properties.map((property) => property.displayName + ": " + runtime.formatValue(value.values[property.normalizedName])).join(", ") + "}";
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
        const normalizedName = normalizeName(rawName);

        if (!normalizedName) {
          throw new Error('Invalid interpolation reference "' + rawName + '"');
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
      return cells.has(normalizeName(name));
    },
    makeChildContext(parent, locals, localTarget = undefined) {
      return makeContext(
        parent,
        locals,
        localTarget === undefined ? parent?.__flowLocalTarget ?? null : localTarget,
        parent?.__flowFilePath ?? null
      );
    }
  };

  runtime.context = makeContext();
  runtime.context.__flowLocalTarget = null;
  runtime.host = globalThis.__flowHost ?? null;
  runtime.makeModuleContext = (filePath) => makeContext(runtime.context, Object.create(null), null, filePath);
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

const ACCESS_LEVEL_RANKS = {
  private: 0,
  protected: 1,
  public: 2
};

function areTypeReferencesEquivalent(left, right) {
  if (left === null || right === null) {
    return left === right;
  }

  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "list") {
    return areTypeReferencesEquivalent(left.itemType, right.itemType);
  }

  return normalizeStaticName(left.nameParts) === normalizeStaticName(right.nameParts);
}

let compilerStateRef = null;

export function transpile(source) {
  return transpileProgram(parse(source));
}

export async function transpileFile(path) {
  const entryPath = resolvePath(path);
  const moduleGraph = await buildModuleGraph(entryPath);
  return transpileModuleGraph(moduleGraph);
}

export function execute(source) {
  const compiled = transpile(source);
  return executeCompiledProgram(compiled, createHostApi());
}

export async function executeFile(path) {
  const compiled = await transpileFile(path);
  return executeCompiledProgram(compiled, createHostApi(path));
}

export function transpileProgram(program) {
  const compilerState = {
    tempIndex: 0,
    knownTypes: new Map(),
    knownFunctions: new Map(),
    variableTypes: new Map()
  };
  compilerStateRef = compilerState;
  const lines = [
    "(() => {",
    indent(RUNTIME_SOURCE.trimEnd()),
    "  const __flowRuntime = createFlowScriptRuntime();"
  ];

  for (const statement of program.body) {
    lines.push(...compileStatement(statement, compilerState, 1, "__flowRuntime.context", null, null, null, null, null, false));
  }

  lines.push("  __flowRuntime.finish();", "  return { scope: __flowRuntime, output: __flowRuntime.output };", "})()");
  return lines.join("\n");
}

async function buildModuleGraph(entryPath) {
  const modules = new Map();
  const loadingStack = [];
  let nextModuleIndex = 0;

  async function loadModule(filePath) {
    const resolvedPath = isBuiltInResolvedModulePath(filePath) ? filePath : resolvePath(filePath);

    const cycleStart = loadingStack.indexOf(resolvedPath);
    if (cycleStart !== -1) {
      const cycleChain = loadingStack.slice(cycleStart).concat(resolvedPath).join(" -> ");
      throw new Error(`Circular import detected: ${cycleChain}`);
    }

    if (modules.has(resolvedPath)) {
      return modules.get(resolvedPath);
    }

    loadingStack.push(resolvedPath);

    if (resolvedPath === BUILT_IN_MODULE_PATHS.files) {
      const moduleRecord = createBuiltInFilesModuleRecord(nextModuleIndex);
      nextModuleIndex += 1;
      modules.set(resolvedPath, moduleRecord);
      loadingStack.pop();
      return moduleRecord;
    }

    let source;
    try {
      source = await readFile(resolvedPath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw new Error(`Module file not found: ${resolvedPath}`);
      }

      throw error;
    }

    const program = parse(source);
    const moduleRecord = {
      id: `module${nextModuleIndex}`,
      filePath: resolvedPath,
      displayName: resolvedPath,
      program,
      imports: [],
      localDeclarations: collectTopLevelDeclarations(program, `module${nextModuleIndex}`),
      sharedNames: collectSharedNames(program)
    };
    nextModuleIndex += 1;
    modules.set(resolvedPath, moduleRecord);

    for (const statement of program.body) {
      if (statement.type === "UseNamedStatement") {
        const dependencyPath = resolveImportPath(statement.sourcePath, resolvedPath);
        const dependency = await loadModule(dependencyPath);
        moduleRecord.imports.push({
          type: "named",
          sourcePath: statement.sourcePath,
          resolvedPath: dependencyPath,
          dependencyId: dependency.id,
          imports: statement.imports
        });
        continue;
      }

      if (statement.type === "UseModuleAliasStatement") {
        const dependencyPath = resolveImportPath(statement.sourcePath, resolvedPath);
        const dependency = await loadModule(dependencyPath);
        moduleRecord.imports.push({
          type: "alias",
          sourcePath: statement.sourcePath,
          resolvedPath: dependencyPath,
          dependencyId: dependency.id,
          aliasNameParts: statement.aliasNameParts
        });
      }
    }

    loadingStack.pop();
    return moduleRecord;
  }

  await loadModule(entryPath);
  const orderedModules = topologicallyOrderModules(modules, entryPath);

  for (const moduleRecord of orderedModules) {
    finalizeModuleMetadata(moduleRecord, modules);
  }

  for (const moduleRecord of orderedModules) {
    moduleRecord.transformedProgram = transformModuleProgram(moduleRecord);
  }

  return {
    entryPath,
    modules,
    orderedModules
  };
}

function resolveImportPath(sourcePath, importerPath) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    throw new Error(`Invalid module path in ${importerPath}`);
  }

  if (isBuiltInModuleSourcePath(sourcePath)) {
    return BUILT_IN_MODULE_PATHS.files;
  }

  if (!sourcePath.startsWith("./") && !sourcePath.startsWith("../")) {
    throw new Error(`Module paths must be relative .flow paths: ${sourcePath}`);
  }

  if (!sourcePath.endsWith(".flow")) {
    throw new Error(`Module paths must end with .flow: ${sourcePath}`);
  }

  return normalizePath(resolvePath(dirname(importerPath), sourcePath));
}

function topologicallyOrderModules(modules, entryPath) {
  const ordered = [];
  const visited = new Set();

  function visit(modulePath) {
    if (visited.has(modulePath)) {
      return;
    }

    visited.add(modulePath);
    const moduleRecord = modules.get(modulePath);

    for (const importRecord of moduleRecord.imports) {
      visit(importRecord.resolvedPath);
    }

    ordered.push(moduleRecord);
  }

  visit(resolvePath(entryPath));
  return ordered;
}

function collectTopLevelDeclarations(program, moduleId) {
  const declarations = new Map();

  for (const statement of program.body) {
    const declaration = getTopLevelDeclaration(statement, moduleId);
    if (!declaration) {
      continue;
    }

    const existing = declarations.get(declaration.normalizedName);
    if (existing && existing.kind !== declaration.kind) {
      throw new Error(
        `Top-level name "${declaration.normalizedName}" is declared as both ${existing.kind} and ${declaration.kind}`
      );
    }

    if (!existing) {
      declarations.set(declaration.normalizedName, declaration);
    }
  }

  return declarations;
}

function getTopLevelDeclaration(statement, moduleId) {
  switch (statement.type) {
    case "SetStatement":
      if (statement.target.type !== "VariableAssignmentTarget") {
        return null;
      }

      return createDeclarationDescriptor(moduleId, "value", statement.target.nameParts);
    case "ReactiveSetStatement":
      return createDeclarationDescriptor(moduleId, "value", statement.nameParts);
    case "CollectionDeclarationStatement":
      return createDeclarationDescriptor(moduleId, "value", statement.nameParts);
    case "InstanceCreationStatement":
      return createDeclarationDescriptor(moduleId, "value", statement.nameParts);
    case "FunctionDeclarationStatement":
      return createDeclarationDescriptor(moduleId, "function", statement.nameParts);
    case "TypeDeclarationStatement":
      return createDeclarationDescriptor(moduleId, "type", statement.nameParts);
    default:
      return null;
  }
}

function createDeclarationDescriptor(moduleId, kind, nameParts) {
  const normalizedName = normalizeStaticName(nameParts);
  return {
    kind,
    nameParts,
    normalizedName,
    internalNameParts: [createInternalName(moduleId, kind, normalizedName)]
  };
}

function createInternalName(moduleId, kind, normalizedName) {
  return `__${moduleId}__${kind}__${normalizedName.replace(/\s+/g, "_")}`;
}

function createBuiltInFilesModuleRecord(moduleIndex) {
  const id = `module${moduleIndex}`;
  const exportNamePartsList = [
    ["read", "text", "from", "file"],
    ["write", "text", "to", "file"],
    ["append", "text", "to", "file"],
    ["file", "exists"],
    ["delete", "file"]
  ];
  const localDeclarations = new Map();

  for (const nameParts of exportNamePartsList) {
    const declaration = createDeclarationDescriptor(id, "function", nameParts);
    localDeclarations.set(declaration.normalizedName, declaration);
  }

  return {
    id,
    filePath: BUILT_IN_MODULE_PATHS.files,
    displayName: "./standard/files.flow",
    program: { type: "Program", body: [] },
    imports: [],
    localDeclarations,
    sharedNames: exportNamePartsList.map((nameParts) => normalizeStaticName(nameParts)),
    builtInKind: "files"
  };
}

function collectSharedNames(program) {
  const sharedNames = [];

  for (const statement of program.body) {
    if (statement.type !== "ShareStatement") {
      continue;
    }

    for (const nameParts of statement.namePartsList) {
      sharedNames.push(normalizeStaticName(nameParts));
    }
  }

  return sharedNames;
}

function finalizeModuleMetadata(moduleRecord, modules) {
  moduleRecord.sharedExports = [];

  for (const sharedName of moduleRecord.sharedNames) {
    const declaration = moduleRecord.localDeclarations.get(sharedName);
    if (!declaration) {
      throw new Error(`Module "${moduleRecord.filePath}" cannot share unknown top-level name "${sharedName}"`);
    }

    if (!moduleRecord.sharedExports.some((entry) => entry.exportName === sharedName)) {
      moduleRecord.sharedExports.push({
        exportName: sharedName,
        kind: declaration.kind,
        internalName: normalizeStaticName(declaration.internalNameParts)
      });
    }
  }

  const importedBindings = new Map();
  const aliasNames = new Set();

  for (const importRecord of moduleRecord.imports) {
    const dependency = modules.get(importRecord.resolvedPath);

    if (importRecord.type === "named") {
      for (const nameParts of importRecord.imports) {
        const importedName = normalizeStaticName(nameParts);
        const exportedEntry = dependency.sharedExports.find((entry) => entry.exportName === importedName);

        if (!exportedEntry) {
          throw new Error(
            `Module "${dependency.filePath}" does not share "${importedName}" required by "${moduleRecord.filePath}"`
          );
        }

        if (moduleRecord.localDeclarations.has(importedName)) {
          throw new Error(
            `Module "${moduleRecord.filePath}" cannot import "${importedName}" because that name is already declared locally`
          );
        }

        if (aliasNames.has(importedName) || importedBindings.has(importedName)) {
          throw new Error(`Module "${moduleRecord.filePath}" imports "${importedName}" more than once`);
        }

        importedBindings.set(importedName, exportedEntry.internalName);
      }

      continue;
    }

    const aliasName = normalizeStaticName(importRecord.aliasNameParts);
    if (moduleRecord.localDeclarations.has(aliasName)) {
      throw new Error(`Module "${moduleRecord.filePath}" cannot use alias "${aliasName}" because that name is already declared locally`);
    }

    if (importedBindings.has(aliasName) || aliasNames.has(aliasName)) {
      throw new Error(`Module "${moduleRecord.filePath}" imports alias "${aliasName}" more than once`);
    }

    aliasNames.add(aliasName);
  }

  moduleRecord.importedBindings = importedBindings;
  moduleRecord.aliasNames = aliasNames;
  moduleRecord.globalNameMap = new Map();

  for (const declaration of moduleRecord.localDeclarations.values()) {
    moduleRecord.globalNameMap.set(declaration.normalizedName, normalizeStaticName(declaration.internalNameParts));
  }

  for (const [name, internalName] of importedBindings.entries()) {
    moduleRecord.globalNameMap.set(name, internalName);
  }
}

function transformModuleProgram(moduleRecord) {
  return {
    type: "Program",
    body: transformStatementList(moduleRecord.program.body, moduleRecord, [new Set()], true)
  };
}

function transformStatementList(statements, moduleRecord, scopeStack, topLevel = false) {
  const transformed = [];
  const currentScope = scopeStack.at(-1);

  for (const statement of statements) {
    const transformedStatement = transformStatement(statement, moduleRecord, scopeStack, topLevel);
    if (transformedStatement) {
      transformed.push(transformedStatement);
    }

    if (topLevel) {
      continue;
    }

    const localNameParts = getLocalStatementBindingNameParts(statement);
    if (localNameParts) {
      currentScope.add(normalizeStaticName(localNameParts));
    }
  }

  return transformed;
}

function getLocalStatementBindingNameParts(statement) {
  switch (statement.type) {
    case "SetStatement":
      return statement.target.type === "VariableAssignmentTarget" ? statement.target.nameParts : null;
    case "CollectionDeclarationStatement":
    case "InstanceCreationStatement":
      return statement.nameParts;
    default:
      return null;
  }
}

function transformStatement(statement, moduleRecord, scopeStack, topLevel) {
  switch (statement.type) {
    case "ShareStatement":
    case "UseNamedStatement":
      return null;
    case "UseModuleAliasStatement":
      return {
        ...statement,
        resolvedModuleId: moduleRecord.imports.find(
          (entry) => entry.type === "alias" && normalizeStaticName(entry.aliasNameParts) === normalizeStaticName(statement.aliasNameParts)
        )?.dependencyId
      };
    case "SetStatement":
      return transformSetStatement(statement, moduleRecord, scopeStack, topLevel);
    case "ReactiveSetStatement":
      return {
        ...statement,
        nameParts: transformTopLevelOrReferenceNameParts(statement.nameParts, moduleRecord, scopeStack, topLevel, true),
        expression: transformExpression(statement.expression, moduleRecord, scopeStack)
      };
    case "PrintStatement":
      return {
        ...statement,
        value: transformExpression(statement.value, moduleRecord, scopeStack)
      };
    case "DelayedStatement":
      return {
        ...statement,
        delay: {
          ...statement.delay,
          amount: transformExpression(statement.delay.amount, moduleRecord, scopeStack)
        },
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "BackgroundStatement":
      return {
        ...statement,
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "WaitStatement":
      return {
        ...statement,
        target: transformExpression(statement.target, moduleRecord, scopeStack),
        timeout: statement.timeout
          ? {
              ...statement.timeout,
              amount: transformExpression(statement.timeout.amount, moduleRecord, scopeStack)
            }
          : null
      };
    case "TryStatement":
      {
        const failureScope = statement.errorNameParts ? new Set([normalizeStaticName(statement.errorNameParts)]) : new Set();
        return {
          ...statement,
          tryBody: transformStatementList(statement.tryBody, moduleRecord, [...scopeStack, new Set()], false),
          failureBody: transformStatementList(statement.failureBody, moduleRecord, [...scopeStack, failureScope], false),
          finallyBody: statement.finallyBody ? transformStatementList(statement.finallyBody, moduleRecord, [...scopeStack, new Set()], false) : null
        };
      }
    case "CancelStatement":
      return {
        ...statement,
        target: transformExpression(statement.target, moduleRecord, scopeStack)
      };
    case "FunctionDeclarationStatement":
      return transformFunctionDeclaration(statement, moduleRecord, scopeStack);
    case "FunctionCallStatement":
      return {
        ...statement,
        callee: transformExpression(statement.callee, moduleRecord, scopeStack),
        args: statement.args.map((arg) => transformExpression(arg, moduleRecord, scopeStack))
      };
    case "EnsureStatement":
    case "VerifyStatement":
    case "ReturnStatement":
      return {
        ...statement,
        condition: statement.condition ? transformExpression(statement.condition, moduleRecord, scopeStack) : undefined,
        value: statement.value ? transformExpression(statement.value, moduleRecord, scopeStack) : undefined
      };
    case "TypeDeclarationStatement":
      return transformTypeDeclaration(statement, moduleRecord, scopeStack);
    case "InstanceCreationStatement":
      return {
        ...statement,
        typeNameParts: transformTypeNameParts(statement.typeNameParts, moduleRecord, scopeStack),
        nameParts: transformTopLevelOrReferenceNameParts(statement.nameParts, moduleRecord, scopeStack, topLevel, true),
        constructorArgs: statement.constructorArgs.map((arg) => transformExpression(arg, moduleRecord, scopeStack)),
        initializers: statement.initializers.map((initializer) => ({
          ...initializer,
          value: transformExpression(initializer.value, moduleRecord, scopeStack)
        }))
      };
    case "ActionCallStatement":
      return {
        ...statement,
        targetNameParts:
          statement.targetNameParts === null ? null : transformReferenceNameParts(statement.targetNameParts, moduleRecord, scopeStack),
        args: statement.args.map((arg) => transformExpression(arg, moduleRecord, scopeStack))
      };
    case "CollectionDeclarationStatement":
      return {
        ...statement,
        nameParts: transformTopLevelOrReferenceNameParts(statement.nameParts, moduleRecord, scopeStack, topLevel, true),
        items: statement.items?.map((item) => transformExpression(item, moduleRecord, scopeStack)) ?? null,
        source: statement.source ? transformExpression(statement.source, moduleRecord, scopeStack) : null,
        where: statement.where ? transformExpression(statement.where, moduleRecord, scopeStack, true) : null,
        select: statement.select ? transformExpression(statement.select, moduleRecord, scopeStack, true) : null
      };
    case "CollectionPipelineStatement":
      return {
        ...statement,
        source: transformExpression(statement.source, moduleRecord, scopeStack),
        steps: statement.steps.map((step) => transformPipelineStep(step, moduleRecord, scopeStack))
      };
    case "WhenStatement":
      return {
        ...statement,
        condition: transformExpression(statement.condition, moduleRecord, scopeStack),
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "CheckStatement":
      return {
        ...statement,
        value: transformExpression(statement.value, moduleRecord, scopeStack),
        cases: statement.cases.map((caseNode) => ({
          ...caseNode,
          pattern: transformExpression(caseNode.pattern, moduleRecord, scopeStack),
          body: transformStatementList(caseNode.body, moduleRecord, [...scopeStack, new Set()], false)
        })),
        defaultCase: statement.defaultCase
          ? {
              ...statement.defaultCase,
              body: transformStatementList(statement.defaultCase.body, moduleRecord, [...scopeStack, new Set()], false)
            }
          : null
      };
    case "ForEachStatement": {
      const innerScope = new Set([normalizeStaticName(statement.itemNameParts)]);
      return {
        ...statement,
        collection: transformExpression(statement.collection, moduleRecord, scopeStack),
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, innerScope], false)
      };
    }
    case "RepeatStatement":
      return {
        ...statement,
        count: transformExpression(statement.count, moduleRecord, scopeStack),
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "WhileStatement":
      return {
        ...statement,
        condition: transformExpression(statement.condition, moduleRecord, scopeStack),
        body: transformStatementList(statement.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "BreakStatement":
    case "ContinueStatement":
      return statement;
    default:
      return statement;
  }
}

function transformSetStatement(statement, moduleRecord, scopeStack, topLevel) {
  const target = transformSetTarget(statement.target, moduleRecord, scopeStack, topLevel);
  return {
    ...statement,
    target,
    nameParts: target.type === "VariableAssignmentTarget" ? target.nameParts : null,
    value: transformExpression(statement.value, moduleRecord, scopeStack)
  };
}

function transformSetTarget(target, moduleRecord, scopeStack, topLevel) {
  if (target.type === "VariableAssignmentTarget") {
    return {
      ...target,
      nameParts: transformTopLevelOrReferenceNameParts(target.nameParts, moduleRecord, scopeStack, topLevel, true)
    };
  }

  if (target.type === "PropertyAssignmentTarget") {
    return {
      ...target,
      instanceNameParts: transformReferenceNameParts(target.instanceNameParts, moduleRecord, scopeStack)
    };
  }

  return target;
}

function transformFunctionDeclaration(statement, moduleRecord, scopeStack) {
  const paramScope = new Set(statement.params.map((param) => normalizeStaticName(param)));
  return {
    ...statement,
    nameParts: transformTopLevelOrReferenceNameParts(statement.nameParts, moduleRecord, scopeStack, true, true),
    returnType: statement.returnType ? transformTypeReference(statement.returnType, moduleRecord, scopeStack) : null,
    body: transformStatementList(statement.body, moduleRecord, [...scopeStack, paramScope], false)
  };
}

function transformTypeDeclaration(statement, moduleRecord, scopeStack) {
  return {
    ...statement,
    nameParts: transformTopLevelOrReferenceNameParts(statement.nameParts, moduleRecord, scopeStack, true, true),
    parentTypeNameParts: statement.parentTypeNameParts ? transformTypeNameParts(statement.parentTypeNameParts, moduleRecord, scopeStack) : null,
    properties: statement.properties.map((property) => ({
      ...property,
      valueType: transformTypeReference(property.valueType, moduleRecord, scopeStack),
      defaultValue: property.defaultValue ? transformExpression(property.defaultValue, moduleRecord, scopeStack) : null
    })),
    actions: statement.actions.map((action) => {
      const paramScope = new Set(action.params.map((param) => normalizeStaticName(param)));
      return {
        ...action,
        returnType: action.returnType ? transformTypeReference(action.returnType, moduleRecord, scopeStack) : null,
        body: transformStatementList(action.body, moduleRecord, [...scopeStack, paramScope], false)
      };
    }),
    beforeHooks: statement.beforeHooks.map((hook) => ({
      ...hook,
      body: transformStatementList(hook.body, moduleRecord, [...scopeStack, new Set(hook.params.map((param) => normalizeStaticName(param)))], false)
    })),
    afterHooks: statement.afterHooks.map((hook) => ({
      ...hook,
      body: transformStatementList(hook.body, moduleRecord, [...scopeStack, new Set(hook.params.map((param) => normalizeStaticName(param)))], false)
    })),
    createdHook: statement.createdHook
      ? {
          ...statement.createdHook,
          body: transformStatementList(
            statement.createdHook.body,
            moduleRecord,
            [...scopeStack, new Set(statement.createdHook.params.map((param) => normalizeStaticName(param)))],
            false
          )
        }
      : null,
    updatedHook: statement.updatedHook
      ? {
          ...statement.updatedHook,
          body: transformStatementList(statement.updatedHook.body, moduleRecord, [...scopeStack, new Set()], false)
        }
      : null
  };
}

function transformPipelineStep(step, moduleRecord, scopeStack) {
  switch (step.type) {
    case "FilterStep":
      return {
        ...step,
        condition: transformExpression(step.condition, moduleRecord, scopeStack, true)
      };
    case "TakeFirstStep":
      return {
        ...step,
        count: transformExpression(step.count, moduleRecord, scopeStack)
      };
    case "SaveStep":
      return {
        ...step,
        targetNameParts: transformReferenceNameParts(step.targetNameParts, moduleRecord, scopeStack)
      };
    default:
      return step;
  }
}

function transformTypeReference(typeReference, moduleRecord, scopeStack) {
  if (typeReference.kind === "list") {
    return {
      ...typeReference,
      itemType: transformTypeReference(typeReference.itemType, moduleRecord, scopeStack)
    };
  }

  return {
    ...typeReference,
    nameParts: transformTypeNameParts(typeReference.nameParts, moduleRecord, scopeStack)
  };
}

function transformTypeNameParts(nameParts, moduleRecord, scopeStack) {
  return transformReferenceNameParts(nameParts, moduleRecord, scopeStack);
}

function transformReferenceNameParts(nameParts, moduleRecord, scopeStack) {
  const normalizedName = normalizeStaticName(nameParts);

  if (isShadowed(normalizedName, scopeStack)) {
    return nameParts;
  }

  const rewrittenName = moduleRecord.globalNameMap.get(normalizedName);
  return rewrittenName ? [rewrittenName] : nameParts;
}

function transformTopLevelOrReferenceNameParts(nameParts, moduleRecord, scopeStack, topLevel, isAssignmentTarget = false) {
  const normalizedName = normalizeStaticName(nameParts);

  if (topLevel) {
    if (isAssignmentTarget && (moduleRecord.importedBindings.has(normalizedName) || moduleRecord.aliasNames.has(normalizedName))) {
      throw new Error(`Imported binding "${normalizedName}" is read-only in module "${moduleRecord.filePath}"`);
    }

    const rewrittenName = moduleRecord.globalNameMap.get(normalizedName);
    return rewrittenName ? [rewrittenName] : nameParts;
  }

  return nameParts;
}

function isShadowed(normalizedName, scopeStack) {
  for (let index = scopeStack.length - 1; index >= 0; index -= 1) {
    if (scopeStack[index].has(normalizedName)) {
      return true;
    }
  }

  return false;
}

function transformExpression(expression, moduleRecord, scopeStack) {
  switch (expression.type) {
    case "LiteralExpression":
      if (expression.valueType !== "string") {
        return expression;
      }

      return {
        ...expression,
        value: rewriteInterpolatedNames(expression.value, moduleRecord, scopeStack)
      };
    case "ReferenceExpression":
      return {
        ...expression,
        nameParts: transformReferenceNameParts(expression.nameParts, moduleRecord, scopeStack)
      };
    case "ActionCallExpression":
      return {
        ...expression,
        targetNameParts:
          expression.targetNameParts === null ? null : transformReferenceNameParts(expression.targetNameParts, moduleRecord, scopeStack),
        args: expression.args.map((arg) => transformExpression(arg, moduleRecord, scopeStack))
      };
    case "FunctionCallExpression":
      return {
        ...expression,
        callee: transformExpression(expression.callee, moduleRecord, scopeStack),
        args: expression.args.map((arg) => transformExpression(arg, moduleRecord, scopeStack))
      };
    case "AnonymousCallableExpression": {
      const paramScope = new Set(expression.params.map((param) => normalizeStaticName(param)));
      return {
        ...expression,
        returnType: expression.returnType ? transformTypeReference(expression.returnType, moduleRecord, scopeStack) : null,
        body: transformStatementList(expression.body, moduleRecord, [...scopeStack, paramScope], false)
      };
    }
    case "BackgroundTaskExpression":
      return {
        ...expression,
        body: transformStatementList(expression.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "DelayedTaskExpression":
      return {
        ...expression,
        delay: {
          ...expression.delay,
          amount: transformExpression(expression.delay.amount, moduleRecord, scopeStack)
        },
        body: transformStatementList(expression.body, moduleRecord, [...scopeStack, new Set()], false)
      };
    case "WaitExpression":
      return {
        ...expression,
        target: transformExpression(expression.target, moduleRecord, scopeStack),
        timeout: expression.timeout
          ? {
              ...expression.timeout,
              amount: transformExpression(expression.timeout.amount, moduleRecord, scopeStack)
            }
          : null
      };
    case "WaitAllExpression":
    case "WaitAnyExpression":
      return {
        ...expression,
        tasks: expression.tasks.map((task) => transformExpression(task, moduleRecord, scopeStack))
      };
    case "PropertyAccessExpression":
      return {
        ...expression,
        instanceNameParts: transformReferenceNameParts(expression.instanceNameParts, moduleRecord, scopeStack)
      };
    case "RecordLiteralExpression":
      return {
        ...expression,
        fields: expression.fields.map((field) => ({
          ...field,
          value: transformExpression(field.value, moduleRecord, scopeStack)
        }))
      };
    case "ListExpression":
      return {
        ...expression,
        items: expression.items.map((item) => transformExpression(item, moduleRecord, scopeStack))
      };
    case "CollectionAccessExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack),
        where: expression.where ? transformExpression(expression.where, moduleRecord, scopeStack) : null
      };
    case "CollectionTakeExpression":
      return {
        ...expression,
        count: transformExpression(expression.count, moduleRecord, scopeStack),
        collection: transformExpression(expression.collection, moduleRecord, scopeStack)
      };
    case "CollectionIndexExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack),
        index: transformExpression(expression.index, moduleRecord, scopeStack)
      };
    case "CollectionIndexOfExpression":
      return {
        ...expression,
        item: transformExpression(expression.item, moduleRecord, scopeStack),
        collection: transformExpression(expression.collection, moduleRecord, scopeStack)
      };
    case "CollectionSliceExpression":
      return {
        ...expression,
        start: transformExpression(expression.start, moduleRecord, scopeStack),
        end: transformExpression(expression.end, moduleRecord, scopeStack),
        collection: transformExpression(expression.collection, moduleRecord, scopeStack)
      };
    case "CollectionCountExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack),
        where: expression.where ? transformExpression(expression.where, moduleRecord, scopeStack) : null
      };
    case "CollectionIsEmptyExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack)
      };
    case "CollectionContainsExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack),
        item: transformExpression(expression.item, moduleRecord, scopeStack)
      };
    case "CollectionHasExpression":
      return {
        ...expression,
        collection: transformExpression(expression.collection, moduleRecord, scopeStack),
        items: expression.items.map((item) => transformExpression(item, moduleRecord, scopeStack))
      };
    case "ResultExpression":
      return {
        ...expression,
        expression: transformExpression(expression.expression, moduleRecord, scopeStack)
      };
    case "BinaryExpression":
    case "LogicalExpression":
    case "ComparisonExpression":
    case "StringOperationExpression":
      return {
        ...expression,
        left: transformExpression(expression.left, moduleRecord, scopeStack),
        right: transformExpression(expression.right, moduleRecord, scopeStack)
      };
    case "UnaryExpression":
      return {
        ...expression,
        argument: transformExpression(expression.argument, moduleRecord, scopeStack)
      };
    case "BuiltinCallExpression":
      return {
        ...expression,
        args: expression.args.map((arg) => transformExpression(arg, moduleRecord, scopeStack))
      };
    default:
      return expression;
  }
}

function rewriteInterpolatedNames(text, moduleRecord, scopeStack) {
  const source = String(text);
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(" && source[index + 1] === "(") {
      output += "((";
      index += 1;
      continue;
    }

    if (source[index] === ")" && source[index + 1] === ")") {
      output += "))";
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
    const normalizedName = normalizeStaticName(
      rawName
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .filter((part) => !["a", "an", "the"].includes(part.toLowerCase()))
    );

    if (!normalizedName || isShadowed(normalizedName, scopeStack) || moduleRecord.aliasNames.has(normalizedName)) {
      output += source.slice(index, closeIndex + 1);
      index = closeIndex;
      continue;
    }

    const rewrittenName = moduleRecord.globalNameMap.get(normalizedName);
    if (!rewrittenName) {
      output += source.slice(index, closeIndex + 1);
      index = closeIndex;
      continue;
    }

    output += `(${rewrittenName})`;
    index = closeIndex;
  }

  return output;
}

function compileBuiltInFilesModule(moduleRecord, compilerState, level, contextName) {
  const taskTypeRef = '{ kind: "named", name: "Task", displayName: "Task" }';
  const definitions = [
    {
      exportName: "read text from file",
      displayName: "read text from file",
      params: ["path"],
      body: `return __flowRuntime.createBackgroundTask(
        () => __flowRuntime.host.readTextFile(__flowArgs[0], __flowParentContext?.__flowFilePath ?? null),
        "read text from file task"
      );`
    },
    {
      exportName: "write text to file",
      displayName: "write text to file",
      params: ["path", "text"],
      body: `return __flowRuntime.createBackgroundTask(
        () => __flowRuntime.host.writeTextFile(__flowArgs[0], __flowArgs[1], __flowParentContext?.__flowFilePath ?? null),
        "write text to file task"
      );`
    },
    {
      exportName: "append text to file",
      displayName: "append text to file",
      params: ["path", "text"],
      body: `return __flowRuntime.createBackgroundTask(
        () => __flowRuntime.host.appendTextFile(__flowArgs[0], __flowArgs[1], __flowParentContext?.__flowFilePath ?? null),
        "append text to file task"
      );`
    },
    {
      exportName: "file exists",
      displayName: "file exists",
      params: ["path"],
      body: `return __flowRuntime.createBackgroundTask(
        () => __flowRuntime.host.fileExists(__flowArgs[0], __flowParentContext?.__flowFilePath ?? null),
        "file exists task"
      );`
    },
    {
      exportName: "delete file",
      displayName: "delete file",
      params: ["path"],
      body: `return __flowRuntime.createBackgroundTask(
        () => __flowRuntime.host.deleteFile(__flowArgs[0], __flowParentContext?.__flowFilePath ?? null),
        "delete file task"
      );`
    }
  ];

  return definitions.flatMap((definition) => {
    const declaration = moduleRecord.localDeclarations.get(definition.exportName);
    const internalName = normalizeStaticName(declaration.internalNameParts);
    compilerState.knownFunctions.set(internalName, {
      displayName: definition.displayName,
      normalizedName: internalName,
      params: definition.params,
      returnType: { kind: "named", name: "Task", displayName: "Task" }
    });

    const functionTempName = `__builtinFunctionDefinition${compilerState.tempIndex}`;
    compilerState.tempIndex += 1;

    return [
      line(level, "{"),
      line(level + 1, `const ${functionTempName} = {`),
      line(level + 2, `displayName: ${JSON.stringify(definition.displayName)},`),
      line(level + 2, `params: [${definition.params.map((param) => JSON.stringify(param)).join(", ")}],`),
      line(level + 2, `returnType: ${taskTypeRef},`),
      line(level + 2, "body: (__flowArgs, __flowParentContext) => {"),
      line(level + 3, "if (!__flowRuntime.host) {"),
      line(level + 4, 'throw new Error("File library requires a host runtime");'),
      line(level + 3, "}"),
      line(level + 3, definition.body.trim()),
      line(level + 2, "}"),
      line(level + 1, "};"),
      line(level + 1, `__flowRuntime.defineFunction(${JSON.stringify(internalName)}, ${functionTempName});`),
      line(level, "}")
    ];
  });
}

function transpileModuleGraph(moduleGraph) {
  const compilerState = {
    tempIndex: 0,
    knownTypes: new Map(),
    knownFunctions: new Map(),
    variableTypes: new Map()
  };
  compilerStateRef = compilerState;

  const lines = [
    "(() => {",
    indent(RUNTIME_SOURCE.trimEnd()),
    "  const __flowRuntime = createFlowScriptRuntime();"
  ];

  for (const moduleRecord of moduleGraph.orderedModules) {
    lines.push(line(1, `// Module: ${moduleRecord.filePath}`));
    lines.push(line(1, `const __flowModuleContext_${moduleRecord.id} = __flowRuntime.makeModuleContext(${JSON.stringify(moduleRecord.filePath)});`));

    if (moduleRecord.builtInKind === "files") {
      lines.push(...compileBuiltInFilesModule(moduleRecord, compilerState, 1, `__flowModuleContext_${moduleRecord.id}`));
    }

    for (const statement of moduleRecord.transformedProgram.body) {
      lines.push(...compileStatement(statement, compilerState, 1, `__flowModuleContext_${moduleRecord.id}`, null, null, null, null, null, false));
    }

    lines.push(
      line(
        1,
        `__flowRuntime.defineModule(${JSON.stringify(moduleRecord.id)}, ${JSON.stringify(moduleRecord.displayName)}, [${moduleRecord.sharedExports
          .map(
            (entry) =>
              `{ exportName: ${JSON.stringify(entry.exportName)}, kind: ${JSON.stringify(entry.kind)}, internalName: ${JSON.stringify(entry.internalName)} }`
          )
          .join(", ")}]);`
      )
    );
  }

  lines.push("  __flowRuntime.finish();", "  return { scope: __flowRuntime, output: __flowRuntime.output };", "})()");
  return lines.join("\n");
}

function normalizeStaticName(nameParts) {
  return nameParts.join(" ");
}

function accessContextSource(currentTypeName) {
  if (!currentTypeName) {
    return "null";
  }

  return `{ kind: "internal", declaringTypeName: ${JSON.stringify(currentTypeName)} }`;
}

function isKnownTypeKindOf(compilerState, typeName, ancestorTypeName) {
  let currentType = compilerState.knownTypes.get(typeName);

  while (currentType) {
    if (currentType.normalizedName === ancestorTypeName) {
      return true;
    }

    currentType = currentType.parentTypeName ? compilerState.knownTypes.get(currentType.parentTypeName) : null;
  }

  return false;
}

function canStaticallyAccessMember(compilerState, member, currentTypeName) {
  if (member.accessLevel === "public") {
    return true;
  }

  if (!currentTypeName) {
    return false;
  }

  if (member.accessLevel === "private") {
    return currentTypeName === member.declaredOnTypeName;
  }

  return isKnownTypeKindOf(compilerState, currentTypeName, member.declaredOnTypeName);
}

function getKnownType(compilerState, typeName) {
  return compilerState.knownTypes.get(typeName) ?? null;
}

function getKnownFunction(compilerState, functionName) {
  return compilerState.knownFunctions.get(functionName) ?? null;
}

function registerKnownFunction(compilerState, statement) {
  const normalizedFunctionName = normalizeStaticName(statement.nameParts);

  compilerState.knownFunctions.set(normalizedFunctionName, {
    displayName: normalizedFunctionName,
    normalizedName: normalizedFunctionName,
    params: statement.params.map((param) => normalizeStaticName(param)),
    returnType: statement.returnType ?? null
  });
}

function assertKnownReturningFunctionAccess(compilerState, functionNameParts) {
  const definition = getKnownFunction(compilerState, normalizeStaticName(functionNameParts));
  if (definition && !definition.returnType) {
    throw new Error(`Function "${definition.displayName}" does not declare a return value`);
  }
}

function assertKnownSelfPropertyAccess(compilerState, currentTypeName, propertyNameParts) {
  if (!currentTypeName) {
    throw new Error("Self property access requires a declaring type context");
  }

  const typeDefinition = getKnownType(compilerState, currentTypeName);
  if (!typeDefinition) {
    return;
  }

  const normalizedPropertyName = normalizeStaticName(propertyNameParts);
  const property = typeDefinition.propertyMap.get(normalizedPropertyName);

  if (!property) {
    throw new Error('Unknown property "' + normalizedPropertyName + '" on type "' + typeDefinition.displayName + '"');
  }

  if (!canStaticallyAccessMember(compilerState, property, currentTypeName)) {
    throw new Error('Cannot access ' + property.accessLevel + ' property "' + property.displayName + '" on type "' + typeDefinition.displayName + '"');
  }
}

function assertKnownSelfActionAccess(compilerState, currentTypeName, actionName) {
  if (!currentTypeName) {
    throw new Error("Self action calls require a declaring type context");
  }

  const typeDefinition = getKnownType(compilerState, currentTypeName);
  if (!typeDefinition) {
    return;
  }

  const bucket = typeDefinition.actions.get(actionName);
  if (!bucket || bucket.length === 0) {
    throw new Error('Unknown action "' + actionName + '" on type "' + typeDefinition.displayName + '"');
  }

  const privateExactMatch = [...bucket].reverse().find((candidate) => candidate.declaredOnTypeName === currentTypeName && candidate.accessLevel === "private") ?? null;
  const action = privateExactMatch ?? [...bucket].reverse().find((candidate) => canStaticallyAccessMember(compilerState, candidate, currentTypeName)) ?? null;

  if (!action) {
    throw new Error('Cannot call action "' + actionName + '" on type "' + typeDefinition.displayName + '"');
  }
}

function assertKnownReturningActionAccess(compilerState, currentTypeName, targetType, targetNameParts, actionName) {
  if (targetType === "SelfActionTarget") {
    assertKnownSelfActionAccess(compilerState, currentTypeName, actionName);
    const typeDefinition = getKnownType(compilerState, currentTypeName);
    if (!typeDefinition) {
      return;
    }

    const bucket = typeDefinition.actions.get(actionName) ?? [];
    const privateExactMatch = [...bucket].reverse().find((candidate) => candidate.declaredOnTypeName === currentTypeName && candidate.accessLevel === "private") ?? null;
    const action = privateExactMatch ?? [...bucket].reverse().find((candidate) => canStaticallyAccessMember(compilerState, candidate, currentTypeName)) ?? null;
    if (action && !action.returnType) {
      throw new Error(`Action "${actionName}" does not declare a return value`);
    }

    return;
  }

  if (targetType === "SuperActionTarget") {
    assertKnownSuperActionAccess(compilerState, currentTypeName, actionName);
    const currentType = getKnownType(compilerState, currentTypeName);
    let ancestorTypeName = currentType?.parentTypeName ?? null;

    while (ancestorTypeName) {
      const ancestorType = getKnownType(compilerState, ancestorTypeName);
      if (!ancestorType) {
        return;
      }

      const bucket = ancestorType.actions.get(actionName) ?? [];
      const candidate = [...bucket].reverse().find(
        (action) => action.declaredOnTypeName === ancestorType.normalizedName && canStaticallyAccessMember(compilerState, action, currentTypeName)
      );

      if (candidate) {
        if (!candidate.returnType) {
          throw new Error(`Action "${actionName}" does not declare a return value`);
        }

        return;
      }

      ancestorTypeName = ancestorType.parentTypeName;
    }

    return;
  }

  const instanceTypeName = compilerState.variableTypes.get(normalizeStaticName(targetNameParts));
  if (!instanceTypeName) {
    return;
  }

  const typeDefinition = getKnownType(compilerState, instanceTypeName);
  if (!typeDefinition) {
    return;
  }

  const bucket = typeDefinition.actions.get(actionName) ?? [];
  const action = [...bucket].reverse().find((candidate) => candidate.accessLevel === "public") ?? null;
  if (action && !action.returnType) {
    throw new Error(`Action "${actionName}" does not declare a return value`);
  }
}

function assertKnownSuperActionAccess(compilerState, currentTypeName, actionName) {
  if (!currentTypeName) {
    throw new Error("super action calls require a declaring type context");
  }

  const currentType = getKnownType(compilerState, currentTypeName);
  if (!currentType || !currentType.parentTypeName) {
    throw new Error(`No parent type exists for "${currentTypeName}"`);
  }

  let ancestorTypeName = currentType.parentTypeName;

  while (ancestorTypeName) {
    const ancestorType = getKnownType(compilerState, ancestorTypeName);
    if (!ancestorType) {
      return;
    }

    const bucket = ancestorType.actions.get(actionName) ?? [];
    const candidate = [...bucket].reverse().find(
      (action) => action.declaredOnTypeName === ancestorType.normalizedName && canStaticallyAccessMember(compilerState, action, currentTypeName)
    );

    if (candidate) {
      return;
    }

    ancestorTypeName = ancestorType.parentTypeName;
  }

  throw new Error(`No parent action "${actionName}" exists for type "${currentType.displayName}"`);
}

function registerKnownType(compilerState, statement) {
  const normalizedTypeName = normalizeStaticName(statement.nameParts);
  const parentType = statement.parentTypeNameParts ? getKnownType(compilerState, normalizeStaticName(statement.parentTypeNameParts)) : null;
  const properties = [];
  const propertyMap = new Map();

  if (parentType) {
    for (const property of parentType.properties) {
      properties.push(property);
      propertyMap.set(property.normalizedName, property);
    }
  }

  for (const property of statement.properties) {
    const normalizedPropertyName = normalizeStaticName(property.nameParts);
    if (propertyMap.has(normalizedPropertyName)) {
      throw new Error('Property "' + normalizedPropertyName + '" is already defined on type "' + normalizedTypeName + '"');
    }

    const resolvedProperty = {
      displayName: normalizedPropertyName,
      normalizedName: normalizedPropertyName,
      accessLevel: property.accessLevel ?? "public",
      declaredOnTypeName: normalizedTypeName,
      typeRef: property.valueType
    };
    properties.push(resolvedProperty);
    propertyMap.set(normalizedPropertyName, resolvedProperty);
  }

  const actions = new Map();
  if (parentType) {
    for (const [actionName, bucket] of parentType.actions.entries()) {
      actions.set(actionName, bucket.slice());
    }
  }

  const ownActionNames = new Set();
  for (const action of statement.actions) {
    if (ownActionNames.has(action.actionName)) {
      throw new Error('Action "' + action.actionName + '" is already defined on type "' + normalizedTypeName + '"');
    }

    ownActionNames.add(action.actionName);
    const existingBucket = actions.get(action.actionName) ?? [];
    const overrideTarget = [...existingBucket].reverse().find((candidate) => candidate.accessLevel !== "private");
    const resolvedAction = {
      name: action.actionName,
      accessLevel: action.accessLevel ?? "public",
      declaredOnTypeName: normalizedTypeName,
      returnType: action.returnType ?? null,
      params: action.params
    };

    if (overrideTarget && ACCESS_LEVEL_RANKS[resolvedAction.accessLevel] < ACCESS_LEVEL_RANKS[overrideTarget.accessLevel]) {
      throw new Error(
        'Action "' + action.actionName + '" on type "' + normalizedTypeName + '" cannot narrow visibility from ' + overrideTarget.accessLevel + " to " + resolvedAction.accessLevel
      );
    }

    if (overrideTarget && !areTypeReferencesEquivalent(action.returnType ?? null, overrideTarget.returnType ?? null)) {
      throw new Error('Action "' + action.actionName + '" on type "' + normalizedTypeName + '" must keep the same return type as the parent action');
    }

    existingBucket.push(resolvedAction);
    actions.set(action.actionName, existingBucket);
  }

  validateKnownTypeActionHooks(statement.beforeHooks, "before", actions, normalizedTypeName);
  validateKnownTypeActionHooks(statement.afterHooks, "after", actions, normalizedTypeName);

  compilerState.knownTypes.set(normalizedTypeName, {
    displayName: normalizedTypeName,
    normalizedName: normalizedTypeName,
    parentTypeName: parentType ? parentType.normalizedName : null,
    properties,
    propertyMap,
    actions,
    beforeHooks: statement.beforeHooks,
    afterHooks: statement.afterHooks,
    createdHook: statement.createdHook,
    updatedHook: statement.updatedHook,
    constructorArity: Math.max(parentType?.constructorArity ?? 0, statement.createdHook?.params.length ?? 0)
  });
}

function validateKnownTypeActionHooks(hooks, hookKind, actions, normalizedTypeName) {
  for (const hook of hooks) {
    const bucket = actions.get(hook.actionName) ?? [];
    const targetAction = [...bucket].reverse().find((candidate) => candidate.declaredOnTypeName === normalizedTypeName || candidate.accessLevel !== "private") ?? null;

    if (!targetAction) {
      throw new Error(
        `Type "${normalizedTypeName}" cannot define a ${hookKind} hook for unknown or inaccessible action "${hook.actionName}"`
      );
    }

    if (hook.params.length !== (targetAction.params?.length ?? 0)) {
      throw new Error(
        `Type "${normalizedTypeName}" must use ${targetAction.params?.length ?? 0} hook parameter(s) for action "${hook.actionName}"`
      );
    }
  }
}

function compileStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  switch (statement.type) {
    case "ShareStatement":
    case "UseNamedStatement":
      return [];
    case "UseModuleAliasStatement":
      if (!statement.resolvedModuleId) {
        throw new Error("Module alias imports require a resolved module id");
      }
      return [
        line(level, `__flowRuntime.set(${compileName(statement.aliasNameParts)}, __flowRuntime.getModuleNamespace(${JSON.stringify(statement.resolvedModuleId)}));`)
      ];
    case "DelayedStatement":
      return compileDelayedStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "BackgroundStatement":
      return compileBackgroundStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "WaitStatement":
      return [line(level, `${compileWaitTarget(statement.target, statement.timeout, contextName, selfName, currentTypeName)};`)];
    case "TryStatement":
      return compileTryStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "CancelStatement":
      return [line(level, `__flowRuntime.cancelTask(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.target, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`)];
    case "SetStatement":
      return compileSetStatement(statement, compilerState, level, contextName, selfName, currentTypeName, localVariableScope);
    case "ReactiveSetStatement":
      return [
        line(level, `__flowRuntime.defineReactive(${compileName(statement.nameParts)}, (__flowContext) => ${compileExpression(statement.expression, "__flowContext", null, selfName, currentTypeName)}, ${contextName});`)
      ];
    case "PrintStatement":
      return [
        line(level, `__flowRuntime.print(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.value, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`)
      ];
    case "FunctionDeclarationStatement":
      return compileFunctionDeclarationStatement(statement, compilerState, level, contextName);
    case "FunctionCallStatement":
      return compileFunctionCallStatement(statement, compilerState, level, contextName, selfName, currentTypeName);
    case "EnsureStatement":
      return compileContractStatement("ensure", statement, compilerState, level, contextName, selfName, currentTypeName, currentFunctionName);
    case "VerifyStatement":
      return compileContractStatement("verify", statement, compilerState, level, contextName, selfName, currentTypeName, currentFunctionName);
    case "ReturnStatement":
      return compileReturnStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName);
    case "TypeDeclarationStatement":
      return compileTypeDeclarationStatement(statement, compilerState, level, contextName);
    case "InstanceCreationStatement":
      return compileInstanceCreationStatement(statement, compilerState, level, contextName, selfName, currentTypeName, localVariableScope);
    case "ActionCallStatement":
      return compileActionCallStatement(statement, compilerState, level, contextName, selfName, currentTypeName);
    case "CollectionDeclarationStatement":
      return compileCollectionDeclarationStatement(statement, compilerState, level, contextName, selfName, currentTypeName, localVariableScope);
    case "CollectionPipelineStatement":
      return compileCollectionPipelineStatement(statement, compilerState, level, contextName, selfName, currentTypeName, localVariableScope);
    case "WhenStatement":
      return compileWhenStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "CheckStatement":
      return compileCheckStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "ForEachStatement":
      return compileForEachStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "RepeatStatement":
      return compileRepeatStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    case "BreakStatement":
      return [line(level, "break;")];
    case "ContinueStatement":
      return [line(level, "continue;")];
    case "WhileStatement":
      return compileWhileStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope);
    default:
      throw new Error(`Unsupported statement type: ${statement.type}`);
  }
}

function compileExpression(expression, contextName, recordName = null, selfName = null, currentTypeName = null) {
  switch (expression.type) {
    case "LiteralExpression":
      if (expression.valueType === "no_value") {
        return "__flowRuntime.noValue";
      }

      if (expression.valueType === "string") {
        return `__flowRuntime.interpolate(${JSON.stringify(expression.value)}, ${contextName})`;
      }

      return JSON.stringify(expression.value);
    case "ReferenceExpression":
      return `${contextName}.get(${compileName(expression.nameParts)})`;
    case "ActionCallExpression":
      return compileActionCallExpression(expression, contextName, selfName, currentTypeName);
    case "FunctionCallExpression":
      return compileFunctionCallExpression(expression, contextName, selfName, currentTypeName);
    case "AnonymousCallableExpression":
      return compileAnonymousCallableExpression(expression, compilerStateRef, contextName, selfName, currentTypeName);
    case "BackgroundTaskExpression":
      return compileBackgroundTaskExpression(expression, compilerStateRef, contextName, selfName, currentTypeName);
    case "DelayedTaskExpression":
      return compileDelayedTaskExpression(expression, compilerStateRef, contextName, selfName, currentTypeName);
    case "WaitExpression":
      return compileWaitTarget(expression.target, expression.timeout, contextName, selfName, currentTypeName);
    case "PropertyAccessExpression":
      return `__flowRuntime.getProperty(${contextName}.get(${compileName(expression.instanceNameParts)}), ${compileName(expression.propertyNameParts)}, null)`;
    case "SelfPropertyExpression":
      if (!selfName) {
        throw new Error("Self property expressions require an action self context");
      }

      assertKnownSelfPropertyAccess(compilerStateRef, currentTypeName, expression.propertyNameParts);
      return `__flowRuntime.getProperty(${selfName}, ${compileName(expression.propertyNameParts)}, ${accessContextSource(currentTypeName)})`;
    case "FieldReferenceExpression":
      if (!recordName) {
        throw new Error(`Field references require a record context: ${expression.fieldName}`);
      }

      return `${recordName}[${JSON.stringify(expression.fieldName)}]`;
    case "RecordLiteralExpression":
      return `{ ${expression.fields.map((field) => `${JSON.stringify(field.name)}: ${compileExpression(field.value, contextName, recordName, selfName, currentTypeName)}`).join(", ")} }`;
    case "ListExpression":
      return `[${expression.items.map((item) => compileExpression(item, contextName, recordName, selfName, currentTypeName)).join(", ")}]`;
    case "CollectionAccessExpression":
      return compileCollectionAccessExpression(expression, contextName, recordName, selfName, currentTypeName);
    case "CollectionTakeExpression":
      return expression.side === "first"
        ? `__flowRuntime.firstItemsOf(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.count, contextName, recordName, selfName, currentTypeName)})`
        : `__flowRuntime.lastItemsOf(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.count, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionIndexExpression":
      return `__flowRuntime.itemAtIndex(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.index, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionIndexOfExpression":
      return `__flowRuntime.indexOfItem(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.item, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionSliceExpression":
      return `__flowRuntime.itemsFromIndexToIndex(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.start, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.end, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionCountExpression":
      return compileCollectionCountExpression(expression, contextName, recordName, selfName, currentTypeName);
    case "CollectionIsEmptyExpression":
      return `__flowRuntime.isCollectionEmpty(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionContainsExpression":
      return `__flowRuntime.collectionContainsItem(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, ${compileExpression(expression.item, contextName, recordName, selfName, currentTypeName)})`;
    case "CollectionHasExpression":
      return expression.mode === "any"
        ? `__flowRuntime.collectionHasAnyOf(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, [${expression.items.map((item) => compileExpression(item, contextName, recordName, selfName, currentTypeName)).join(", ")}])`
        : `__flowRuntime.collectionHasAllOf(${compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName)}, [${expression.items.map((item) => compileExpression(item, contextName, recordName, selfName, currentTypeName)).join(", ")}])`;
    case "ResultExpression":
      return `(${compileExpression(expression.expression, contextName, recordName, selfName, currentTypeName)})`;
    case "BinaryExpression":
      return `(${compileExpression(expression.left, contextName, recordName, selfName, currentTypeName)} ${OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName, selfName, currentTypeName)})`;
    case "UnaryExpression":
      return `(!${compileExpression(expression.argument, contextName, recordName, selfName, currentTypeName)})`;
    case "LogicalExpression":
      return `(${compileExpression(expression.left, contextName, recordName, selfName, currentTypeName)} ${LOGICAL_OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName, selfName, currentTypeName)})`;
    case "BuiltinCallExpression":
      return compileBuiltinCallExpression(expression, contextName, recordName, selfName, currentTypeName);
    case "ComparisonExpression":
      return `(${compileExpression(expression.left, contextName, recordName, selfName, currentTypeName)} ${COMPARISON_OPERATOR_MAP[expression.operator]} ${compileExpression(expression.right, contextName, recordName, selfName, currentTypeName)})`;
    case "StringOperationExpression":
      return compileStringOperationExpression(expression, contextName, recordName, selfName, currentTypeName);
    default:
      throw new Error(`Unsupported expression type: ${expression.type}`);
  }
}

function compileSetStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, localVariableScope = false) {
  const compiledValue = `__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.value, "__flowContext", null, selfName, currentTypeName)}, ${contextName})`;

  if (statement.target.type === "VariableAssignmentTarget") {
    if (!localVariableScope) {
      compilerState.variableTypes.delete(normalizeStaticName(statement.target.nameParts));
    }
    return [
      line(level, `${localVariableScope ? `${contextName}.setLocal` : "__flowRuntime.set"}(${compileName(statement.target.nameParts)}, ${compiledValue});`)
    ];
  }

  if (statement.target.type === "PropertyAssignmentTarget") {
    return [
      line(level, `__flowRuntime.setProperty(${contextName}.get(${compileName(statement.target.instanceNameParts)}), ${compileName(statement.target.propertyNameParts)}, ${compiledValue}, null);`)
    ];
  }

  if (statement.target.type === "SelfPropertyAssignmentTarget") {
    assertKnownSelfPropertyAccess(compilerState, currentTypeName, statement.target.propertyNameParts);
    return [
      line(level, `__flowRuntime.setProperty(${selfName}, ${compileName(statement.target.propertyNameParts)}, ${compiledValue}, ${accessContextSource(currentTypeName)});`)
    ];
  }

  throw new Error(`Unsupported assignment target type: ${statement.target.type}`);
}

function compileReturnStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null
) {
  if (!currentReturnType) {
    throw new Error("Return statements require a declared return type");
  }

  return [
    line(
      level,
      `return __flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.value, "__flowContext", null, selfName, currentTypeName)}, ${contextName});`
    )
  ];
}

function compileContractStatement(kind, statement, compilerState, level, contextName, selfName = null, currentTypeName = null, currentFunctionName = null) {
  const displayName = currentFunctionName ? JSON.stringify(currentFunctionName) : JSON.stringify("anonymous function");
  return [
    line(
      level,
      `__flowRuntime.assertContract(${JSON.stringify(kind)}, ${displayName}, ${JSON.stringify(describeExpression(statement.condition))}, __flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.condition, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
    )
  ];
}

function compileWhenStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const lines = [];

  for (let index = 0; index < statement.branches.length; index += 1) {
    const branch = statement.branches[index];
    const keyword = index === 0 ? "if" : "else if";
    lines.push(
      line(
        level,
        `${keyword} (__flowRuntime.evaluate((__flowContext) => ${compileExpression(branch.condition, "__flowContext", null, selfName, currentTypeName)}, ${contextName})) {`
      )
    );
    lines.push(...compileStatements(statement.branches[index].body, compilerState, level + 1, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
    lines.push(line(level, "}"));
  }

  if (statement.otherwiseBody) {
    lines.push(line(level, "else {"));
    lines.push(...compileStatements(statement.otherwiseBody, compilerState, level + 1, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
    lines.push(line(level, "}"));
  }

  return lines;
}

function compileCollectionDeclarationStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, localVariableScope = false) {
  const collectionFactory = statement.collectionKind === "set" ? "__flowRuntime.createSet" : "__flowRuntime.createList";

  if (statement.items !== null) {
    const compiledItems = statement.items.map((item) => compileExpression(item, "__flowContext", null, selfName, currentTypeName)).join(", ");
    return [
      line(
        level,
        `${localVariableScope ? `${contextName}.setLocal` : "__flowRuntime.set"}(${compileName(statement.nameParts)}, __flowRuntime.evaluate((__flowContext) => ${collectionFactory}([${compiledItems}]), ${contextName}));`
      )
    ];
  }

  const tempName = `__collection${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `let ${tempName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.source, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
    )
  );

  if (statement.where) {
    lines.push(
      line(
        level + 1,
        `${tempName} = __flowRuntime.filterCollection(${tempName}, (__flowRecord) => ${compileExpression(statement.where, contextName, "__flowRecord", selfName, currentTypeName)});`
      )
    );
  }

  if (statement.select) {
    lines.push(
      line(
        level + 1,
        `${tempName} = __flowRuntime.selectCollection(${tempName}, (__flowRecord) => ${compileExpression(statement.select, contextName, "__flowRecord", selfName, currentTypeName)});`
      )
    );
  }

  lines.push(line(level + 1, `${localVariableScope ? `${contextName}.setLocal` : "__flowRuntime.set"}(${compileName(statement.nameParts)}, ${collectionFactory}(${tempName}));`));
  lines.push(line(level, "}"));
  return lines;
}

function compileCollectionPipelineStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, localVariableScope = false) {
  const tempName = `__pipeline${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const lines = [line(level, "{")];

  lines.push(
    line(
      level + 1,
      `let ${tempName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.source, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
    )
  );

  for (const step of statement.steps) {
    switch (step.type) {
      case "FilterStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.filterCollection(${tempName}, (__flowRecord) => ${compileExpression(step.condition, contextName, "__flowRecord", selfName, currentTypeName)});`
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
            `${tempName} = __flowRuntime.takeFirstItems(${tempName}, __flowRuntime.evaluate((__flowContext) => ${compileExpression(step.count, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
          )
        );
        break;
      case "SelectStep":
        lines.push(
          line(
            level + 1,
            `${tempName} = __flowRuntime.selectCollection(${tempName}, (__flowRecord) => ${compileExpression(step.projection, contextName, "__flowRecord", selfName, currentTypeName)});`
          )
        );
        break;
      case "SaveStep": {
        const collectionFactory = step.collectionKind === "set" ? "__flowRuntime.createSet" : "__flowRuntime.createList";
        lines.push(line(level + 1, `${localVariableScope ? `${contextName}.setLocal` : "__flowRuntime.set"}(${compileName(step.targetNameParts)}, ${collectionFactory}(${tempName}));`));
        break;
      }
      default:
        throw new Error(`Unsupported pipeline step type: ${step.type}`);
    }
  }

  lines.push(line(level, "}"));
  return lines;
}

function compileCheckStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, currentReturnType = null, currentActionName = null, currentFunctionName = null, localVariableScope = false) {
  const tempName = `__checkValue${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${tempName} = __flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.target, "__flowContext", null, selfName, currentTypeName)}, ${contextName});`
    )
  );

  for (let index = 0; index < statement.cases.length; index += 1) {
    const currentCase = statement.cases[index];
    const keyword = index === 0 ? "if" : "else if";
    lines.push(
      line(
        level + 1,
        `${keyword} (${tempName} === __flowRuntime.evaluate((__flowContext) => ${compileExpression(currentCase.match, "__flowContext", null, selfName, currentTypeName)}, ${contextName})) {`
      )
    );
    lines.push(...compileStatements(currentCase.body, compilerState, level + 2, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
    lines.push(line(level + 1, "}"));
  }

  if (statement.defaultBody) {
    lines.push(line(level + 1, "else {"));
    lines.push(...compileStatements(statement.defaultBody, compilerState, level + 2, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
    lines.push(line(level + 1, "}"));
  }

  lines.push(line(level, "}"));
  return lines;
}

function compileForEachStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, currentReturnType = null, currentActionName = null, currentFunctionName = null, localVariableScope = false) {
  const collectionName = `__loopCollection${compilerState.tempIndex}`;
  const itemValueName = `__loopItem${compilerState.tempIndex}`;
  const loopContextName = `__loopContext${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${collectionName} = __flowRuntime.asCollection(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.collection, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
    )
  );
  lines.push(line(level + 1, `for (const ${itemValueName} of ${collectionName}) {`));
  lines.push(line(level + 2, `const ${loopContextName} = __flowRuntime.makeChildContext(${contextName}, { [${compileName(statement.itemNameParts)}]: ${itemValueName} });`));
  lines.push(...compileStatements(statement.body, compilerState, level + 2, loopContextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
  lines.push(line(level + 1, "}"));
  lines.push(line(level, "}"));
  return lines;
}

function compileRepeatStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, currentReturnType = null, currentActionName = null, currentFunctionName = null, localVariableScope = false) {
  const countName = `__repeatCount${compilerState.tempIndex}`;
  const indexName = `__repeatIndex${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const lines = [line(level, "{")];
  lines.push(
    line(
      level + 1,
      `const ${countName} = __flowRuntime.repeatCount(__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.count, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
    )
  );
  lines.push(line(level + 1, `for (let ${indexName} = 0; ${indexName} < ${countName}; ${indexName} += 1) {`));
  lines.push(...compileStatements(statement.body, compilerState, level + 2, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
  lines.push(line(level + 1, "}"));
  lines.push(line(level, "}"));
  return lines;
}

function compileWhileStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, currentReturnType = null, currentActionName = null, currentFunctionName = null, localVariableScope = false) {
  const lines = [
    line(
      level,
      `while (__flowRuntime.evaluate((__flowContext) => ${compileExpression(statement.condition, "__flowContext", null, selfName, currentTypeName)}, ${contextName})) {`
    )
  ];
  lines.push(...compileStatements(statement.body, compilerState, level + 1, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
  lines.push(line(level, "}"));
  return lines;
}

function compileStatements(
  statements,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const lines = [];

  for (const statement of statements) {
    lines.push(...compileStatement(statement, compilerState, level, contextName, selfName, currentTypeName, currentReturnType, currentActionName, currentFunctionName, localVariableScope));
  }

  return lines;
}

function compileFunctionDeclarationStatement(statement, compilerState, level, contextName) {
  registerKnownFunction(compilerState, statement);
  const functionTempName = `__functionDefinition${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  return [
    line(level, "{"),
    line(level + 1, `const ${functionTempName} = {`),
    line(level + 2, `params: [${statement.params.map((param) => compileName(param)).join(", ")}],`),
    line(level + 2, `returnType: ${statement.returnType ? compileTypeReference(statement.returnType) : "null"},`),
    line(level + 2, `closureContext: ${contextName},`),
    line(level + 2, `body: (__flowArgs, __flowParentContext) => {`),
    line(level + 3, "const __functionLocals = Object.create(null);"),
    ...statement.params.map((param, index) =>
      line(level + 3, `__functionLocals[__flowRuntime.normalizeName(${compileName(param)})] = __flowArgs[${index}];`)
    ),
    line(level + 3, "const __functionContext = __flowRuntime.makeChildContext(__flowParentContext, __functionLocals, __functionLocals);"),
    ...compileStatements(
      statement.body,
      compilerState,
      level + 3,
      "__functionContext",
      null,
      null,
      statement.returnType,
      null,
      normalizeStaticName(statement.nameParts),
      true
    ),
    line(level + 2, "}"),
    line(level + 1, "};"),
    line(level + 1, `__flowRuntime.defineFunction(${compileName(statement.nameParts)}, ${functionTempName});`),
    line(level, "}")
  ];
}

function compileBackgroundStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const taskSource = compileTaskBody(
    statement.body,
    compilerState,
    contextName,
    selfName,
    currentTypeName,
    currentReturnType,
    currentActionName,
    currentFunctionName,
    localVariableScope
  );

  return [line(level, `__flowRuntime.startBackgroundTask(${taskSource});`)];
}

function compileDelayedStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const taskSource = compileTaskBody(
    statement.body,
    compilerState,
    contextName,
    selfName,
    currentTypeName,
    currentReturnType,
    currentActionName,
    currentFunctionName,
    localVariableScope
  );
  const delaySource = compileDelayClause(statement.delay, contextName, selfName, currentTypeName);

  return [line(level, `__flowRuntime.startDelayedTask(${taskSource}, ${delaySource});`)];
}

function compileBackgroundTaskExpression(expression, compilerState, contextName, selfName = null, currentTypeName = null) {
  const taskSource = compileTaskBody(expression.body, compilerState, contextName, selfName, currentTypeName, null, null, null, false);
  return `__flowRuntime.createBackgroundTask(${taskSource})`;
}

function compileDelayedTaskExpression(expression, compilerState, contextName, selfName = null, currentTypeName = null) {
  const taskSource = compileTaskBody(expression.body, compilerState, contextName, selfName, currentTypeName, null, null, null, false);
  const delaySource = compileDelayClause(expression.delay, contextName, selfName, currentTypeName);
  return `__flowRuntime.createDelayedTask(${taskSource}, ${delaySource})`;
}

function compileTaskBody(
  body,
  compilerState,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const compiledBody = compileStatements(
    body,
    compilerState,
    3,
    contextName,
    selfName,
    currentTypeName,
    currentReturnType,
    currentActionName,
    currentFunctionName,
    localVariableScope
  ).join("\n");

  return `() => {\n${compiledBody}\n    }`;
}

function compileAnonymousCallableExpression(expression, compilerState, contextName, selfName = null, currentTypeName = null) {
  const callableTempName = `__anonymousCallable${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const paramAssignments = expression.params
    .map((param, index) => `__anonymousLocals[__flowRuntime.normalizeName(${compileName(param)})] = __flowArgs[${index}];`)
    .join("\n      ");
  const compiledBody = compileStatements(
    expression.body,
    compilerState,
    3,
    "__anonymousContext",
    selfName,
    currentTypeName,
    expression.returnType,
    null,
    null,
    true
  ).join("\n");

  return `(() => {
  const ${callableTempName} = {
    params: [${expression.params.map((param) => compileName(param)).join(", ")}],
    returnType: ${expression.returnType ? compileTypeReference(expression.returnType) : "null"},
    displayName: "anonymous function",
    body: (__flowArgs, __flowClosureContext) => {
      const __anonymousLocals = Object.create(null);
      ${paramAssignments}
      const __anonymousContext = __flowRuntime.makeChildContext(__flowClosureContext, __anonymousLocals, __anonymousLocals);
${compiledBody}
    }
  };
  return __flowRuntime.createAnonymousCallable(${callableTempName}, ${contextName});
})()`;
}

function compileTryStatement(
  statement,
  compilerState,
  level,
  contextName,
  selfName = null,
  currentTypeName = null,
  currentReturnType = null,
  currentActionName = null,
  currentFunctionName = null,
  localVariableScope = false
) {
  const lines = [
    line(level, "try {"),
    ...compileStatements(
      statement.tryBody,
      compilerState,
      level + 1,
      contextName,
      selfName,
      currentTypeName,
      currentReturnType,
      currentActionName,
      currentFunctionName,
      localVariableScope
    ),
    line(level, "} catch (__flowError) {")
  ];

  let failureContextName = contextName;
  if (statement.errorNameParts) {
    const localsName = `__flowErrorLocals${compilerState.tempIndex}`;
    compilerState.tempIndex += 1;
    const failureContextTempName = `__flowErrorContext${compilerState.tempIndex}`;
    compilerState.tempIndex += 1;

    lines.push(
      line(level + 1, `const ${localsName} = { [__flowRuntime.normalizeName(${compileName(statement.errorNameParts)})]: __flowRuntime.toErrorValue(__flowError) };`),
      line(level + 1, `const ${failureContextTempName} = __flowRuntime.makeChildContext(${contextName}, ${localsName});`)
    );
    failureContextName = failureContextTempName;
  }

  lines.push(
    ...compileStatements(
      statement.failureBody,
      compilerState,
      level + 1,
      failureContextName,
      selfName,
      currentTypeName,
      currentReturnType,
      currentActionName,
      currentFunctionName,
      localVariableScope
    ),
    line(level, "}")
  );

  if (statement.finallyBody) {
    lines.push(
      line(level, "finally {"),
      ...compileStatements(
        statement.finallyBody,
        compilerState,
        level + 1,
        contextName,
        selfName,
        currentTypeName,
        currentReturnType,
        currentActionName,
        currentFunctionName,
        localVariableScope
      ),
      line(level, "}")
    );
  }

  return lines;
}

function compileTypeDeclarationStatement(statement, compilerState, level, contextName) {
  registerKnownType(compilerState, statement);
  const typeTempName = `__typeDefinition${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;

  const propertyEntries = statement.properties.map((property) => `{
    displayName: ${compileName(property.nameParts)},
    normalizedName: __flowRuntime.normalizeName(${compileName(property.nameParts)}),
    accessLevel: ${JSON.stringify(property.accessLevel ?? "public")},
    typeRef: ${compileTypeReference(property.valueType)},
    hasDefault: ${property.defaultValue !== null ? "true" : "false"},
    defaultEvaluator: ${property.defaultValue !== null ? `(__flowContext) => ${compileExpression(property.defaultValue, "__flowContext")}` : "null"}
  }`);

  const actionEntries = statement.actions.map((action) => `{
    name: ${JSON.stringify(action.actionName)},
    accessLevel: ${JSON.stringify(action.accessLevel ?? "public")},
    returnType: ${action.returnType ? compileTypeReference(action.returnType) : "null"},
    params: [${action.params.map((param) => compileName(param)).join(", ")}],
    body: (__flowSelf, __flowArgs) => {
      const __actionLocals = Object.create(null);
      ${action.params.map((param, index) => `__actionLocals[__flowRuntime.normalizeName(${compileName(param)})] = __flowArgs[${index}];`).join("\n      ")}
      const __actionContext = __flowRuntime.makeChildContext(${contextName}, __actionLocals);
${compileStatements(action.body, compilerState, 3, "__actionContext", "__flowSelf", normalizeStaticName(statement.nameParts), action.returnType, action.actionName).join("\n")}
    }
  }`);

  const compileActionHookEntry = (hook) => `{
    actionName: ${JSON.stringify(hook.actionName)},
    params: [${hook.params.map((param) => compileName(param)).join(", ")}],
    body: (__flowSelf, __flowArgs) => {
      const __hookLocals = Object.create(null);
      ${hook.params.map((param, index) => `__hookLocals[__flowRuntime.normalizeName(${compileName(param)})] = __flowArgs[${index}];`).join("\n      ")}
      const __hookContext = __flowRuntime.makeChildContext(${contextName}, __hookLocals);
${compileStatements(hook.body, compilerState, 3, "__hookContext", "__flowSelf", normalizeStaticName(statement.nameParts)).join("\n")}
    }
  }`;

  const beforeHookEntries = statement.beforeHooks.map((hook) => compileActionHookEntry(hook));
  const afterHookEntries = statement.afterHooks.map((hook) => compileActionHookEntry(hook));

  const createdHookEntry = statement.createdHook
    ? `{
    params: [${statement.createdHook.params.map((param) => compileName(param)).join(", ")}],
    body: (__flowSelf, __flowArgs) => {
      const __createdLocals = Object.create(null);
      ${statement.createdHook.params.map((param, index) => `__createdLocals[__flowRuntime.normalizeName(${compileName(param)})] = __flowArgs[${index}];`).join("\n      ")}
      const __createdContext = __flowRuntime.makeChildContext(${contextName}, __createdLocals);
${compileStatements(statement.createdHook.body, compilerState, 3, "__createdContext", "__flowSelf", normalizeStaticName(statement.nameParts)).join("\n")}
    }
  }`
    : "null";

  const updatedHookEntry = statement.updatedHook
    ? `{
    body: (__flowSelf) => {
      const __updatedContext = __flowRuntime.makeChildContext(${contextName}, Object.create(null));
${compileStatements(statement.updatedHook.body, compilerState, 3, "__updatedContext", "__flowSelf", normalizeStaticName(statement.nameParts)).join("\n")}
    }
  }`
    : "null";

  return [
    line(level, "{"),
    line(level + 1, `const ${typeTempName} = {`),
    line(level + 2, `displayName: ${compileName(statement.nameParts)},`),
    line(level + 2, `parentTypeName: ${statement.parentTypeNameParts ? compileName(statement.parentTypeNameParts) : "null"},`),
    line(level + 2, `properties: [${propertyEntries.join(", ")}],`),
    line(level + 2, `actions: [${actionEntries.join(", ")}],`),
    line(level + 2, `beforeHooks: [${beforeHookEntries.join(", ")}],`),
    line(level + 2, `afterHooks: [${afterHookEntries.join(", ")}],`),
    line(level + 2, `createdHook: ${createdHookEntry},`),
    line(level + 2, `updatedHook: ${updatedHookEntry}`),
    line(level + 1, "};"),
    line(level + 1, `__flowRuntime.defineType(${compileName(statement.nameParts)}, ${typeTempName});`),
    line(level, "}")
  ];
}

function compileInstanceCreationStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null, localVariableScope = false) {
  const initTempName = `__instanceInit${compilerState.tempIndex}`;
  const argsTempName = `__instanceArgs${compilerState.tempIndex}`;
  compilerState.tempIndex += 1;
  const lines = [line(level, "{")];
  lines.push(line(level + 1, `const ${initTempName} = new Map();`));
  lines.push(
    line(
      level + 1,
      `const ${argsTempName} = [${statement.constructorArgs.map((arg) => `__flowRuntime.evaluate((__flowContext) => ${compileExpression(arg, "__flowContext", null, selfName, currentTypeName)}, ${contextName})`).join(", ")}];`
    )
  );

  for (const initializer of statement.initializers) {
    lines.push(
      line(
        level + 1,
        `${initTempName}.set(__flowRuntime.normalizeName(${compileName(initializer.nameParts)}), __flowRuntime.evaluate((__flowContext) => ${compileExpression(initializer.value, "__flowContext", null, selfName, currentTypeName)}, ${contextName}));`
      )
    );
  }

  if (!localVariableScope) {
    compilerState.variableTypes.set(normalizeStaticName(statement.nameParts), normalizeStaticName(statement.typeNameParts));
  }
  lines.push(
    line(
      level + 1,
      `${localVariableScope ? `${contextName}.setLocal` : "__flowRuntime.set"}(${compileName(statement.nameParts)}, __flowRuntime.createInstance(${compileName(statement.typeNameParts)}, ${argsTempName}, ${initTempName}));`
    )
  );
  lines.push(line(level, "}"));
  return lines;
}

function compileActionCallStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null) {
  const compiledArgs = `[${statement.args.map((arg) => `__flowRuntime.evaluate((__flowContext) => ${compileExpression(arg, "__flowContext", null, selfName, currentTypeName)}, ${contextName})`).join(", ")}]`;

  if (statement.targetType === "SelfActionTarget") {
    assertKnownSelfActionAccess(compilerState, currentTypeName, statement.actionName);
    return [
      line(level, `__flowRuntime.callAction(${selfName}, ${JSON.stringify(statement.actionName)}, ${compiledArgs}, ${accessContextSource(currentTypeName)}, false);`)
    ];
  }

  if (statement.targetType === "SuperActionTarget") {
    assertKnownSuperActionAccess(compilerState, currentTypeName, statement.actionName);
    return [
      line(
        level,
        `__flowRuntime.callSuperAction(${selfName}, ${JSON.stringify(currentTypeName)}, ${JSON.stringify(statement.actionName)}, ${compiledArgs}, ${accessContextSource(currentTypeName)}, false);`
      )
    ];
  }

  return [
    line(
      level,
      `__flowRuntime.callAction(${contextName}.get(${compileName(statement.targetNameParts)}), ${JSON.stringify(statement.actionName)}, ${compiledArgs}, null, false);`
    )
  ];
}

function compileFunctionCallStatement(statement, compilerState, level, contextName, selfName = null, currentTypeName = null) {
  const compiledArgs = `[${statement.args.map((arg) => `__flowRuntime.evaluate((__flowContext) => ${compileExpression(arg, "__flowContext", null, selfName, currentTypeName)}, ${contextName})`).join(", ")}]`;
  return [line(level, `__flowRuntime.callFunction(${compileCallableTarget(statement.callee, contextName, selfName, currentTypeName)}, ${compiledArgs}, ${contextName}, false);`)];
}

function compileActionCallExpression(expression, contextName, selfName = null, currentTypeName = null) {
  const compiledArgs = `[${expression.args.map((arg) => compileExpression(arg, contextName, null, selfName, currentTypeName)).join(", ")}]`;

  if (expression.targetType === "SelfActionTarget") {
    assertKnownReturningActionAccess(compilerStateRef, currentTypeName, expression.targetType, null, expression.actionName);
    return `__flowRuntime.callAction(${selfName}, ${JSON.stringify(expression.actionName)}, ${compiledArgs}, ${accessContextSource(currentTypeName)}, true)`;
  }

  if (expression.targetType === "SuperActionTarget") {
    assertKnownReturningActionAccess(compilerStateRef, currentTypeName, expression.targetType, null, expression.actionName);
    return `__flowRuntime.callSuperAction(${selfName}, ${JSON.stringify(currentTypeName)}, ${JSON.stringify(expression.actionName)}, ${compiledArgs}, ${accessContextSource(currentTypeName)}, true)`;
  }

  assertKnownReturningActionAccess(compilerStateRef, currentTypeName, expression.targetType, expression.targetNameParts, expression.actionName);
  return `__flowRuntime.callAction(${contextName}.get(${compileName(expression.targetNameParts)}), ${JSON.stringify(expression.actionName)}, ${compiledArgs}, null, true)`;
}

function compileFunctionCallExpression(expression, contextName, selfName = null, currentTypeName = null) {
  const compiledArgs = `[${expression.args.map((arg) => compileExpression(arg, contextName, null, selfName, currentTypeName)).join(", ")}]`;
  return `__flowRuntime.callFunction(${compileCallableTarget(expression.callee, contextName, selfName, currentTypeName)}, ${compiledArgs}, ${contextName}, true)`;
}

function compileWaitTimeout(timeout, contextName, selfName = null, currentTypeName = null) {
  if (!timeout) {
    return "null";
  }

  return `__flowRuntime.waitTimeoutMilliseconds(${compileExpression(timeout.amount, contextName, null, selfName, currentTypeName)}, ${JSON.stringify(timeout.unit)})`;
}

function compileDelayClause(delay, contextName, selfName = null, currentTypeName = null) {
  return `__flowRuntime.waitTimeoutMilliseconds(${compileExpression(delay.amount, contextName, null, selfName, currentTypeName)}, ${JSON.stringify(delay.unit)})`;
}

function compileWaitTarget(target, timeout, contextName, selfName = null, currentTypeName = null) {
  const compiledTimeout = compileWaitTimeout(timeout, contextName, selfName, currentTypeName);

  if (target.type === "WaitAllExpression") {
    return `__flowRuntime.waitForAll([${target.tasks.map((task) => compileExpression(task, contextName, null, selfName, currentTypeName)).join(", ")}], ${compiledTimeout})`;
  }

  if (target.type === "WaitAnyExpression") {
    return `__flowRuntime.waitForAny([${target.tasks.map((task) => compileExpression(task, contextName, null, selfName, currentTypeName)).join(", ")}], ${compiledTimeout})`;
  }

  return `__flowRuntime.waitFor(${compileExpression(target, contextName, null, selfName, currentTypeName)}, ${compiledTimeout})`;
}

function compileCallableTarget(target, contextName, selfName = null, currentTypeName = null) {
  if (target.type === "ReferenceExpression") {
    return compileName(target.nameParts);
  }

  return compileExpression(target, contextName, null, selfName, currentTypeName);
}

function compileBuiltinCallExpression(expression, contextName, recordName = null, selfName = null, currentTypeName = null) {
  const compiledArgs = expression.args.map((arg) => compileExpression(arg, contextName, recordName, selfName, currentTypeName));

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

function compileStringOperationExpression(expression, contextName, recordName = null, selfName = null, currentTypeName = null) {
  const left = compileExpression(expression.left, contextName, recordName, selfName, currentTypeName);
  const right = compileExpression(expression.right, contextName, recordName, selfName, currentTypeName);

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

function compileCollectionAccessExpression(expression, contextName, recordName = null, selfName = null, currentTypeName = null) {
  const collection = compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName);

  if (!expression.where) {
    return expression.accessKind === "first"
      ? `__flowRuntime.firstItemOf(${collection})`
      : `__flowRuntime.lastItemOf(${collection})`;
  }

  const filteredCollection = `__flowRuntime.filterCollection(${collection}, (__flowRecord) => ${compileExpression(expression.where, contextName, "__flowRecord", selfName, currentTypeName)})`;
  return expression.accessKind === "first"
    ? `__flowRuntime.firstItemOf(${filteredCollection})`
    : `__flowRuntime.lastItemOf(${filteredCollection})`;
}

function compileCollectionCountExpression(expression, contextName, recordName = null, selfName = null, currentTypeName = null) {
  const collection = compileExpression(expression.collection, contextName, recordName, selfName, currentTypeName);

  if (!expression.where) {
    return `__flowRuntime.countOf(${collection})`;
  }

  return `__flowRuntime.countOf(__flowRuntime.filterCollection(${collection}, (__flowRecord) => ${compileExpression(expression.where, contextName, "__flowRecord", selfName, currentTypeName)}))`;
}

function compileTypeReference(typeReference) {
  if (typeReference.kind === "list") {
    return `{ kind: "list", itemType: ${compileTypeReference(typeReference.itemType)} }`;
  }

  return `{ kind: "named", name: ${compileName(typeReference.nameParts)}, displayName: ${compileName(typeReference.nameParts)} }`;
}

function describeExpression(expression) {
  switch (expression.type) {
    case "LiteralExpression":
      if (expression.valueType === "string") {
        return expression.value;
      }

      if (expression.valueType === "boolean") {
        return expression.value ? "yes" : "no";
      }

      if (expression.valueType === "no_value") {
        return "no value";
      }

      return String(expression.value);
    case "ReferenceExpression":
      return normalizeStaticName(expression.nameParts);
    case "SelfPropertyExpression":
      return `its ${normalizeStaticName(expression.propertyNameParts)}`;
    case "PropertyAccessExpression":
      return `${normalizeStaticName(expression.propertyNameParts)} of ${normalizeStaticName(expression.instanceNameParts)}`;
    case "FunctionCallExpression":
      return `${describeExpression(expression.callee)}${expression.args.length > 0 ? ` using ${expression.args.map(describeExpression).join(" and ")}` : ""}`;
    case "AnonymousCallableExpression":
      return expression.isReturning ? "the result of this" : "do this";
    case "BackgroundTaskExpression":
      return "the background task";
    case "DelayedTaskExpression":
      return `the delayed task after ${describeExpression(expression.delay.amount)} ${expression.delay.unit}`;
    case "WaitExpression":
      return `the result of wait for ${describeExpression(expression.target)}${expression.timeout ? ` for ${describeExpression(expression.timeout.amount)} ${expression.timeout.unit}` : ""}`;
    case "ActionCallExpression":
      if (expression.targetType === "SelfActionTarget") {
        return `asking itself to "${expression.actionName}"`;
      }

      if (expression.targetType === "SuperActionTarget") {
        return `asking super to "${expression.actionName}"`;
      }

      return `asking ${normalizeStaticName(expression.targetNameParts)} to "${expression.actionName}"`;
    case "BuiltinCallExpression":
      return `${expression.callee}(${expression.args.map(describeExpression).join(", ")})`;
    case "ResultExpression":
      return `the result of (${describeExpression(expression.expression)})`;
    case "UnaryExpression":
      if (expression.operator === TOKEN_KINDS.NOT) {
        return `not ${describeExpression(expression.argument)}`;
      }

      return `${expression.operator.toLowerCase()} ${describeExpression(expression.argument)}`;
    case "LogicalExpression":
      return `${describeExpression(expression.left)} ${expression.operator === TOKEN_KINDS.AND ? "and" : "or"} ${describeExpression(expression.right)}`;
    case "ComparisonExpression":
      return `${describeExpression(expression.left)} ${describeComparisonOperator(expression.operator)} ${describeExpression(expression.right)}`;
    case "StringOperationExpression":
      return `${describeExpression(expression.left)} ${describeStringOperator(expression.operator)} ${describeExpression(expression.right)}`;
    case "CollectionIsEmptyExpression":
      return `${describeExpression(expression.collection)} is empty`;
    case "CollectionContainsExpression":
      return `${describeExpression(expression.collection)} contains item ${describeExpression(expression.item)}`;
    case "CollectionHasExpression":
      return `${describeExpression(expression.collection)} has ${expression.mode} of (${expression.items.map(describeExpression).join(", ")})`;
    case "CollectionCountExpression":
      return expression.where ? `count of ${describeExpression(expression.collection)} where ${describeExpression(expression.where)}` : `count of ${describeExpression(expression.collection)}`;
    case "CollectionAccessExpression":
      return expression.where
        ? `${expression.accessKind} item of ${describeExpression(expression.collection)} where ${describeExpression(expression.where)}`
        : `${expression.accessKind} item of ${describeExpression(expression.collection)}`;
    case "CollectionTakeExpression":
      return `${expression.side} ${describeExpression(expression.count)} items of ${describeExpression(expression.collection)}`;
    case "CollectionIndexExpression":
      return `item at index ${describeExpression(expression.index)} of ${describeExpression(expression.collection)}`;
    case "CollectionIndexOfExpression":
      return `index of ${describeExpression(expression.item)} in ${describeExpression(expression.collection)}`;
    case "CollectionSliceExpression":
      return `items from index ${describeExpression(expression.start)} to ${describeExpression(expression.end)} of ${describeExpression(expression.collection)}`;
    case "WaitAllExpression":
      return `wait for all of (${expression.tasks.map(describeExpression).join(", ")})`;
    case "WaitAnyExpression":
      return `wait for any of (${expression.tasks.map(describeExpression).join(", ")})`;
    default:
      return expression.type;
  }
}

function describeComparisonOperator(operator) {
  switch (operator) {
    case "EQUAL":
      return "is equal to";
    case "NOT_EQUAL":
      return "is not equal to";
    case "GREATER_THAN":
      return "is greater than";
    case "LESS_THAN":
      return "is less than";
    case "GREATER_THAN_OR_EQUAL":
      return "is greater than or equal to";
    case "LESS_THAN_OR_EQUAL":
      return "is less than or equal to";
    default:
      return operator;
  }
}

function describeStringOperator(operator) {
  switch (operator) {
    case "CONTAINS":
      return "contains";
    case "STARTS_WITH":
      return "starts with";
    case "ENDS_WITH":
      return "ends with";
    case "JOINED_WITH":
      return "joined with";
    default:
      return operator;
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
