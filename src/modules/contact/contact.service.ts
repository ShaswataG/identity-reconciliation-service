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
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          linkedId: null,
          linkPrecedence: "primary",
        });

        return {
          contact: {
            primaryContatctId: created.id,
            emails: created.emails,
            phoneNumbers: created.phoneNumbers,
            secondaryContactIds: [],
          },
        };
      }

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

      const existsEmail = matches.some((c: any) =>
        c.emails?.includes(email ?? "")
      );
      const existsPhone = matches.some((c: any) =>
        c.phoneNumbers?.includes(phoneNumber ?? "")
      );

      if (email && !existsEmail) {
        await repo.create({
          emails: [email],
          phoneNumbers: [],
          linkedId: survivingPrimary.id,
          linkPrecedence: "secondary",
        });
      }

      if (phoneNumber && !existsPhone) {
        await repo.create({
          emails: [],
          phoneNumbers: [phoneNumber],
          linkedId: survivingPrimary.id,
          linkPrecedence: "secondary",
        });
      }

      const allContacts = await repo.findByEmailOrPhone(email, phoneNumber);

      const emailSet = new Set<string>();
      const phoneSet = new Set<string>();
      const secondaryContactIds: number[] = [];

      if (survivingPrimary.emails?.length) {
        survivingPrimary.emails.forEach((e: any) => emailSet.add(e));
      }
      if (survivingPrimary.phoneNumbers?.length) {
        survivingPrimary.phoneNumbers.forEach((p: any) => phoneSet.add(p));
      }

      const secondaryContacts = allContacts.filter(
        (c: any) => c.linkPrecedence === "secondary"
      );

      secondaryContacts.forEach((sec: any) => {
        sec.emails?.forEach((e: string) => emailSet.add(e));
        sec.phoneNumbers?.forEach((p: string) => phoneSet.add(p));
        secondaryContactIds.push(sec.id);
      });

      return {
        contact: {
          primaryContatctId: survivingPrimary.id,
          emails: Array.from(emailSet),
          phoneNumbers: Array.from(phoneSet),
          secondaryContactIds,
        },
      };
    });
  }
}