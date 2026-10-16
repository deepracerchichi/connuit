import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getUsage } from "../services/usageService.js";

export const usageRouter = Router();
usageRouter.use(requireAuth);

// Today's AI calls for the signed-in user: { aiCalls, limit, resetsAt }.
usageRouter.get("/", async (req, res) => {
  res.json(await getUsage(req.userId!));
});
