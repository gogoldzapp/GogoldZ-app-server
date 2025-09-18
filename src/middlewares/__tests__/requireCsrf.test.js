// Jest tests for CSRF middleware: mismatch, missing header, no cookies
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { setCsrfCookie, requireCsrf } from "../csrf.js";

function buildApp({ issueCookie = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser("test-secret"));
  if (issueCookie) app.use(setCsrfCookie);
  app.use(requireCsrf);
  app.post("/test", (req, res) => res.json({ ok: true }));
  app.get("/ping", (_req, res) => res.json({ pong: true }));
  return app;
}

describe("requireCsrf middleware", () => {
  test("returns 403 when CSRF header mismatches cookie", async () => {
    const app = buildApp({ issueCookie: true });
    const agent = request.agent(app);

    // Prime cookie via a GET (setCsrfCookie will issue if absent)
    await agent.get("/ping").expect(200);

    // Send POST with a wrong header value
    const res = await agent
      .post("/test")
      .set("x-csrf-token", "wrong-token")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "CSRF_MISMATCH" });
  });

  test("returns 403 when CSRF header is missing but cookie exists", async () => {
    const app = buildApp({ issueCookie: true });
    const agent = request.agent(app);

    // Prime cookie via a GET
    await agent.get("/ping").expect(200);

    const res = await agent.post("/test").send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "CSRF_MISMATCH" });
  });

  test("allows POST when no CSRF cookie is present (no cookies)", async () => {
    const app = buildApp({ issueCookie: false });
    // No cookie middleware issuing token; should skip CSRF and allow through
    const res = await request(app).post("/test").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

