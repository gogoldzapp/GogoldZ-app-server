"use strict";
import Joi from "joi";

/**
 * Wraps a Joi schema to validate req.body (or req.query, params).
 * @param {Joi.Schema} schema
 * @param {string} source — 'body' | 'query' | 'params'
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      // collect all details
      const details = error.details.map((d) => d.message).join(", ");
      return res
        .status(400)
        .json({ success: false, message: `Validation error: ${details}` });
    }
    // replace req[source] with the validated & sanitized value
    req[source] = value;
    next();
  };
};

export default validate;
