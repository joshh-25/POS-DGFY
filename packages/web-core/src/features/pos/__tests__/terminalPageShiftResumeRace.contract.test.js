import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPosOperationalScopeKey,
  isCurrentPosOperationalRequest
} from '../utils/posOperationalVisibility.js';

// Deterministic regression coverage for #2129 (the lasting guard for the
// #2128 production lockout): a cashier resuming the same open POS shift must
// not lose the valid current-shift response to a stale locked callback, and a
// failed lookup must stay retryable without opening a replacement shift.
//
// The companion source-ordering contract
// (terminalPageOperationalContextSequenceGuard.contract.test.js) proves the
// eligibility guard sits before the sequence bump in TerminalPage.jsx. These
// tests prove *why* that ordering matters, using the real
// isCurrentPosOperationalRequest/buildPosOperationalScopeKey staleness
// semantics and controlled deferred promises -- no timing sleeps anywhere.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');

const RESUME_SHIFT_ID = 68;
const RESUME_OPENING_FLOAT = 2000;
const RESUME_TERMINAL_ID = 'COUNTER-01';
const RESUME_LOCATION_ID = 1;

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const validShiftPayload = () => ({
  pos_terminal_shift_id: RESUME_SHIFT_ID,
  cashier_id: 4,
  terminal_id: RESUME_TERMINAL_ID,
  location_id: RESUME_LOCATION_ID,
  opening_float_amount: RESUME_OPENING_FLOAT,
  status: 'open'
});

// Faithful miniature of TerminalPage.refreshOperationalContext's
// guard/sequence/state section. `guardFirst: true` mirrors the fixed source
// (eligibility guard returns before the request sequence is consumed);
// `guardFirst: false` mirrors the pre-#2128-fix ordering (sequence consumed
// first) and exists only to prove this scenario reproduces the lockout.
const createOperationalContextHarness = ({
  guardFirst,
  fetchCurrentShift,
  fetchDashboard,
  onOpenShift = () => {}
}) => {
  const sequenceRef = { current: 0 };
  const scopeRef = { current: 'BOOT' };
  const state = {
    shift: null,
    cashSummary: null,
    salesSummary: null,
    loading: false,
    openShiftCalls: 0
  };
  const setShiftState = (next) => {
    const resolved = typeof next === 'function' ? next(state) : next;
    state.shift = resolved.shift ?? null;
    state.cashSummary = resolved.cashSummary ?? null;
    state.salesSummary = resolved.salesSummary ?? null;
    if (resolved.loading !== undefined) state.loading = resolved.loading;
  };

  const refresh = async ({
    terminalId,
    locationId,
    locked,
    canView,
    allowWhileLocked = false
  }) => {
    const runGuardedFetch = async () => {
      if (!terminalId) {
        setShiftState((prev) => ({ ...prev, loading: false, shift: null, cashSummary: null, salesSummary: null }));
        return { shift: null, cashSummary: null, salesSummary: null };
      }
      const requestSequence = sequenceRef.current + 1;
      sequenceRef.current = requestSequence;
      const requestScopeKey = buildPosOperationalScopeKey({ terminalId, locationId });
      scopeRef.current = requestScopeKey;
      const isCurrentRequest = () => isCurrentPosOperationalRequest({
        requestSequence,
        currentRequestSequence: sequenceRef.current,
        requestScopeKey,
        currentScopeKey: scopeRef.current
      });
      setShiftState((prev) => ({ ...prev, loading: true }));
      try {
        const currentShiftResult = await fetchCurrentShift();
        if (!isCurrentRequest()) return null;
        const dashboardResult = await fetchDashboard();
        if (!isCurrentRequest()) return null;
        const activeShift = dashboardResult?.active_shift || currentShiftResult?.shift || null;
        setShiftState({
          loading: false,
          shift: activeShift,
          cashSummary: dashboardResult?.active_shift_cash_summary || currentShiftResult?.cash_summary || null,
          salesSummary: currentShiftResult?.sales_summary || null
        });
        return { shift: activeShift };
      } catch {
        if (!isCurrentRequest()) return null;
        setShiftState((prev) => ({ ...prev, loading: false }));
        return null;
      }
    };

    if (guardFirst) {
      // Fixed ordering: a stale locked/permission snapshot returns before it
      // can consume a request sequence or touch loading state.
      if ((!allowWhileLocked && locked) || !canView) {
        return { shift: null, cashSummary: null, salesSummary: null };
      }
      return runGuardedFetch();
    }

    // Pre-fix ordering: the sequence is consumed first, so a disqualified
    // callback invalidates the in-flight valid refresh and then clears its
    // loading state on the way out.
    const requestSequence = sequenceRef.current + 1;
    sequenceRef.current = requestSequence;
    if ((!allowWhileLocked && locked) || !canView) {
      setShiftState((prev) => ({ ...prev, loading: false }));
      return { shift: null, cashSummary: null, salesSummary: null };
    }
    scopeRef.current = buildPosOperationalScopeKey({ terminalId, locationId });
    const isCurrentRequest = () => isCurrentPosOperationalRequest({
      requestSequence,
      currentRequestSequence: sequenceRef.current,
      requestScopeKey: scopeRef.current,
      currentScopeKey: scopeRef.current
    });
    setShiftState((prev) => ({ ...prev, loading: true }));
    try {
      const currentShiftResult = await fetchCurrentShift();
      if (!isCurrentRequest()) return null;
      const dashboardResult = await fetchDashboard();
      if (!isCurrentRequest()) return null;
      const activeShift = dashboardResult?.active_shift || currentShiftResult?.shift || null;
      setShiftState({ loading: false, shift: activeShift, cashSummary: null, salesSummary: null });
      return { shift: activeShift };
    } catch {
      if (!isCurrentRequest()) return null;
      setShiftState((prev) => ({ ...prev, loading: false }));
      return null;
    }
  };

  const openShift = (payload) => {
    state.openShiftCalls += 1;
    onOpenShift(payload);
  };

  return { refresh, openShift, state, sequenceRef };
};

