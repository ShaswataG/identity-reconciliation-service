import { PrismaClient, Contact } from "@prisma/client";
import { ContactRepository } from "./contact.repository";

export class ContactService {
  private repo: ContactRepository;
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.repo = new ContactRepository(prismaClient);
  }

  /**
   * Business logic entry point for identity reconciliation.
   * It takes email and phone number and applies your rules to:
   *   - create a new primary contact
   *   - or identify existing cluster and make secondary
   *   - or merge clusters
   */
  async identifyContact(data: {
    email?: string;
    phoneNumber?: string;
  }): Promise<any /* we will refine this DTO next */> {
    const { email, phoneNumber } = data;

    return { email, phoneNumber };
  }
}