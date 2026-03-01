import { PrismaClient, Contact } from "@prisma/client";

export class ContactRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async findByEmailOrPhone(email?: string, phoneNumber?: string): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined,
        ].filter(Boolean) as any[],
      },
    });
  }

  async create(newContact: Omit<Contact, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Contact> {
    return this.prisma.contact.create({ data: newContact });
  }

  async update(contactId: number, data: Partial<Contact>): Promise<Contact> {
    return this.prisma.contact.update({
      where: { id: contactId },
      data,
    });
  }

  async findById(id: number): Promise<Contact | null> {
    return this.prisma.contact.findUnique({ where: { id } });
  }

  async findClusterByPrimary(primaryId: number): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: {
        OR: [
          { id: primaryId },
          { linkedId: primaryId },
        ],
      },
    });
  }
}