// Mirrors completeConfirmedShiftResume's confirmation gate in TerminalPage.jsx:
// resume success is reported only after an operational context contains a
// shift; otherwise the cashier stays in the retryable resume prompt.
const decideResumeOutcome = (operationalContext) => (
  operationalContext?.shift
    ? { resumed: true, unlockMode: 'unlocked' }
    : {
      resumed: false,
      unlockMode: 'resume_shift',
      retryMessage: 'No new shift or opening cash is needed'
    }
);

describe('TerminalPage shift-resume race behavioral contract (#2129)', () => {
  it('keeps the valid shift response installed when a stale locked callback runs mid-refresh', async () => {
    const currentShiftDeferred = createDeferred();
    const dashboardDeferred = createDeferred();
    const harness = createOperationalContextHarness({
      guardFirst: true,
      fetchCurrentShift: () => currentShiftDeferred.promise,
      fetchDashboard: () => dashboardDeferred.promise
    });

    // The valid resume confirmation refresh is in flight (sequence 1).
    const validRefresh = harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: false,
      canView: true,
      allowWhileLocked: true
    });

    // A delayed callback from a render that still sees `locked: true` runs
    // while the valid response is outstanding.
    const staleResult = await harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: true,
      canView: true,
      allowWhileLocked: false
    });

    expect(
      staleResult,
      'cashier shift-resume: stale locked callback must return empty without consuming the refresh'
    ).toEqual({ shift: null, cashSummary: null, salesSummary: null });
    expect(
      harness.sequenceRef.current,
      'cashier shift-resume: stale locked callback must not consume a request sequence'
    ).toBe(1);
    expect(
      harness.state.loading,
      'cashier shift-resume: stale locked callback must not clear the in-flight loading state'
    ).toBe(true);

    currentShiftDeferred.resolve({ shift: validShiftPayload(), cash_summary: null, sales_summary: null });
    dashboardDeferred.resolve({ active_shift: validShiftPayload(), active_shift_cash_summary: null });
    const validResult = await validRefresh;

    expect(
      validResult?.shift?.pos_terminal_shift_id,
      'cashier shift-resume: valid current-shift response was discarded as stale'
    ).toBe(RESUME_SHIFT_ID);
    expect(
      harness.state.shift?.pos_terminal_shift_id,
      'cashier shift-resume: valid shift was not installed in POS state'
    ).toBe(RESUME_SHIFT_ID);
    expect(
      harness.state.shift?.opening_float_amount,
      'cashier shift-resume: original opening cash was not preserved'
    ).toBe(RESUME_OPENING_FLOAT);
    expect(harness.state.loading).toBe(false);
    expect(
      decideResumeOutcome(validResult).resumed,
      'cashier shift-resume: confirmed shift must report resume success'
    ).toBe(true);
  });

  it('reproduces the #2128 lockout when the sequence is consumed before the eligibility guard', async () => {
    const currentShiftDeferred = createDeferred();
    const dashboardDeferred = createDeferred();
    const harness = createOperationalContextHarness({
      guardFirst: false,
      fetchCurrentShift: () => currentShiftDeferred.promise,
      fetchDashboard: () => dashboardDeferred.promise
    });

    const validRefresh = harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: false,
      canView: true,
      allowWhileLocked: true
    });
    await harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: true,
      canView: true,
      allowWhileLocked: false
    });

    currentShiftDeferred.resolve({ shift: validShiftPayload(), cash_summary: null, sales_summary: null });
    dashboardDeferred.resolve({ active_shift: validShiftPayload(), active_shift_cash_summary: null });
    const validResult = await validRefresh;

    // The pre-fix ordering discards the successful response as stale and
    // leaves `shift: null` with loading resolved -- the exact stuck state
    // that trapped the cashier behind the opening-cash modal in #2128.
    expect(validResult).toBeNull();
    expect(harness.state.shift).toBeNull();
    expect(harness.state.loading).toBe(false);
  });

  it('keeps a failed shift lookup retryable without success, opening-cash form, or shift-open request', async () => {
    const harness = createOperationalContextHarness({
      guardFirst: true,
      fetchCurrentShift: () => Promise.reject(new Error('Failed to load terminal operational context.')),
      fetchDashboard: () => Promise.resolve(null)
    });

    const result = await harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: false,
      canView: true,
      allowWhileLocked: true
    });

    expect(result).toBeNull();
    expect(harness.state.shift).toBeNull();
    expect(harness.state.loading).toBe(false);

    const outcome = decideResumeOutcome(result);
    expect(outcome.resumed).toBe(false);
    expect(
      outcome.unlockMode,
      'cashier shift-resume: failed lookup must stay in resume_shift mode, never fall back to the opening-cash form'
    ).toBe('resume_shift');
    expect(outcome.retryMessage).toContain('No new shift or opening cash is needed');
    expect(
      harness.state.openShiftCalls,
      'cashier shift-resume: failed lookup must not issue a shift-open request'
    ).toBe(0);
  });

  it('treats a confirmed empty shift as unresumed so no false success is reported', async () => {
    const harness = createOperationalContextHarness({
      guardFirst: true,
      fetchCurrentShift: () => Promise.resolve({ shift: null, cash_summary: null, sales_summary: null }),
      fetchDashboard: () => Promise.resolve({ active_shift: null })
    });

    const result = await harness.refresh({
      terminalId: RESUME_TERMINAL_ID,
      locationId: RESUME_LOCATION_ID,
      locked: false,
      canView: true,
      allowWhileLocked: true
    });

    expect(result).toEqual({ shift: null });
    const outcome = decideResumeOutcome(result);
    expect(outcome.resumed).toBe(false);
    expect(outcome.unlockMode).toBe('resume_shift');
    expect(harness.state.openShiftCalls).toBe(0);
  });

  it('anchors the guard-before-bump ordering to the real TerminalPage source', () => {
    const source = fs.readFileSync(terminalPagePath, 'utf8');
    const refreshStart = source.indexOf('const refreshOperationalContext = useCallback(async ({');
    const refreshEnd = source.indexOf(
      '}, [activeTerminalId, canViewPos, locked, operatingLocationId]);',
      refreshStart
    );
    const refreshSource = source.slice(refreshStart, refreshEnd);
    const eligibilityGuard = refreshSource.indexOf(
      'if ((!allowWhileLocked && locked) || !canViewOperationalContext) {'
    );
    const terminalGuard = refreshSource.indexOf('if (!terminalId) {');
    const sequenceBump = refreshSource.indexOf(
      'operationalContextRequestSequenceRef.current = requestSequence;'
    );

    expect(refreshStart).toBeGreaterThan(-1);
    expect(eligibilityGuard).toBeGreaterThan(-1);
    expect(terminalGuard).toBeGreaterThan(eligibilityGuard);
    expect(
      sequenceBump,
      'cashier shift-resume: the request sequence must be consumed only after the eligibility guard'
    ).toBeGreaterThan(terminalGuard);

    const disqualifiedGuardSource = refreshSource.slice(eligibilityGuard, terminalGuard);
    expect(disqualifiedGuardSource).not.toContain('operationalContextRequestSequenceRef.current =');
    expect(disqualifiedGuardSource).not.toContain('setShiftState');
    expect(disqualifiedGuardSource).not.toContain('setTodayDashboard');
  });

  it('coordinates the race with deferred promises only, never timing sleeps', () => {
    const ownSource = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    // Forbidden tokens are assembled below so this self-check does not match
    // its own literals.
    const sleepCall = `${'set'}${'Timeout'}(`;
    const intervalCall = `${'set'}${'Interval'}(`;
    const playwrightSleep = `${'waitFor'}${'Timeout'}`;
    expect(ownSource).not.toContain(sleepCall);
    expect(ownSource).not.toContain(intervalCall);
    expect(ownSource).not.toContain(playwrightSleep);
  });
});
