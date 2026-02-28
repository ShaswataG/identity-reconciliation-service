import pino from "pino";
import path from "path";
import fs from "fs";

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: {
      pid: false,
      hostname: false,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination(path.join(logsDir, "app.log")) },
  ])
);

export default logger;