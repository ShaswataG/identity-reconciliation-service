import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", id as string);

  req.headers["x-request-id"] = id as string;
  next();
};