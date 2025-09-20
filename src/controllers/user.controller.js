import {
  setEmailService,
  verifyEmailService,
  getUserProfileService,
  updateUserProfileService,
  uploadProfilePictureService,
  submitKYCService,
} from "../services/user.service.js";

export const setEmail = async (req, res) => {
  try {
    const { phoneNumber, email } = req.body;
    const result = await setEmailService(req, phoneNumber, email);
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { phoneNumber, token } = req.query;
    const result = await verifyEmailService(req, phoneNumber, token);
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserProfile = async (req, res) => {
  console.log("Fetching user profile...", req.user);
  try {
    const result = await getUserProfileService(req.user?.userId);
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const result = await updateUserProfileService(
      req,
      req.user?.userId,
      req.body
    );
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({
      success: true,
      message: "Profile updated successfully",
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const uploadProfilePicture = async (req, res) => {
  try {
    const result = await uploadProfilePictureService(
      req,
      req.user.userId,
      req.file
    );
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const submitKYC = async (req, res) => {
  try {
    const result = await submitKYCService(
      req,
      req.user.userId,
      req.body.panNumber
    );
    if (result.error)
      return res
        .status(result.status)
        .json({ success: false, message: result.error });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
