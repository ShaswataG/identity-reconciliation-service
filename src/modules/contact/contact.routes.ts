import express from "express";
import { contactIdentifyValidator } from "./contact.validator.js";
import { validateRequest } from "../../core/middleware/validateRequest.js";
import { identifyContactController } from "./contact.controller.js";

const contactRouter = express.Router();

contactRouter.post(
    "/identify",
    contactIdentifyValidator,
    validateRequest,
    identifyContactController
);

export default contactRouter;