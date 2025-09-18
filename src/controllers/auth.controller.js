import { sendOtpService, verifyOtpService } from "../services/authService.js";

// just delegate — don't send a second response
export const sendOtp = (req, res, next) => sendOtpService(req, res, next);
export const verifyOtp = (req, res, next) => verifyOtpService(req, res, next);


// export const updatePassword = async (req, res) => {
//   try {
//     const { userId, newPassword } = req.body;
//     const response = await updatePasswordService(req, userId, newPassword);
//     res.status(200).json(response);
//   } catch (error) {
//     console.error("Error in updatePassword:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };
