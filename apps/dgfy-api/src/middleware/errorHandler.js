// Central error handler — matches backend's response envelope so mobile
// clients see a consistent shape whether the error came from a use case
// failure (handled per-route via sendUseCaseResult) or an unhandled throw.
export const notFoundHandler = (req, res) => res.status(404).json({
    success: false,
    data: null,
    message: `Route not found: ${req.method} ${req.originalUrl}`
});

// eslint-disable-next-line no-unused-vars
export const errorHandler = (error, req, res, next) => {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) {
        console.error('[dgfy-api] Unhandled error:', error);
    }
    res.status(statusCode).json({
        success: false,
        data: null,
        message: statusCode >= 500 ? 'Internal Server Error' : (error.message || 'Request failed')
    });
};
