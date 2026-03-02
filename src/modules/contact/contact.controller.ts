import type { Request, Response } from "express";
import { ContactService } from "./contact.service.js";
import { prisma } from "../../lib/prisma.js";

export const identifyContactController = async (
  req: Request,
  res: Response
) => {
  const contactService = new ContactService(prisma);
  
  const result = await contactService.identifyContact(req.body);

  return res.status(200).json(result);
};

