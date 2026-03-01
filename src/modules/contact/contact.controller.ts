import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ContactService } from "./contact.service";

const prisma = new PrismaClient();

export const identifyContactController = async (
  req: Request,
  res: Response
) => {
  const contactService = new ContactService(prisma);
  
  const result = await contactService.identifyContact(req.body);

  return res.success(result, "Contact identified");
};

