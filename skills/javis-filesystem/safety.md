# JavisFilesystem Safety Rules

These rules are mandatory when using this skill. They preserve the guarantees the original `Workspace-MCP` server enforced at the process boundary.

## 1. Root boundary

All operations resolve paths relative to a single working root:
- If the env var `JAVIS_FS_ROOT` is set, that absolute path is the root.
- Otherwise the current working directory is the root.

Every script verifies that the resolved absolute path stays under the root (after symlink resolution). Absolute paths in arguments are rejected. Path-traversal escapes (`../`, symlinks pointing outside) are rejected with exit code 2 and an error of the form `path '<x>' resolves outside root`.

## 2. Atomic writes

Use `scripts/safe_write.py` for every write you care about. It:
1. Writes to a sibling temp file `<target>.tmp.<pid>.<rand>`.
2. `fsync`s the temp file.
3. `os.replace`s it onto the target — atomic on POSIX.
4. On any failure, removes the temp and surfaces the original error.

`assemble_paper.py` uses the same atomic-rename pattern internally.

**Do not use Claude's `Write` tool for paths the user expects to be durable.** Use `safe_write.py`. Claude's `Write` is acceptable only for ad-hoc throwaway files.

## 3. Extension allowlist (writes only)

`safe_write.py` and `assemble_paper.py` reject writes whose extension is not in:

```
.md .txt .tex .yaml .yml .json .bib .csv .html
```

Anything else (figures, PDFs, Excel, binaries) is read-only.

## 4. No deletes

This skill does not delete files. If the user asks to remove a file, tell them to use their shell — the skill intentionally lacks a delete script.

## 5. Pandoc output safety

`render_pandoc.py` requires the output extension to be `.tex` or `.pdf`. Extra pandoc flags must match one of: `--toc`, `--number-sections`, `--pdf-engine=…`, `--metadata=…`, `--variable=…`. Other flags are rejected — this guards against shell-style injection via pandoc args.

## 6. xlsx is read-only

`read_xlsx.py` only reads. There is no `write_xlsx`. Spreadsheets are static inputs.
