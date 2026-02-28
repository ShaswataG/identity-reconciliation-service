import express from 'express';
import { requestLogger } from './core/middleware/requestLogger.js';
import { requestId } from './core/middleware/requestId.js';

const app = express();

app.use(requestLogger);
app.use(requestId);
app.use(express.json());

app.get('/', (_, res) => {
    res.json({ success: true, message: "Service is running" });
});

export default app;