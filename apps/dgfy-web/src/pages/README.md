# Page Test Migration Folder

This folder currently contains compatibility tests for legacy pages; it is not a runtime page directory.

Do not add new runtime pages here. New runtime pages belong under `frontend/src/features/<feature>/pages`, and new tests should be colocated with the owning feature when practical. Existing tests can move during the corresponding page migration without changing route ownership.
