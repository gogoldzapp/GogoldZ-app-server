import prisma from "../config/prisma.js";

export const getBalance = async (req, res) => {
  try {
    const { phoneNumber } = req.query;
    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "phoneNumber is required" });
    }

    // Ensure user exists
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Lookup or create wallet by phoneNumber
    let wallet = await prisma.wallet.findUnique({ where: { phoneNumber } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: user.userId, phoneNumber },
      });
    }

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    console.error("🔥 Error in getBalance:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const depositFunds = async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    if (!phoneNumber || amount == null) {
      return res.status(400).json({
        success: false,
        message: "phoneNumber and amount are required",
      });
    }

    // Ensure user exists
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Lookup or create wallet by phoneNumber
    let wallet = await prisma.wallet.findUnique({ where: { phoneNumber } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: user.userId, phoneNumber },
      });
    }

    // Update balance
    wallet.balance += Number(amount);
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: wallet.balance },
    });

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    console.error("🔥 Error in depositFunds:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
