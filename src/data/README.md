# src/data

Read functions for Server Components (`import "server-only"`). Each one gets the
actor and database and calls a service's read function, so pages never query D1
directly. First files arrive in Phase 1. See `docs/technologies.md` §9.
