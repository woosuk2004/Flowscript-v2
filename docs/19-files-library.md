# Files Library

FlowScript provides a built-in-backed standard module for text file I/O.

Use:

```flow
Use read text from file and write text to file and append text to file and file exists and delete file from "./standard/files.flow".
```

## Available functions

- `read text from file`
- `write text to file`
- `append text to file`
- `file exists`
- `delete file`

Each function returns a `Task`, so file work fits the existing async model.

## Read text

```flow
Set contents to the result of wait for read text from file using "./notes.txt"
Print contents.
```

This reads UTF-8 text and returns `Text` after waiting.

## Write text

```flow
Wait for write text to file using "./notes.txt" and "Hello".
```

This creates the file if needed and overwrites it if it already exists.

## Append text

```flow
Wait for append text to file using "./notes.txt" and " world".
```

This appends UTF-8 text to the end of the file. If the file does not exist yet, it is created.

## Check whether a file exists

```flow
Print the result of wait for file exists using "./notes.txt".
```

This returns `true` or `false`.

## Delete a file

```flow
Wait for delete file using "./notes.txt".
```

Deleting a missing file is an error in this version.

## Error handling

Use the normal async recovery syntax.

```flow
Try this:
    Print the result of wait for read text from file using "./missing.txt".
If it fails as error:
    Print the code of error.
    Print the kind of error.
    Print the message of error.
```

Common error codes include:

- `FILE_NOT_FOUND`
- `FILE_NOT_READABLE`
- `FILE_NOT_WRITABLE`
- `DELETE_FILE_FAILED`
- `INVALID_FILE_PATH`

## Path rules

This version keeps file access deliberately small and safe.

- only relative paths are allowed
- absolute paths are rejected
- paths must stay inside the current workspace
- text files are UTF-8
- directory operations are not included yet
- binary files are not included yet

Paths are resolved relative to the module that contains the file call.
