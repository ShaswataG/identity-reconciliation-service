import type { Request, Response, NextFunction } from "express";
import logger from "../logger/logger.js";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const { method, url } = req;
  const start = Date.now();

  logger.info({ method, url }, "Incoming request");

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    logger.info({ method, url, statusCode, duration }, "Request completed");
  });

  next();
};