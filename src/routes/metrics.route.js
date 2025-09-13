import { Router } from "express";
import client from "prom-client";
import config from "../config/index.js";

export const metricsRouter = Router();

metricsRouter.get("/", async (req, res) => {
  if (req.get("x-metrics-key") !== config.metrics.key)
    return res.sendStatus(403);
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
