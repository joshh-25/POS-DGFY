# Backend Modules

This folder hosts the modular-monolith boundary for backend domains.

Expected flow:

`routes -> controllers (transport) -> usecases -> repositories -> models`

Legacy `src/controllers` and `src/services` remain as compatibility facades
during migration. New code should be written in `src/modules`.
