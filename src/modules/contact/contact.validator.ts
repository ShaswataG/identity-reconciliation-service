import { body } from "express-validator";

export const contactIdentifyValidator = [
  body("email")
    .optional({ nullable: true })
    .isEmail()
    .withMessage("Invalid email format"),

  body("phoneNumber")
    .optional({ nullable: true })
    .isString()
    .withMessage("phoneNumber must be a string"),

  body()
    .custom((value) => {
      if (!value.email && !value.phoneNumber) {
        throw new Error("Either email or phoneNumber must be provided");
      }
      return true;
    })
    .withMessage("Either email or phoneNumber must be provided"),
];