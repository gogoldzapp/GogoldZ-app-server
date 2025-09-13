import Joi from "joi";

const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(3).max(100).optional(),
  dob: Joi.date().less("now").optional(),
  gender: Joi.string().valid("male", "female").optional(),
  addressLine1: Joi.string().min(3).max(100).optional(),
  addressLine2: Joi.string().max(100).optional(),
  city: Joi.string().min(3).max(100).optional(),
  state: Joi.string().min(3).max(100).optional(),
  postalCode: Joi.string().length(6).optional(),
  country: Joi.string().min(2).max(100).optional(),
});

export default updateProfileSchema;
