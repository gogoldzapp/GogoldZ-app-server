import e from "express";
import client from "prom-client";
const collectDefaultMetrics = client.collectDefaultMetrics;

// collect default system metrics every 10 seconds
collectDefaultMetrics({ timeout: 10000 });

const metrics = {
  metricsHandler: async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  },
};

export default metrics;
