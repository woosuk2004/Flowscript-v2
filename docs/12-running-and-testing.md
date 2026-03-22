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
```

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
```
