import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Response {
      success: (data: any, message?: string) => Response;
      error: (message: string, statusCode?: number, errors?: any) => Response;
    }
  }
}

export const responseFormatter = (req: Request, res: Response, next: NextFunction) => {
  res.success = function (data: any, message = "OK") {
    return res.status(200).json({
      success: true,
      message,
      data,
    });
  };

  res.error = function (
    message: string,
    statusCode = 500,
    errors?: any
  ) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  };

  next();
};