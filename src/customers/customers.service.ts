import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./customers.dto";
import { buildNetworkTree, computeNetworkLinks, MAX_NETWORK_DISPLAY_DEPTH } from "./network-tree";

type Tx = Prisma.TransactionClient;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContextService) {}

  async list(search?: string) {
    return this.prisma.customer.findMany({
      where: search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { hniProfile: { is: { hniId: { contains: search, mode: "insensitive" } } } },
      ] } : {},
      include: { hniProfile: true }, orderBy: { name: "asc" }, take: 50,
    });
  }

  async create(input: CreateCustomerDto) {
    const tenantId = this.requireTenantId();
    return this.handleUnique(async () => this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: {
        tenantId, name: input.name.trim(), phone: input.phone?.trim(), address: input.address?.trim(),
        birthDate: input.birthDate ? new Date(`${input.birthDate.slice(0, 10)}T00:00:00.000Z`) : undefined,
      } });
      if (input.hniId) {
        await tx.customerHniProfile.create({ data: {
          tenantId, customerId: customer.id, hniId: input.hniId.trim(), uplineHniId: input.uplineHniId?.trim(),
        } });
        await this.rebuildNetwork(tx, tenantId);
      }
      return tx.customer.findUnique({ where: { id: customer.id }, include: { hniProfile: true } });
    }));
  }

  async update(id: string, input: UpdateCustomerDto) {
    const existing = await this.requireCustomer(id);
    const tenantId = this.requireTenantId();
    return this.handleUnique(() => this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate ? new Date(`${input.birthDate.slice(0, 10)}T00:00:00.000Z`) : null } : {}),
      } });
      if (input.hniId !== undefined) {
        if (!input.hniId) await tx.customerHniProfile.deleteMany({ where: { customerId: id } });
        else await tx.customerHniProfile.upsert({
          where: { customerId: id },
          create: { tenantId, customerId: id, hniId: input.hniId.trim(), uplineHniId: input.uplineHniId?.trim() },
          update: { hniId: input.hniId.trim(), ...(input.uplineHniId !== undefined ? { uplineHniId: input.uplineHniId?.trim() || null } : {}) },
        });
      } else if (input.uplineHniId !== undefined && existing.hniProfile) {
        await tx.customerHniProfile.update({ where: { customerId: id }, data: { uplineHniId: input.uplineHniId?.trim() || null } });
      }
      if (input.hniId !== undefined || input.uplineHniId !== undefined) await this.rebuildNetwork(tx, tenantId);
      return tx.customer.findUnique({ where: { id }, include: { hniProfile: true } });
    }));
  }

  async profile(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id }, include: { hniProfile: true, transactions: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, invoiceNo: true, total: true, totalPv: true, createdAt: true } } },
    });
    if (!customer) throw new NotFoundException("Customer tidak ditemukan.");
    const aggregate = await this.prisma.pvLog.aggregate({ where: { customerId: id }, _sum: { pv: true } });
    return { ...customer, totalPv: Number(aggregate._sum.pv ?? 0) };
  }

  /** Rebuilds the normalized network_tree rows for the current tenant from HNI profiles. */
  async rebuildNetwork(tx: Tx, tenantId: string) {
    const profiles = await tx.customerHniProfile.findMany({ where: { tenantId }, select: { customerId: true, hniId: true, uplineHniId: true } });
    const links = computeNetworkLinks(profiles);
    await tx.networkNode.deleteMany({ where: { tenantId } });
    if (links.length) await tx.networkNode.createMany({ data: links.map((link) => ({ tenantId, ...link })), skipDuplicates: true });
    return links.length;
  }

  async network(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ConflictException("Bulan harus berformat YYYY-MM.");
    const tenantId = this.requireTenantId();
    const [year, monthNumber] = month.split("-").map(Number);
    const from = new Date(`${month}-01T00:00:00+07:00`);
    const to = new Date(Date.UTC(year, monthNumber, 1) - 7 * 60 * 60 * 1000 - 1);
    const [profileCount, nodeCount] = await Promise.all([this.prisma.customerHniProfile.count(), this.prisma.networkNode.count()]);
    if (profileCount !== nodeCount) await this.prisma.$transaction((tx) => this.rebuildNetwork(tx, tenantId));
    const [nodes, logs] = await Promise.all([
      this.prisma.networkNode.findMany({ select: {
        customerId: true, parentCustomerId: true, depth: true, externalUplineHniId: true,
        customer: { select: { name: true, hniProfile: { select: { hniId: true } } } },
      } }),
      this.prisma.pvLog.findMany({ where: { createdAt: { gte: from, lte: to }, customerId: { not: null } }, select: { customerId: true, pv: true } }),
    ]);
    const pvByCustomer = new Map<string, number>();
    for (const log of logs) if (log.customerId) pvByCustomer.set(log.customerId, (pvByCustomer.get(log.customerId) ?? 0) + Number(log.pv));
    const members = nodes.filter((node) => node.customer.hniProfile).map((node) => ({
      customerId: node.customerId, parentCustomerId: node.parentCustomerId, name: node.customer.name, hniId: node.customer.hniProfile!.hniId,
    }));
    const roots = buildNetworkTree(members, pvByCustomer);
    const memberIds = new Set(members.map((member) => member.customerId));
    const totalPv = Math.round([...pvByCustomer.entries()].filter(([id]) => memberIds.has(id)).reduce((sum, [, pv]) => sum + pv, 0) * 100) / 100;
    return {
      month, roots, memberCount: members.length, totalPv,
      maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth + 1), 0),
      displayDepthLimit: MAX_NETWORK_DISPLAY_DEPTH,
      externalUplines: [...new Set(nodes.map((node) => node.externalUplineHniId).filter((id): id is string => Boolean(id)))],
    };
  }

  async remove(id: string) {
    const existing = await this.requireCustomer(id);
    const tenantId = this.requireTenantId();
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.delete({ where: { id } });
      if (existing.hniProfile) await this.rebuildNetwork(tx, tenantId);
    });
    return { deleted: true };
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, include: { hniProfile: true } });
    if (!customer) throw new NotFoundException("Customer tidak ditemukan.");
    return customer;
  }
  private requireTenantId() {
    const id = this.tenantContext.getTenantId();
    if (!id) throw new NotFoundException("Konteks toko tidak ditemukan.");
    return id;
  }
  private async handleUnique<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("ID HNI sudah dipakai customer lain di toko ini.");
      }
      throw error;
    }
  }
}
