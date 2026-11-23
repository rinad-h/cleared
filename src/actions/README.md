# src/actions

Server actions (`"use server"`). Each one does three things: `getActor()` →
`parse(Schema, formData)` → a service call, wrapped in `run()`, then `refresh()`
or `redirect()`. Permission checks live in the services, not here. First files
arrive in Phase 1. See `docs/technologies.md` §9.
