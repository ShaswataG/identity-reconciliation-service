import express from 'express';
import { requestLogger } from './core/middleware/requestLogger.js';
import { requestId } from './core/middleware/requestId.js';
import { errorHandler } from './core/middleware/errorHandler.js';
import { responseFormatter } from './core/middleware/responseFormatter.js';
import apiRouter from './routes/index.js';

const app = express();

app.use(requestLogger);
app.use(requestId);
app.use(express.json());
app.use(responseFormatter);

app.get('/', (_, res) => {
    res.json({ success: true, message: "Service is running" });
});

app.use("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

app.use("/api/v1", apiRouter);

app.use(errorHandler);

export default app;