import { PrismaClient } from "@prisma/client";
import { ContactRepository } from "./contact.repository";

export class ContactService {
  private repo: ContactRepository;
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.repo = new ContactRepository(prismaClient);
  }

  /**
   * Performs identity reconciliation.
   */
  async identifyContact({
    email,
    phoneNumber,
  }: {
    email?: string;
    phoneNumber?: string;
  }) {
    return await this.prisma.$transaction(async (tx: any) => {
      const repo = new ContactRepository(tx);

      const matches = await repo.findByEmailOrPhone(email, phoneNumber);

      if (matches.length === 0) {
        const created = await repo.create({
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          linkedId: null,
          linkPrecedence: "primary",
        });

        return {
          primaryContactId: created.id,
          emails: created.emails,
          phoneNumbers: created.phoneNumbers,
          secondaryContactIds: [],
        };
      }

      const primaries = matches.filter(
        (c: any) => c.linkPrecedence === "primary"
      );

      const sorted = matches.sort(
        (a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const survivingPrimary = sorted[0];

      const others = sorted.slice(1);
      for (const contact of others) {
        if (contact.linkPrecedence === "primary") {
          await repo.update(contact.id, {
            linkedId: survivingPrimary.id,
            linkPrecedence: "secondary",
          });
        }
      }

      const existsEmail = matches.some((c: any) => c.email === email);
      const existsPhone = matches.some((c: any) => c.phoneNumber === phoneNumber);

      if (email && !existsEmail) {
        await repo.create({
          email,
          phoneNumber: null,
          linkedId: survivingPrimary.id,
          linkPrecedence: "secondary",
        });
      }

      if (phoneNumber && !existsPhone) {
        await repo.create({
          email: null,
          phoneNumber,
          linkedId: survivingPrimary.id,
          linkPrecedence: "secondary",
        });
      }

      const allContacts = await repo.findByEmailOrPhone(email, phoneNumber);

      return {
        primaryContactId: survivingPrimary.id,
        emails: survivingPrimary.emails,
        phoneNumbers: survivingPrimary.phoneNumber,
        secondaryContactIds: allContacts
          .filter((c: any) => c.linkPrecedence === "secondary")
          .map((c: any) => c.id),
      };
    });
  }
}