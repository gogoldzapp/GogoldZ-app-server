import express from "express";
import {
  createTransaction,
  getTransactions,
} from "../controllers/transaction.controller.js";

const router = express.Router();

router.post("/createTransaction", createTransaction);
router.get("/getTransactions", getTransactions);

export default router;
