import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Identity Reconciliation API",
      version: "1.0.0",
      description: "API docs for identity reconciliation service",
    },
  },
  apis: [
    "./src/docs/*.ts",        // this picks up component schemas
    "./src/modules/**/**.ts", // this picks up route JSDoc
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};