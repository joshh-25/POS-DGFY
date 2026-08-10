# @sieitzz/shared-constants

Canonical workflow-mode, item-taxonomy, and UOM constants for `backend/` and
`apps/dgfy-web/`. Both layers depend on this package via `file:` and re-export it
from their existing module paths, so nothing consuming those paths needs to
change. Layer-specific extras (backend's `validateItemAgainstModeTaxonomy`,
frontend's nav/route-visibility helpers) stay local to each layer's wrapper
file and are not part of this package.
