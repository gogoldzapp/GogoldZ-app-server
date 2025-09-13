import prisma from "../config/prisma.js";

export const createTransaction = async (req, res) => {
  try {
    const { phoneNumber, type, purity, amount, weightInGrams } = req.body;
    if (
      !phoneNumber ||
      !type ||
      !purity ||
      amount == null ||
      weightInGrams == null
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const tx = await prisma.transaction.create({
      data: {
        userId: user.userId,
        type,
        purity,
        amount,
        weightInGrams,
      },
    });

    res.json({ success: true, data: tx });
  } catch (err) {
    console.error("🔥 Error in createTransaction:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const { phoneNumber, type } = req.query;
    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "phoneNumber query is required" });
    }

    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const filter = { userId: user._id };
    if (type) filter.type = type;

    const list = await prisma.transaction.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: list });
  } catch (err) {
    console.error("🔥 Error in getTransactions:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
