# FlowScript

In the age of vibe coding, programming languages should feel closer to natural language.

FlowScript is a sentence-shaped programming language for readable automation, business rules, and executable specs.

It is designed to feel closer to a workflow document or policy description than to a traditional programming language, while still supporting modules, types, contracts, async tasks, files, and collections.

## Why it exists

Most languages optimize for power first and readability second. FlowScript tries a different tradeoff:

- code should stay readable as it grows
- business rules should look like business rules
- automation should read like instructions
- common features should still feel natural in the language itself

## Quick taste

### Best first example

This is the example I would use first when introducing FlowScript.

It is short, readable, and already shows that the language is not just “pretty syntax”:
- it has real function definitions
- it has contracts
- it has explicit results
- it still reads like a rule or policy

```flow
How to calculate discount using price and tax and returns Number:
    Ensure price is greater than or equal to 0.
    Ensure tax is greater than or equal to 0.
    Set total to the result of round(price * (1 + tax), 2)
    Verify total is greater than or equal to 0.
    Return total.

Set discount to the result of calculate discount using 100 and 0.1
Print discount.
```

### Object behavior with hooks

```flow
Define a Type called User:
    It has a public Email (Text).

    Before "Update Email" using next email:
        Print "Before update".

    It can "Update Email" as public using next email:
        Set its Email to next email.

    After "Update Email" using next email:
        Print its Email.
```

### Async work with files

```flow
Use read text from file and write text to file from "./standard/files.flow".

Wait for write text to file using "./notes.txt" and "Hello, FlowScript"
Print the result of wait for read text from file using "./notes.txt".
```

### Modules that still read naturally

```flow
Use formatter and parse user from "./text-tools.flow".
Use "./text-tools.flow" as text tools.

Print the result of parse user using "Bob".
Print the result of the formatter of text tools using "Dana".
```

## Current feature set

FlowScript already includes:

- sentence-style `Set`, `Print`, and phrase-style names
- functions with `Ensure` and `Verify`
- custom types, inheritance, encapsulation, hooks, and action return values
- collections, pipelines, loops, and helper expressions
- modules with `Share` and `Use`
- async tasks, waiting, timeouts, cancellation, and structured error handling
- built-in-backed file I/O through `./standard/files.flow`

## Why the syntax looks like this

FlowScript leans into a simple idea:

- if AI is helping us write more code
- if more code is being generated, reviewed, and edited conversationally
- and if many programs are really workflows, rules, and policies

then programming languages should move closer to natural language, not further away from it.

That does not mean “just use English and hope for the best”.

The goal is to make the language feel natural without giving up structure:

- contracts are explicit
- types are explicit
- hooks are explicit
- modules are explicit
- async behavior is explicit

So the code can stay readable without becoming vague.

## What it is good for

- readable automation scripts
- business-rule style logic
- executable specifications
- DSL-like workflows that still need real control flow and data handling

## What it is not

At least right now, FlowScript is not trying to be:

- a low-level systems language
- a JavaScript replacement
- a large ecosystem language with many third-party packages

The project is currently focused on language design, ergonomics, and runtime behavior.

## Run it

From the project root:

```bash
pnpm test
node transpiler/src/cli.js run examples/first-test.flow
node transpiler/src/cli.js run examples/functions-and-contracts.flow
node transpiler/src/cli.js run examples/types-and-objects.flow
node transpiler/src/cli.js run examples/async-synchronization.flow
node transpiler/src/cli.js run examples/files-read-write.flow
```

You can also inspect the lexer, AST, or generated JavaScript:

```bash
node transpiler/src/cli.js lex examples/files-read-write.flow
node transpiler/src/cli.js parse examples/files-read-write.flow
node transpiler/src/cli.js transpile examples/files-read-write.flow
```

## Best places to start

- Language guide: [docs/README.md](./docs/README.md)
- Example index: [examples/README.md](./examples/README.md)
- Best first example: [examples/functions-and-contracts.flow](./examples/functions-and-contracts.flow)
- Types and hooks example: [examples/types-and-objects.flow](./examples/types-and-objects.flow)
- Async example: [examples/async-synchronization.flow](./examples/async-synchronization.flow)
- Files example: [examples/files-read-write.flow](./examples/files-read-write.flow)

## Repository layout

- `transpiler/`: lexer, parser, transpiler, runtime, and tests
- `examples/`: runnable FlowScript programs
- `docs/`: language guide
- `standard/`: standard modules such as `files.flow`

## Status

FlowScript is active and already fairly feature-rich, but it is still evolving. Syntax and semantics may continue to improve as the language gets real-world feedback.

If you are trying it, the most useful feedback is:

- where the syntax feels unusually clear
- where it feels awkward or too magical
- which use cases it seems naturally suited for
