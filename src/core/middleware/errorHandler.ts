import type { Request, Response, NextFunction } from "express";
import logger from "../logger/logger.js";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
      statusCode: status,
      requestId: req.headers["x-request-id"],
    },
    "Unhandled error"
  );

  res.status(status).json({
    success: false,
    error: {
      message,
      code: err.code || "INTERNAL_SERVER_ERROR",
    },
  });
};