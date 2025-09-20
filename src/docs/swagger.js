import fs from "fs";
import path from "path";
import yaml from "yaml";
import swaggerUi from "swagger-ui-express";

export function mountSwagger(app) {
  if (process.env.NODE_ENV !== "development") return;
  const openapiPath = path.join(process.cwd(), "ggzapi.yaml");
  const spec = yaml.parse(fs.readFileSync(openapiPath, "utf8"));

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.get("/api/docs.json", (_, res) => res.json(spec));

  // eslint-disable-next-line no-console
  console.log(
    "🔎 Swagger UI enabled at http://localhost:" +
      (process.env.PORT || 5000) +
      "/api/docs"
  );
}
