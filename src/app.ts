import express from 'express';
import { requestLogger } from './core/middleware/requestLogger';
import { requestId } from './core/middleware/requestId';
import { errorHandler } from './core/middleware/errorHandler';
import { responseFormatter } from './core/middleware/responseFormatter';
import apiRouter from './routes/index';


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