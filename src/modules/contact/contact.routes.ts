import express from "express";
import { contactIdentifyValidator } from "./contact.validator.js";
import { validateRequest } from "../../core/middleware/validateRequest.js";
import { identifyContactController } from "./contact.controller.js";

const contactRouter = express.Router();

/**
 * @openapi
 * /contacts/identify:
 *   post:
 *     summary: Identify or create a contact
 *     tags:
 *       - Contact
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "test@example.com"
 *               phoneNumber:
 *                 type: string
 *                 example: "1234567890"
 *     responses:
 *       "200":
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/IdentifyContactResponse"
 */
contactRouter.post(
    "/identify",
    contactIdentifyValidator,
    validateRequest,
    identifyContactController
);

export default contactRouter;