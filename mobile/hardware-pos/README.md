# Hardware POS Workspace

This workspace is the standalone native hardware POS surface for iMin Android devices.

## Scope

- Native-rendered cashier UI
- Offline-first local persistence
- Manual sync center with a `2` successful syncs per business day policy
- Native printer, cash drawer, scanner, and diagnostics bridges
- UX parity with the current web POS cashier flow
- Local catalog cache so the same app keeps navigating while offline
- Explicit live backend vs cached offline runtime state in the app shell

## Initial implementation slice

- Local schema contract in [src/db/schema.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\db\schema.ts)
- SQLite bootstrap statements in [src/db/migrations.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\db\migrations.ts)
- SQLite driver contract in [src/db/driver.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\db\driver.ts)
- Native SQLite adapter boundary in [src/db/nativeSqliteDriver.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\db\nativeSqliteDriver.ts)
- Mobile POS HTTP client in [src/api/mobilePosClient.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\api\mobilePosClient.ts)
- Sync policy engine in [src/domain/syncPolicy.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\domain\syncPolicy.ts)
- Local checkout and replay payload contract in [src/domain/checkout.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\domain\checkout.ts)
- Repository contracts in [src/repositories/contracts.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\repositories\contracts.ts)
- SQLite repository implementations in [src/repositories/sqliteLocalTransactionRepository.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\repositories\sqliteLocalTransactionRepository.ts) and [src/repositories/sqliteSyncRepositories.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\repositories\sqliteSyncRepositories.ts)
- In-memory repositories for app-flow development in [src/repositories/inMemoryRepositories.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\repositories\inMemoryRepositories.ts)
- Local checkout journaling service in [src/services/localCheckoutJournalService.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\services\localCheckoutJournalService.ts)
- Pending history aggregation in [src/services/pendingHistoryService.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\services\pendingHistoryService.ts)
- Manual sync orchestration in [src/services/manualSyncService.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\services\manualSyncService.ts)
- Shared domain types in [src/domain/types.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\domain\types.ts)
- App dependency container in [src/app/dependencies.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\app\dependencies.ts)
- Zustand cashier workflow store in [src/app/store.ts](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\app\store.ts)
- Native cashier flow screens in [src/app/screens](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\app\screens)
- Native cashier parity helpers in [src/app/components](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\app\components)
- App shell boundaries and first-screen composition in [src/app/App.tsx](C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos\src\app\App.tsx)

This workspace now covers a runnable offline-first cashier flow:

- cashier unlock against the existing backend auth contract
- persisted local shift/session/catalog cache on supported native SQLite runtimes
- same in-app navigation whether the backend is reachable or not
- manual sync center with pending/synced/conflict visibility
- native hardware boundaries kept behind contracts so the UI can keep evolving safely
