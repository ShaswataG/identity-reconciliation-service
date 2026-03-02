import express from 'express';
import { requestLogger } from './core/middleware/requestLogger.js';
import { requestId } from './core/middleware/requestId.js';
import { errorHandler } from './core/middleware/errorHandler.js';
import { responseFormatter } from './core/middleware/responseFormatter.js';
import apiRouter from './routes/index.js';
import { setupSwagger } from './config/swagger.js';
import contactRouter from './modules/contact/contact.routes.js';

const app = express();

app.use(requestLogger);
app.use(requestId);
app.use(express.json());
app.use(responseFormatter);

setupSwagger(app);

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Welcome to the Identity Reconciliation Service API" });
});

app.use("/", contactRouter)

app.use("/api/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

app.use("/api", apiRouter);

app.use(errorHandler);

export default app;