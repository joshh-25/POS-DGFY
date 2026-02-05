# AI Mistakes Log

This document tracks issues and bugs found in the SKUpervisor AI assistant to prevent circular debugging.

---

## Issue #1: AI Not Using Tools Proactively (FIXED)
**Date:** 2026-01-30
**Status:** ✅ FIXED

**Problem:** AI asked "What supplier? What quantity?" instead of looking up the item first.

**Root Cause:** System prompt didn't instruct AI to use tools before asking questions.

**Fix:** Added "Proactive Data Fetching" section to `aiSystemPrompt.js` with examples.

**Files Modified:**
- `backend/src/config/aiSystemPrompt.js`
- `backend/src/config/aiTools.js` (updated descriptions)

---

## Issue #2: AI Couldn't Chain Tool Calls (FIXED)
**Date:** 2026-01-30
**Status:** ✅ FIXED

**Problem:** AI said "I'll check suppliers..." but nothing happened. No follow-up action.

**Root Cause:** The follow-up API call to OpenAI didn't include the `tools` parameter, so AI couldn't make additional tool calls.

**Fix:** Added tools to follow-up API call and implemented recursive tool chaining with MAX_TOOL_ITERATIONS=5 safety limit.

**Files Modified:**
- `backend/src/services/aiService.js` (handleToolCalls function)

---

## Issue #3: AI Loses Context Between Turns (INVESTIGATING)
**Date:** 2026-01-30
**Status:** 🔄 IN PROGRESS - Multiple fixes applied

**Problem:**
- Turn 1: AI finds BOBO item with supplier BB (ID, price, MOQ all shown)
- Turn 2: User says "Yes, 300 units, Feb 14 delivery"
- Turn 3: AI says "I need more information... specify which item" - LOST ALL CONTEXT

**Observed Behavior:**
1. AI correctly found BOBO and supplier BB in turn 1
2. When user provided quantity/date, AI completely forgot the item and supplier
3. AI even tried to search "300 kilograms" as an item name (!)

**Root Causes Found:**
1. **Accumulated results lost in recursion:** When tool chaining happened, only the LAST iteration's results were passed to `extractToolContext()`. Earlier tool results (like `get_items` → `get_item_details`) were lost.
2. **Missing explicit instructions:** System prompt didn't tell AI HOW to use the context from previous messages.
3. **Sequelize JSON persistence issue (SUSPECTED):** Sequelize may not be detecting changes to nested objects inside JSON columns, causing context to not be saved.

**Fixes Applied:**
1. **Added `allResults` accumulator:** Pass accumulated results through recursive `handleToolCalls()` calls
2. **Added "Using Conversation Context" section to prompt:** Explicit instructions and examples showing AI how to use `[Context from tools: ...]` data
3. **Added debug logging:** Comprehensive logging at each stage of context flow
4. **Force Sequelize JSON change detection:** Added `conversation.changed('messages', true)` before save

**Files Modified:**
- `backend/src/services/aiService.js` - Added `allResults` parameter, accumulate through recursion, debug logging
- `backend/src/config/aiSystemPrompt.js` - Added "Using Conversation Context" section with examples
- `backend/src/controllers/aiController.js` - Added debug logging, force Sequelize change detection

---

## Issue #4: AI Interprets Quantity as Item Search (FIXED)
**Date:** 2026-01-30
**Status:** ✅ FIXED (via Issue #3)

**Problem:** When user said "300 kilograms. I want to order", AI searched for an item called "300 kilograms".

**Root Cause:** AI lost context of what item was being discussed, so it defaulted to searching for items based on the user's message.

**Fix:** Fixed by Issue #3 - AI now has explicit instructions to use context from previous turns instead of searching for new items when user provides follow-up info.

---

## Debugging Checklist

When AI loses context, check:
1. [ ] Was the server restarted after code changes?
2. [ ] Is `response.toolContext` being populated in `handleToolCalls`?
3. [ ] Is `assistantMessage.context` being saved in controller?
4. [ ] Is `msg.context` being read in `processMessage`?
5. [ ] Is `formatContextForMemory()` producing readable output?
6. [ ] Is the system prompt telling AI to use the context?
7. [ ] Check server logs for `[CONTEXT DEBUG]` entries to trace the flow

## Debug Log Markers

Look for these log entries in the server console:
- `[CONTEXT DEBUG] Processing message. History has X messages` - Start of processing
- `[CONTEXT DEBUG] History[N]: role=X, hasContext=Y` - Each message in history
- `[CONTEXT DEBUG] Appending context to assistant message: ...` - Context being added
- `[CONTEXT DEBUG] Extracted tool context: {...}` - Context from tool results
- `[CONTEXT DEBUG] Saving context to DB: {...}` - What's being saved
- `[CONTEXT DEBUG] About to save N messages to DB` - Before database save
- `[CONTEXT DEBUG] Read N messages from DB` - What was read back

---

## Code Locations for Context Flow

1. **Extract context from tools:** `aiService.js` → `extractToolContext()`
2. **Return context with response:** `aiService.js` → `handleToolCalls()` return
3. **Save context to DB:** `aiController.js` → `chat()` → `messages.push({...context})`
4. **Read context from history:** `aiService.js` → `processMessage()` → `conversationHistory.map()`
5. **Format for AI:** `aiService.js` → `formatContextForMemory()`
