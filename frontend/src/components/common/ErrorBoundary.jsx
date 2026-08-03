import React from 'react';
import { captureRenderError } from '../../observability/sentryClient.js';
import {
    isChunkLoadError,
    reloadOnceForChunkFailure,
    clearChunkReloadMarker,
    clearAppRuntimeCaches
} from '../../utils/chunkLoadRecovery.js';

/**
 * ErrorBoundary — Fix 10.3: Inconsistent API Error Handling
 *
 * A class-based React Error Boundary that catches unhandled render-phase exceptions
 * (e.g. a hook throwing during render, a missing prop causing a TypeError, etc.)
 * and shows a user-friendly fallback instead of a blank/white screen.
 *
 * Class components are required here because getDerivedStateFromError and
 * componentDidCatch are class-only React lifecycle methods — there is no
 * functional equivalent.
 *
 * Usage (see main.jsx where this wraps the entire app tree):
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, isChunkError: false, reloadScheduled: false };
        this.handleReload = this.handleReload.bind(this);
    }

    static getDerivedStateFromError(error) {
        // Update state so the fallback UI renders on the next render cycle
        return { hasError: true, error, isChunkError: isChunkLoadError(error) };
    }

    componentDidCatch(error, info) {
        if (isChunkLoadError(error)) {
            // A tab left open across a deploy references chunks that no
            // longer exist. Recover automatically -- but only the FIRST
            // time within the cooldown window; reporting every occurrence
            // would file one event per open terminal per deploy. Once the
            // automatic budget is spent, this really is a genuinely broken
            // deploy and is worth reporting.
            const reloading = reloadOnceForChunkFailure();
            this.setState({ reloadScheduled: reloading });
            if (!reloading) {
                console.error('[ErrorBoundary] Persistent chunk-load failure:', error, info.componentStack);
                captureRenderError(error, info);
            }
            return;
        }
        // Log to console in all environments. In production this could be
        // forwarded to a monitoring service (Sentry, etc.)
        console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
        captureRenderError(error, info);
    }

    async handleReload() {
        // A manual click always gets a fresh one-shot budget and a full
        // cache purge -- acceptable to pay the offline-mode cost here
        // (unlike the automatic path above) because a human explicitly
        // asked for it.
        this.setState({ hasError: false, error: null, isChunkError: false, reloadScheduled: false });
        clearChunkReloadMarker();
        await clearAppRuntimeCaches();
        window.location.reload();
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        if (this.state.isChunkError && this.state.reloadScheduled) {
            return (
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f8fafc',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        padding: '1rem',
                        color: '#64748b',
                        fontSize: '0.875rem'
                    }}
                >
                    Finishing an update&hellip;
                </div>
            );
        }

        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8fafc',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    padding: '1rem',
                }}
            >
                <div
                    style={{
                        background: '#ffffff',
                        borderRadius: '1rem',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                        padding: '2.5rem 2rem',
                        maxWidth: '420px',
                        width: '100%',
                        textAlign: 'center',
                        border: '1px solid #f1f5f9',
                    }}
                >
                    {/* Icon */}
                    <div
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: '#fef2f2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.25rem',
                        }}
                    >
                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>

                    <h1
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: '#0f172a',
                            marginBottom: '0.5rem',
                        }}
                    >
                        {this.state.isChunkError ? "Couldn't load the latest update" : 'Something went wrong'}
                    </h1>

                    <p
                        style={{
                            fontSize: '0.875rem',
                            color: '#64748b',
                            lineHeight: '1.5',
                            marginBottom: '1.5rem',
                        }}
                    >
                        {this.state.isChunkError
                            ? "A new version was deployed but this device couldn't load part of it. Your data is safe — reloading will restore normal operation."
                            : 'An unexpected error occurred. Your data is safe — refreshing the page will restore normal operation.'}
                    </p>

                    {this.state.error && (
                        <details style={{ textAlign: 'left', marginBottom: '1.5rem', width: '100%' }}>
                            <summary style={{ fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', marginBottom: '0.5rem' }}>
                                View technical error details
                            </summary>
                            <pre
                                style={{
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    fontSize: '0.75rem',
                                    color: '#b91c1c',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {this.state.error.stack || this.state.error.message || String(this.state.error)}
                            </pre>
                        </details>
                    )}

                    <button
                        onClick={this.handleReload}
                        style={{
                            width: '100%',
                            padding: '0.625rem 1rem',
                            borderRadius: '0.625rem',
                            background: '#0f172a',
                            color: '#ffffff',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1e293b'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#0f172a'; }}
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
