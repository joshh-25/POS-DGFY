export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
};

