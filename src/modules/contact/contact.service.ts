import { prisma } from "../../lib/prisma";
import { ContactRepository } from "./contact.repository";
import { IdentifyContactResponseDto } from "./dtos/identify-contact-response.dto";

export class ContactService {
  private repo: ContactRepository;
  private prisma = prisma;

  constructor() {
    this.repo = new ContactRepository(prisma);
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
          
          const secondaries = await repo.findSecondariesByLinkedId(contact.id);
          for (const sec of secondaries) {
            await repo.update(sec.id, {
              linkedId: primary.id,
            });
          }
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

      // refetch all cluster contacts using primary id
      const allCluster = await repo.findClusterByPrimary(primary.id);

      // collect unique emails, phoneNumbers, and secondaries, with primary's values first
      const emails: string[] = [];
      const phoneNumbers: string[] = [];
      const emailSet = new Set<string>();
      const phoneSet = new Set<string>();
      const secondaryContactIds: number[] = [];

      // Add primary's email and phone first if present
      if (primary.email) {
        emails.push(primary.email);
        emailSet.add(primary.email);
      }
      if (primary.phoneNumber) {
        phoneNumbers.push(primary.phoneNumber);
        phoneSet.add(primary.phoneNumber);
      }

      // Add other contacts' emails/phones if unique
      allCluster.forEach((contact: any) => {
        if (contact.id !== primary.id) {
          if (contact.email && !emailSet.has(contact.email)) {
            emails.push(contact.email);
            emailSet.add(contact.email);
          }
          if (contact.phoneNumber && !phoneSet.has(contact.phoneNumber)) {
            phoneNumbers.push(contact.phoneNumber);
            phoneSet.add(contact.phoneNumber);
          }
        }
        if (contact.linkPrecedence === "secondary") {
          secondaryContactIds.push(contact.id);
        }
      });

      return {
        contact: {
          primaryContatctId: primary.id,
          emails,
          phoneNumbers,
          secondaryContactIds,
        },
      };
    });
  }
}