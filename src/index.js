import { summarizeConfigSafe } from "./config.js";
console.log("✅ Config OK (safe summary below)");
console.dir(summarizeConfigSafe(), { depth: null });
