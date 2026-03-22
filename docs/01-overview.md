# Overview

FlowScript is designed to make business logic readable by both developers and non-developers.

Core idea:

> Read as a story, execute as a system.

The current implementation focuses on a small, stable subset:

- sentence-style `Set` statements
- sentence-style `Print` statements
- phrase-style variable names such as `user age`
- arithmetic capsules with `the result of`
- built-in math functions: `round`, `floor`, `ceil`
- display formatting with `fixed(value, digits)`
- reactive variables with `always is`
- sentence-style comparison expressions
- logical operators: `and`, `or`, `not`
- string operators: `contains`, `starts with`, `ends with`, `joined with`
- string interpolation with `(variable name)`
- readability-only leading words such as `so`, `then`, and `that's why`

FlowScript source is transpiled to JavaScript, but the surface syntax is intentionally human-readable.
