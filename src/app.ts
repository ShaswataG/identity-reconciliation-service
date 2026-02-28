import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (_, res) => {
    res.json({ success: true, message: "Service is running" });
});

export default app;