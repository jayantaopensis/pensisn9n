import { Container } from '@n8n/di';
import type { EntityManager } from '@n8n/typeorm';
import { mock } from 'vitest-mock-extended';

import { Tenant } from '../../entities';
import { TypeOrmTransaction } from '../../services/typeorm-transaction';
import { mockEntityManager } from '../../utils/test-utils/mock-entity-manager';
import { TenantRepository } from '../tenant.repository';

describe('TenantRepository', () => {
	const entityManager = mockEntityManager(Tenant);
	const repository = Container.get(TenantRepository);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('finds a tenant by id', async () => {
		const tenant = Object.assign(new Tenant(), { id: 't-1' });
		entityManager.findOneBy.mockResolvedValueOnce(tenant);

		await expect(repository.findById('t-1')).resolves.toBe(tenant);
		expect(entityManager.findOneBy).toHaveBeenCalledWith(Tenant, { id: 't-1' });
	});

	it('lowercases the slug it looks up', async () => {
		entityManager.findOneBy.mockResolvedValueOnce(null);

		await expect(repository.findBySlug('Lincoln-High')).resolves.toBeNull();
		expect(entityManager.findOneBy).toHaveBeenCalledWith(Tenant, { slug: 'lincoln-high' });
	});

	it('creates a tenant in the transaction the context carries', async () => {
		const transactionManager = mock<EntityManager>();
		const created = Object.assign(new Tenant(), { name: 'Lincoln High', slug: 'lincoln-high' });
		transactionManager.create.mockReturnValueOnce(created as never);
		transactionManager.save.mockResolvedValueOnce(created as never);
		const ctx = { trx: new TypeOrmTransaction(transactionManager) };

		await expect(
			repository.create({ name: 'Lincoln High', slug: 'lincoln-high' }, ctx),
		).resolves.toBe(created);
		expect(transactionManager.create).toHaveBeenCalledWith(Tenant, {
			name: 'Lincoln High',
			slug: 'lincoln-high',
		});
		expect(transactionManager.save).toHaveBeenCalledWith(Tenant, created);
		expect(entityManager.save).not.toHaveBeenCalled();
	});
});
