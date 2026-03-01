import { Request, Response } from "express";
import { ContactService } from "./contact.service";

export const identifyContactController = async (
  req: Request,
  res: Response
) => {
  const contactService = new ContactService();
  
  const result = await contactService.identifyContact(req.body);

  return res.success(result, "Contact identified");
};

