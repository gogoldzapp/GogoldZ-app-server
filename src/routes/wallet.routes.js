import express from "express";
import { getBalance, depositFunds } from "../controllers/wallet.controller.js";
const router = express.Router();

// GET  /api/wallet/balance?phoneNumber=...
router.get("/balance", getBalance);

// POST /api/wallet/deposit
// Body: { phoneNumber, amount }
router.post("/deposit", depositFunds);

export default router;
