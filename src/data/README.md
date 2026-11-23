# src/data

Read functions for Server Components (`import "server-only"`). Each one gets the
actor and database and calls a service's read function, so pages never query D1
directly and every permission check stays in the service. See
`docs/technologies.md` §9.
