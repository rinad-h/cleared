# src/actions

Server actions (`"use server"`). Every export is created with `action()` from
`src/lib/server-action.ts`: `getActor()` → `parse(Schema, input)` → a service
call, wrapped in `run()`, then `refresh()` or `redirect()`. Permission checks
live in the services, not here. `tests/unit/actions-wrapped.spec.ts` fails if a
module here exports anything else. See `docs/technologies.md` §9.
