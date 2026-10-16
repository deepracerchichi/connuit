import cors from "cors";

import { env } from "./config/env.js";
import express from "express";
import { connectToDatabase } from "./db/connect.js";
import { workflowsRouter } from "./routes/workflow.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { loadCronWorkflowsFromDatabase } from "./scheduler/cronScheduler.js";
import { authRouter } from "./routes/auth.js";
import "./queue/runWorker.js";
import { credentialsRouter } from "./routes/credentials.js";
import { usageRouter } from "./routes/usage.js";


await connectToDatabase();
await loadCronWorkflowsFromDatabase(); 

const app = express();
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());

// --- routes ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/auth", authRouter)
app.use("/workflows", workflowsRouter);
app.use("/webhooks", webhooksRouter);   
app.use("/credentials", credentialsRouter);
app.use("/usage", usageRouter);
// --- 404: nothing above matched ---
app.use((req, res) => {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.originalUrl}` } });
});

// --- error handler: MUST be registered last ---
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});
