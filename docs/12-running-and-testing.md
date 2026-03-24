# Running and Testing

Run commands from the project root.

## Run the full test suite

```bash
pnpm test
```

## Run one FlowScript file

```bash
node transpiler/src/cli.js run examples/first-test.flow
node transpiler/src/cli.js run examples/arithmetic-reactive.flow
node transpiler/src/cli.js run examples/comparisons.flow
node transpiler/src/cli.js run examples/formatting-soft-words.flow
node transpiler/src/cli.js run examples/logic-strings.flow
node transpiler/src/cli.js run examples/when-conditions.flow
node transpiler/src/cli.js run examples/check-cases.flow
node transpiler/src/cli.js run examples/list-loops.flow
node transpiler/src/cli.js run examples/repeat-while-until.flow
node transpiler/src/cli.js run examples/collections.flow
node transpiler/src/cli.js run examples/collection-pipeline.flow
node transpiler/src/cli.js run examples/modules/named-import.flow
node transpiler/src/cli.js run examples/modules/alias-import.flow
node transpiler/src/cli.js run examples/async-synchronization.flow
node transpiler/src/cli.js run examples/files-read-write.flow
node transpiler/src/cli.js run examples/files-errors.flow
```

`run` follows module imports automatically.

## Inspect tokens

```bash
node transpiler/src/cli.js lex examples/collections.flow
```

## Inspect the AST

```bash
node transpiler/src/cli.js parse examples/collections.flow
```

## Inspect the generated JavaScript

```bash
node transpiler/src/cli.js transpile examples/collections.flow
node transpiler/src/cli.js transpile examples/modules/named-import.flow
node transpiler/src/cli.js transpile examples/files-read-write.flow
```

`transpile` follows module imports automatically and emits one combined JavaScript program for the entry file and its dependencies.

## Parse one file

```bash
node transpiler/src/cli.js parse examples/modules/named-import.flow
```

`parse` stays single-file in this version. It shows the AST for the file you point at, without expanding imports.
