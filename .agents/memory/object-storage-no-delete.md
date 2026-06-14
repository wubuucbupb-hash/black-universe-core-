---
name: object storage has no delete; destructive deletes orphan documents
description: Why admin hard-delete routes (asset/user/account) leave uploaded documentUrls files behind, and that this is an accepted app-wide gap, not a per-route bug.
---

`ObjectStorageService` exposes no delete/remove method (only signed GET/PUT/HEAD/DELETE *URL* generation, not an actual object delete). So every destructive admin route — `DELETE /admin/assets/:id`, `DELETE /admin/users/:id`, `DELETE /admin/accounts/:accountNumber` — deletes DB rows but leaves the files referenced by `assets.documentUrls` orphaned in object storage. After the row is gone, the `storage.ts` owner-ACL check (which joins `documentUrls` via `arrayContains`) can no longer resolve an owner, so the files become unmanaged.

**Why:** This is a pre-existing, app-wide pattern, not something any single delete route introduced. Document purging would require building a new delete method on `ObjectStorageService` first.

**How to apply:** Do NOT "fix" this in only one delete route — that creates inconsistency. If document cleanup is wanted, treat it as a deliberate cross-cutting task: add a real delete method to `ObjectStorageService`, then call it from all three cascade/delete paths together. Until then, accept that hard-deletes orphan documents.
