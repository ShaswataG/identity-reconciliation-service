import { PrismaClient } from "@prisma/client";
import { ContactRepository } from "./contact.repository";
import { IdentifyContactResponseDto } from "./dtos/identify-contact-response.dto";

export class ContactService {
  private repo: ContactRepository;
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
    this.repo = new ContactRepository(prismaClient);
  }

  async identifyContact({
    email,
    phoneNumber,
  }: {
    email?: string;
    phoneNumber?: string;
  }): Promise<IdentifyContactResponseDto> {
    return await this.prisma.$transaction(async (tx: any) => {
      const repo = new ContactRepository(tx);

      const matches = await repo.findByEmailOrPhone(email, phoneNumber);

      if (matches.length === 0) {
        const created = await repo.create({
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          linkedId: null,
          linkPrecedence: "primary",
        });

        return {
          contact: {
            primaryContatctId: created.id,
            emails: created.email ? [created.email] : [],
            phoneNumbers: created.phoneNumber ? [created.phoneNumber] : [],
            secondaryContactIds: [],
          },
        };
      }

      const sorted = matches.sort(
        (a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const primary = sorted[0];

      const others = sorted.slice(1);
      for (const contact of others) {
        if (contact.linkPrecedence === "primary") {
          await repo.update(contact.id, {
            linkedId: primary.id,
            linkPrecedence: "secondary",
          });
        }
      }

      // insert new secondary contacts for new email/phone
      const existsEmail = matches.some((c: any) => c.email === email);
      const existsPhone = matches.some((c: any) => c.phoneNumber === phoneNumber);

      if (email && !existsEmail) {
        await repo.create({
          email,
          phoneNumber: null,
          linkedId: primary.id,
          linkPrecedence: "secondary",
        });
      }
      if (phoneNumber && !existsPhone) {
        await repo.create({
          email: null,
          phoneNumber,
          linkedId: primary.id,
          linkPrecedence: "secondary",
        });
      }

      const allCluster = await repo.findByEmailOrPhone(email, phoneNumber);

      const emailSet = new Set<string>();
      const phoneSet = new Set<string>();
      const secondaryContactIds: number[] = [];

      allCluster.forEach((contact: any) => {
        if (contact.email) emailSet.add(contact.email);
        if (contact.phoneNumber) phoneSet.add(contact.phoneNumber);

        if (contact.linkPrecedence === "secondary") {
          secondaryContactIds.push(contact.id);
        }
      });

      return {
        contact: {
          primaryContatctId: primary.id,
          emails: Array.from(emailSet),
          phoneNumbers: Array.from(phoneSet),
          secondaryContactIds,
        },
      };
    });
  }
}