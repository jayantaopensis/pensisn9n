import { BeforeInsert, BeforeUpdate, Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import { randomUUID } from 'node:crypto';

import { WithTimestamps } from './abstract-entity';
import {
	TENANT_COLOR_PATTERN,
	TENANT_SLUG_PATTERN,
	TENANT_STATUSES,
	type TenantStatus,
} from '../tenant-constants';

/**
 * A school. Every tenant-owned row (see `TENANT_OWNED_TABLES`) points at
 * exactly one tenant through its `tenantId` column.
 *
 * A `null` limit means unlimited. A `null` logo or color means the openSIS
 * default branding.
 */
@Entity()
export class Tenant extends WithTimestamps {
	@PrimaryColumn('uuid')
	id: string;

	@Column({ length: 128 })
	name: string;

	/** The tenant's subdomain, e.g. `lincoln-high` in `lincoln-high.example.org`. */
	@Column({ length: 63 })
	@Index({ unique: true })
	slug: string;

	@Column({ type: 'varchar', length: 1024, nullable: true })
	logoUrl: string | null;

	@Column({ type: 'varchar', length: 7, nullable: true })
	primaryColor: string | null;

	@Column({ type: 'varchar', length: 7, nullable: true })
	secondaryColor: string | null;

	@Column({ type: 'varchar', length: 16, default: 'active' })
	status: TenantStatus;

	@Column({ length: 32, default: 'default' })
	plan: string;

	@Column({ type: 'int', nullable: true })
	maxUsers: number | null;

	@Column({ type: 'int', nullable: true })
	maxWorkflows: number | null;

	@Column({ type: 'int', nullable: true })
	maxExecutionsPerDay: number | null;

	@BeforeInsert()
	generateId(): void {
		if (!this.id) {
			this.id = randomUUID();
		}
	}

	@BeforeInsert()
	@BeforeUpdate()
	validate(): void {
		if (this.slug !== undefined && !TENANT_SLUG_PATTERN.test(this.slug)) {
			throw new Error(`Cannot save tenant: slug <${this.slug}> is not a valid DNS label`);
		}

		if (this.status !== undefined && !TENANT_STATUSES.includes(this.status)) {
			throw new Error(`Cannot save tenant: unknown status <${String(this.status)}>`);
		}

		for (const color of [this.primaryColor, this.secondaryColor]) {
			if (color && !TENANT_COLOR_PATTERN.test(color)) {
				throw new Error(`Cannot save tenant: color <${color}> is not #rrggbb`);
			}
		}

		for (const limit of [this.maxUsers, this.maxWorkflows, this.maxExecutionsPerDay]) {
			if (limit !== null && limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
				throw new Error(`Cannot save tenant: limit <${limit}> must be a non-negative integer`);
			}
		}
	}
}
