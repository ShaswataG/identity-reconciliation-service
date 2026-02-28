import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

/**
 * After express-validator validation chains in routes,
 * this middleware checks validation results and returns errors.
 */
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const result = validationResult(req);
  
  if (!result.isEmpty()) {
    const rawErrors = result.array({ onlyFirstError: true });

    const formatted = rawErrors
      .filter((error) => error.type === "field")
      .map((error) => ({
        field: error.path,
        message: error.msg,
        location: error.location,
      }));

    return res.error("Validation failed", 400, formatted);
  }
  next();
};