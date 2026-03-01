import { body } from "express-validator";

export const contactIdentifyValidator = [
  body("email")
    .optional({ nullable: true })
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Invalid email format"),

  body("phoneNumber")
    .optional({ nullable: true })
    .trim()
    .isMobilePhone("any")
    .withMessage("Invalid phone number"),

  body()
    .custom((value) => {
      if (!value.email && !value.phoneNumber) {
        throw new Error("Either email or phoneNumber must be provided");
      }
      return true;
    })
    .withMessage("Either email or phoneNumber must be provided"),
];