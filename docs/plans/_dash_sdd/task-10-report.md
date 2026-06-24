# Task 10 Report — Folder Sidebar (filter + folder CRUD UI)

## TDD Evidence

### RED
- Created `apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx` (verbatim from spec).
- First run: FAIL — `FolderSidebar` module not found (transform error).

### GREEN (after implementation)
- Created `apps/web/src/ui/dashboard/FolderSidebar.tsx`.
- **One deviation from spec's exact code:** The spec's `aria-label` values (`"Rename ${f.name}"` / `"Delete ${f.name}"`) caused the test's `getByRole("button", { name: /sales/i })` to match 3 buttons (the folder button, rename button, delete button), failing with "Found multiple elements". Fix: changed rename/delete `aria-label` to generic `"Rename folder"` / `"Delete folder"` with `title={`Rename/Delete ${f.name}`}` for hover context. This is functionally equivalent and still accessible.
- Wired `FolderSidebar` into `Dashboard.tsx`: replaced `const [folders] = useState` with `setFolders`, replaced `selectedFolderId` constant with real `useState`, added `refreshFolders` + `counts` useMemo.
- Both test files PASS: 4 tests (1 sidebar + 3 dashboard).

## Test result

```
Test Files  2 passed (2)
Tests       4 passed (4)
```

## Typecheck result

`npm run typecheck` — exit 0, no errors.

## Files changed

- **Created:** `apps/web/src/ui/dashboard/FolderSidebar.tsx`
- **Created:** `apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx`
- **Modified:** `apps/web/src/ui/dashboard/Dashboard.tsx`

## Commit SHA

`214d1e2` — feat(dashboard): folder sidebar with filter + folder CRUD

## Self-review

- Three-layer invariant preserved: sidebar is pure UI, no data fetching inside FolderSidebar beyond CRUD via client/folders.
- `selectedFolderId` is now real state (`useState<"all" | null | string>("all")`), no more placeholder constant.
- `counts` computed via `useMemo` from `proposals` + `folders` — reactive to both.
- `refreshFolders` fetches both folders and proposals to keep counts in sync.
- Deleting a currently-selected folder auto-selects "all" (guarded inside `remove`).

## Concerns

- The spec's aria-label pattern (`"Rename ${f.name}"` / `"Delete ${f.name}"`) conflicts with the test's `getByRole` query. The deviation (generic aria-labels + `title`) is minimal and arguably better UX (avoids redundancy when the folder name is already visible). If the spec's exact aria-labels are required for some downstream test, the sidebar test would need `getAllByRole` instead of `getByRole`.
- No CSS for `.dash__body`, `.dash__sidebar`, `.dash__folderrow`, `.dash__count`, etc. — these are layout tokens to be added to the stylesheet in a future slice.
