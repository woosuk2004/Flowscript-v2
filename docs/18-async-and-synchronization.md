# Async and Synchronization

FlowScript's first async layer is task-based.

## In the background

Use `In the background:` when we want to start work and continue immediately.

```flow
In the background:
    send welcome email using user.
```

This form is fire-and-forget. It does not give us a task handle.

## After

Use `After ...:` when work should start later.

```flow
After 5 seconds:
    send reminder using user.
```

In this version, delayed blocks are scheduled and then run when the program finishes or when something waits on the related task.

## The background task

Use `the background task:` when we want a task value we can wait on later.

```flow
Set email job to the background task:
    send welcome email using user.
```

Task values are first-class and can be stored, passed, and printed.

## The delayed task

Use `the delayed task after ...:` when we want a delayed task handle that we can store, cancel, or wait on later.

```flow
Set reminder job to the delayed task after 1 minute:
    send reminder using user.
```

## Wait for

Use `Wait for ...` to wait for one task.

```flow
Wait for email job.
```

If we want the produced value, use the result form.

```flow
Set report to the result of wait for report job
Print the result of wait for report job.
```

Waiting for a non-task value is an error in this version.

We can also add a timeout directly to the wait.

```flow
Wait for email job for 5 seconds.
Set report to the result of wait for report job for 1 minute
```

Supported timeout units in this version are:

- `millisecond` / `milliseconds`
- `second` / `seconds`
- `minute` / `minutes`

## Wait for all of

Use `Wait for all of (...)` to wait for several tasks together.

```flow
Wait for all of (user job, orders job)
Set results to the result of wait for all of (user job, orders job)
```

The value form returns a list of results in input order.

## Wait for any of

Use `Wait for any of (...)` when the first completed task is enough.

```flow
Set fastest result to the result of wait for any of (korea job, us job)
```

In this version, task lists must be written as literal lists inside parentheses.

## Try this / If it fails

Use `Try this:` and `If it fails:` to recover from failures.

```flow
Try this:
    Wait for email job.
If it fails:
    Print "Email failed".
```

The failure block runs when any statement inside the `Try this:` block throws an error.

If we want the error value, bind it with `as`.

```flow
Try this:
    Wait for email job.
If it fails as error:
    Print error.
```

Bound errors print as their message text.

Bound errors also expose structured fields.

```flow
Try this:
    Wait for reminder job.
If it fails as error:
    Print the code of error.
    Print the kind of error.
    Print the message of error.
```

Current built-in fields are:

- `the code of error`
- `the kind of error`
- `the message of error`
- `the details of error`
- `the source of error`

## In any case

Use `In any case:` when cleanup should run whether the try block succeeds or fails.

```flow
Try this:
    Wait for email job for 5 seconds.
If it fails as error:
    Print error.
In any case:
    Print "Cleanup complete".
```

This block behaves like a `finally` block in other languages.

## Cancel

Use `Cancel ...` to cancel a pending task handle.

```flow
Cancel reminder job.
```

Waiting on a canceled task fails with a structured error such as:

- code: `TASK_CANCELED`
- kind: `CanceledError`

## Notes

- non-returning background work resolves to `no value` when waited on
- unhandled background task failures are surfaced clearly at the end of execution
- cleanup blocks run on both success and failure
- in the current runtime, built-in background tasks complete immediately, while delayed tasks use a virtual scheduler so examples and tests stay fast
- task cancellation is included, but cancellation groups and timeouts on arbitrary future async sources are not included yet
