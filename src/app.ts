import express from 'express';
import { requestLogger } from './core/middleware/requestLogger';
import { requestId } from './core/middleware/requestId';
import { errorHandler } from './core/middleware/errorHandler';
import { responseFormatter } from './core/middleware/responseFormatter';
import apiRouter from './routes/index';
import { setupSwagger } from './config/swagger';
import contactRouter from './modules/contact/contact.routes';

const app = express();

app.use(requestLogger);
app.use(requestId);
app.use(express.json());
app.use(responseFormatter);

setupSwagger(app);

app.use("/", contactRouter)

app.use("/api/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

app.use("/api", apiRouter);

app.use(errorHandler);

export default app;