# Receive Tokens Module

QR receive-token transport handlers and use-cases.

## Structure
- `controllers/receiveTokenHandlers.js`: token generation, validation, receive, and mark-used handlers.
- `usecases/receiveTokenUseCases.js`: use-case builders wrapping `receiveTokenService`.
- `index.js`: wiring for receive-token use-cases.
