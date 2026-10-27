import { Service } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

import { Tenant } from '../entities';
import { BaseRepository } from './base-repository';
import type { OperationContext } from '../services/transaction';
import { TransactionRunner } from '../services/transaction';

class TenantTable extends BaseRepository<Tenant> {
	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		super(Tenant, dataSource.manager, transactionRunner);
	}
}

export type NewTenantRow = Pick<Tenant, 'name' | 'slug'> &
	Partial<
		Pick<
			Tenant,
			| 'id'
			| 'logoUrl'
			| 'primaryColor'
			| 'secondaryColor'
			| 'status'
			| 'plan'
			| 'maxUsers'
			| 'maxWorkflows'
			| 'maxExecutionsPerDay'
		>
	>;

@Service()
export class TenantRepository {
	private readonly table: TenantTable;

	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		this.table = new TenantTable(dataSource, transactionRunner);
	}

	async findById(id: string, ctx: OperationContext = {}): Promise<Tenant | null> {
		return await this.table.managerFor(ctx).findOneBy(Tenant, { id });
	}

	/** Slugs are stored lowercase, so the lookup lowercases its input. */
	async findBySlug(slug: string, ctx: OperationContext = {}): Promise<Tenant | null> {
		return await this.table.managerFor(ctx).findOneBy(Tenant, { slug: slug.toLowerCase() });
	}

	/** Validates the row (see `Tenant.validate`) and returns it with its generated id. */
	async create(row: NewTenantRow, ctx: OperationContext = {}): Promise<Tenant> {
		const manager = this.table.managerFor(ctx);
		return await manager.save(Tenant, manager.create(Tenant, row));
	}
}
