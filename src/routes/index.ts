import express from "express";
import contactRouter from "../modules/contact/contact.routes.js";

const router = express.Router();

router.use("/contact", contactRouter);

export default router;