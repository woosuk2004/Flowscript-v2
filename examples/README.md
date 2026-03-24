# FlowScript Examples

This folder contains runnable FlowScript example programs.

## Run an Example

From the project root:

```bash
node transpiler/src/cli.js run examples/<file>.flow
```

For module examples, run the entry file:

```bash
node transpiler/src/cli.js run examples/modules/<file>.flow
```

You can also inspect tokens, the parsed program, or generated JavaScript:

```bash
node transpiler/src/cli.js lex examples/<file>.flow
node transpiler/src/cli.js parse examples/<file>.flow
node transpiler/src/cli.js transpile examples/<file>.flow
```

## Example Index

- `first-test.flow`: the first basic example with `Set`, `Print`, numbers, strings, and interpolation
- `arithmetic-reactive.flow`: arithmetic capsules, `round`, `floor`, `ceil`, and `always is`
- `comparisons.flow`: sentence-style comparison expressions
- `logic-strings.flow`: `and`, `or`, `not`, and string operators such as `contains`, `starts with`, `ends with`, and `joined with`
- `formatting-soft-words.flow`: `fixed(...)`, escaped parentheses inside strings, and statement-leading readability words
- `when-conditions.flow`: `When`, `In case`, and `Otherwise`
- `check-cases.flow`: `Check`, `Case`, and `Default`
- `list-loops.flow`: list iteration with `For each`
- `repeat-while-until.flow`: `Repeat`, `Keep doing this while`, and `Keep doing this until`
- `collections.flow`: list and set declarations, record literals, and derived collections
- `collection-pipeline.flow`: `Take ... Then ...` collection pipelines
- `collection-helpers.flow`: basic collection helpers such as `first item of`, `last item of`, `count of`, `is empty`, and `contains item`
- `collection-helpers-v2.flow`: extended collection helpers such as `first N items of`, `last N items of`, `index of ... in ...`, `has any of (...)`, and `has all of (...)`
- `constructor-super-updated.flow`: a small focused OOP example for constructor parameters, `super`, and `When updated:`
- `action-hooks.flow`: `Before` / `After` action hooks with inherited ordering and action-parameter access
- `action-return-values.flow`: returning actions, `Return ...`, and `the result of asking ...`
- `functions-and-contracts.flow`: top-level functions, direct phrase calls, `Ensure`, and `Verify`
- `async-synchronization.flow`: background tasks, `Wait for`, `Wait for any of (...)`, and `Try this: / If it fails:`
- `async-timeouts-and-cleanup.flow`: wait timeouts, `If it fails as error:`, and cleanup with `In any case:`
- `async-delayed-and-cancel.flow`: delayed execution with `After ...:`, delayed task handles, cancellation, and structured async errors
- `files-read-write.flow`: built-in file I/O with `./standard/files.flow`, including read, write, append, exists, and delete
- `files-errors.flow`: structured file error handling with `If it fails as error:`
- `anonymous-callables.flow`: anonymous callable literals with `do this`, `the result of this`, closure over outer state, and callable values in parameters and properties
- `types-and-objects.flow`: type declarations, constructor parameters, `When created:` and `When updated:` hooks, encapsulation, inheritance, `super`, property access, and `Ask`
- `modules/named-import.flow`: named imports with `Use ... from ...`, a shared type, and a shared callable value
- `modules/alias-import.flow`: module alias imports with `Use "./file.flow" as ...` and `the ... of module alias`
- `modules/text-tools.flow`: a small shared module that exports a function and a callable value
- `modules/user-model.flow`: a small shared module that exports a type

## Notes

- All examples are written in English.
- Examples are intended to be small and focused. They are not a standard library or a complete application.
- The fixture test suite uses selected top-level examples to confirm that tokenization stays stable as the language grows.
