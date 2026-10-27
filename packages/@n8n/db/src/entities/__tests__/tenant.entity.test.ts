import { getMetadataArgsStorage } from '@n8n/typeorm';

import { TENANT_OWNED_TABLES } from '../../tenant-constants';
import { CredentialsEntity } from '../credentials-entity';
import { ExecutionEntity } from '../execution-entity';
import { Folder } from '../folder';
import { Project } from '../project';
import { ProjectRelation } from '../project-relation';
import { SharedCredentials } from '../shared-credentials';
import { SharedWorkflow } from '../shared-workflow';
import { TagEntity } from '../tag-entity';
import { Tenant } from '../tenant';
import { User } from '../user';
import { Variables } from '../variables';
import { WebhookEntity } from '../webhook-entity';
import { WorkflowEntity } from '../workflow-entity';

describe('Tenant Entity', () => {
	const createTenant = (overrides: Partial<Tenant> = {}) =>
		Object.assign(new Tenant(), { name: 'Lincoln High', slug: 'lincoln-high' }, overrides);

	describe('generateId', () => {
		it('generates a uuid when none is set', () => {
			const tenant = createTenant();
			tenant.generateId();
			expect(tenant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		});

		it('keeps an id that is already set', () => {
			const tenant = createTenant({ id: '00000000-0000-4000-8000-000000000123' });
			tenant.generateId();
			expect(tenant.id).toBe('00000000-0000-4000-8000-000000000123');
		});
	});

	describe('validate', () => {
		it('accepts a complete, valid tenant', () => {
			const tenant = createTenant({
				primaryColor: '#EE1726',
				secondaryColor: '#000000',
				status: 'suspended',
				maxUsers: 0,
				maxWorkflows: 100,
				maxExecutionsPerDay: null,
			});
			expect(() => tenant.validate()).not.toThrow();
		});

		it('accepts a partial update that leaves fields unset', () => {
			const tenant = Object.assign(new Tenant(), { name: 'Renamed' });
			expect(() => tenant.validate()).not.toThrow();
		});

		it.each(['', 'Lincoln', 'lincoln_high', '-lincoln', 'lincoln-', 'a'.repeat(64), 'école'])(
			'rejects slug <%s>',
			(slug) => {
				expect(() => createTenant({ slug }).validate()).toThrow('not a valid DNS label');
			},
		);

		it.each(['a', '0', 'lincoln-high-2', 'a'.repeat(63)])('accepts slug <%s>', (slug) => {
			expect(() => createTenant({ slug }).validate()).not.toThrow();
		});

		it('rejects an unknown status', () => {
			const tenant = createTenant({ status: 'deleted' as Tenant['status'] });
			expect(() => tenant.validate()).toThrow('unknown status');
		});

		it.each(['red', '#fff', '#EE172', '#EE17266', 'EE1726'])('rejects color <%s>', (color) => {
			expect(() => createTenant({ primaryColor: color }).validate()).toThrow('#rrggbb');
			expect(() => createTenant({ secondaryColor: color }).validate()).toThrow('#rrggbb');
		});

		it.each([-1, 1.5, Number.NaN])('rejects limit <%s>', (limit) => {
			expect(() => createTenant({ maxUsers: limit }).validate()).toThrow('non-negative integer');
			expect(() => createTenant({ maxWorkflows: limit }).validate()).toThrow('non-negative integer');
			expect(() => createTenant({ maxExecutionsPerDay: limit }).validate()).toThrow(
				'non-negative integer',
			);
		});
	});
});

describe('tenantId column', () => {
	const ownedEntities = [
		User,
		Project,
		ProjectRelation,
		WorkflowEntity,
		SharedWorkflow,
		CredentialsEntity,
		SharedCredentials,
		ExecutionEntity,
		WebhookEntity,
		Variables,
		TagEntity,
		Folder,
	];

	it('covers one entity per tenant-owned table', () => {
		expect(ownedEntities).toHaveLength(TENANT_OWNED_TABLES.length);
	});

	it.each(ownedEntities.map((entity) => [entity.name, entity]))(
		'%s maps tenantId as a database-managed column',
		(_name, entity) => {
			const column = getMetadataArgsStorage().columns.find(
				(c) => c.target === entity && c.propertyName === 'tenantId',
			);

			// Single-tenant code never reads or writes the column: the database
			// default assigns the default tenant, and an update can never move a
			// row to another tenant.
			expect(column?.options).toMatchObject({
				type: 'uuid',
				select: false,
				insert: false,
				update: false,
			});
		},
	);
});
