import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
	type TestMigrationContext,
} from '@n8n/backend-test-utils';
import { DbConnection, DEFAULT_TENANT_ID, TENANT_OWNED_TABLES } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource, TableCheck } from '@n8n/typeorm';
import { v7 as uuidv7 } from 'uuid';

const MIGRATION_NAME = 'AddTenants1793120000000';

type TenantRow = {
	id: string;
	name: string;
	slug: string;
	status: string;
	plan: string;
	primaryColor: string | null;
	secondaryColor: string | null;
	maxUsers: number | null;
};

describe('AddTenants Migration', () => {
	let dataSource: DataSource;
	let context: TestMigrationContext;
	const existingUserId = uuidv7();
	const existingProjectId = uuidv7().slice(0, 16);
	const existingTagId = uuidv7().slice(0, 16);
	const existingVariableId = uuidv7().slice(0, 16);

	beforeAll(async () => {
		const dbConnection = Container.get(DbConnection);
		await dbConnection.init();
		dataSource = Container.get(DataSource);

		const setup = createTestMigrationContext(dataSource);
		await setup.queryRunner.clearDatabase();
		await setup.queryRunner.release();

		await initDbUpToMigration(MIGRATION_NAME);

		context = createTestMigrationContext(dataSource);
		await context.runQuery(
			`INSERT INTO ${table('user')} (id, ${column('roleSlug')}) VALUES (:id, :roleSlug)`,
			{ id: existingUserId, roleSlug: 'global:member' },
		);
		await context.runQuery(
			`INSERT INTO ${table('project')} (id, name, type) VALUES (:id, :name, :type)`,
			{ id: existingProjectId, name: 'Acme', type: 'team' },
		);
		await context.runQuery(
			`INSERT INTO ${table('project_relation')} (${column('projectId')}, ${column('userId')}, role) VALUES (:projectId, :userId, :role)`,
			{ projectId: existingProjectId, userId: existingUserId, role: 'project:editor' },
		);
		await context.runQuery(`INSERT INTO ${table('tag_entity')} (id, name) VALUES (:id, :name)`, {
			id: existingTagId,
			name: 'attendance',
		});
		await context.runQuery(
			`INSERT INTO ${table('variables')} (id, key, value) VALUES (:id, :key, :value)`,
			{ id: existingVariableId, key: 'SCHOOL_YEAR', value: '2026' },
		);
		// Release the connection: on SQLite the migration waits for its write lock.
		await context.queryRunner.release();

		await runSingleMigration(MIGRATION_NAME);
	});

	beforeEach(() => {
		context = createTestMigrationContext(dataSource);
	});

	afterEach(async () => {
		await context.queryRunner.release();
	});

	afterAll(async () => {
		await Container.get(DbConnection).close();
	});

	function table(name: string) {
		return context.escape.tableName(name);
	}

	function column(name: string) {
		return context.escape.columnName(name);
	}

	async function selectTenants(): Promise<TenantRow[]> {
		return await context.runQuery<TenantRow[]>(`SELECT * FROM ${table('tenant')} ORDER BY slug`);
	}

	async function tenantIdOf(tableName: string, id: string, idColumn = 'id') {
		const [row] = await context.runQuery<Array<{ tenantId: string }>>(
			`SELECT ${column('tenantId')} AS ${column('tenantId')} FROM ${table(tableName)} WHERE ${column(idColumn)} = :id`,
			{ id },
		);
		return row?.tenantId;
	}

	async function insertTenant(id: string, slug: string) {
		await context.runQuery(
			`INSERT INTO ${table('tenant')} (id, name, slug) VALUES (:id, :name, :slug)`,
			{ id, name: slug, slug },
		);
	}

	it('creates the default tenant with the openSIS brand colors', async () => {
		expect(await selectTenants()).toEqual([
			expect.objectContaining({
				id: DEFAULT_TENANT_ID,
				name: 'openSIS',
				slug: 'default',
				status: 'active',
				plan: 'default',
				primaryColor: '#EE1726',
				secondaryColor: '#000000',
				maxUsers: null,
			}),
		]);
	});

	it('assigns every existing row to the default tenant', async () => {
		expect(await tenantIdOf('user', existingUserId)).toBe(DEFAULT_TENANT_ID);
		expect(await tenantIdOf('project', existingProjectId)).toBe(DEFAULT_TENANT_ID);
		expect(await tenantIdOf('project_relation', existingUserId, 'userId')).toBe(DEFAULT_TENANT_ID);
		expect(await tenantIdOf('tag_entity', existingTagId)).toBe(DEFAULT_TENANT_ID);
		expect(await tenantIdOf('variables', existingVariableId)).toBe(DEFAULT_TENANT_ID);
	});

	it.each([...TENANT_OWNED_TABLES])('gives %s a non-null, indexed tenantId', async (tableName) => {
		const schema = await context.queryRunner.getTable(`${context.tablePrefix}${tableName}`);

		const tenantIdColumn = schema?.findColumnByName('tenantId');
		expect(tenantIdColumn).toBeDefined();
		expect(tenantIdColumn?.isNullable).toBe(false);
		expect(tenantIdColumn?.default).toContain(DEFAULT_TENANT_ID);
		expect(
			schema?.indices.some(
				(index) => index.columnNames.length === 1 && index.columnNames[0] === 'tenantId',
			),
		).toBe(true);
	});

	it('assigns new rows that name no tenant to the default tenant', async () => {
		const tagId = uuidv7().slice(0, 16);
		await context.runQuery(`INSERT INTO ${table('tag_entity')} (id, name) VALUES (:id, :name)`, {
			id: tagId,
			name: 'grades',
		});

		expect(await tenantIdOf('tag_entity', tagId)).toBe(DEFAULT_TENANT_ID);
	});

	it('stores rows of another tenant', async () => {
		const tenantId = uuidv7();
		const tagId = uuidv7().slice(0, 16);
		await insertTenant(tenantId, 'lincoln-high');
		await context.runQuery(
			`INSERT INTO ${table('tag_entity')} (id, name, ${column('tenantId')}) VALUES (:id, :name, :tenantId)`,
			{ id: tagId, name: 'lincoln-tag', tenantId },
		);

		expect(await tenantIdOf('tag_entity', tagId)).toBe(tenantId);
	});

	it('rejects a duplicate slug', async () => {
		await expect(insertTenant(uuidv7(), 'default')).rejects.toThrow();
	});

	it('rejects an unknown status', async () => {
		await expect(
			context.runQuery(
				`INSERT INTO ${table('tenant')} (id, name, slug, status) VALUES (:id, :name, :slug, :status)`,
				{ id: uuidv7(), name: 'x', slug: 'unknown-status', status: 'deleted' },
			),
		).rejects.toThrow();
	});

	it('rejects a row of a tenant that does not exist on PostgreSQL', async () => {
		// SQLite has no foreign key to `tenant`. The migration docblock explains why.
		if (context.isSqlite) return;

		await expect(
			context.runQuery(
				`INSERT INTO ${table('tag_entity')} (id, name, ${column('tenantId')}) VALUES (:id, :name, :tenantId)`,
				{ id: uuidv7().slice(0, 16), name: 'orphan', tenantId: uuidv7() },
			),
		).rejects.toThrow();
	});

	/**
	 * A later migration can rebuild a table on SQLite. `down` must still be able
	 * to drop `tenantId` after that.
	 */
	async function rebuildTagTable() {
		const tagTable = `${context.tablePrefix}tag_entity`;
		await context.runQuery('PRAGMA foreign_keys=OFF');
		await context.queryRunner.getTable(tagTable);
		await context.queryRunner.createCheckConstraint(
			tagTable,
			new TableCheck({ name: 'CHK_test_rebuild', expression: `length(${column('name')}) > 0` }),
		);
		await context.runQuery('PRAGMA foreign_keys=ON');
	}

	// Runs last: it reverts the migration.
	it('down drops tenantId and the tenant table, and keeps every row', async () => {
		const [{ count: tagsBefore }] = await context.runQuery<Array<{ count: number | string }>>(
			`SELECT COUNT(*) AS count FROM ${table('tag_entity')}`,
		);
		if (context.isSqlite) await rebuildTagTable();
		await context.queryRunner.release();

		await undoLastSingleMigration();

		context = createTestMigrationContext(dataSource);
		expect(await context.queryRunner.hasTable(`${context.tablePrefix}tenant`)).toBe(false);
		for (const tableName of TENANT_OWNED_TABLES) {
			const schema = await context.queryRunner.getTable(`${context.tablePrefix}${tableName}`);
			expect(schema?.findColumnByName('tenantId')).toBeUndefined();
		}

		const [{ count: tagsAfter }] = await context.runQuery<Array<{ count: number | string }>>(
			`SELECT COUNT(*) AS count FROM ${table('tag_entity')}`,
		);
		expect(Number(tagsAfter)).toBe(Number(tagsBefore));
		const [user] = await context.runQuery<Array<{ id: string }>>(
			`SELECT id FROM ${table('user')} WHERE id = :id`,
			{ id: existingUserId },
		);
		expect(user?.id).toBe(existingUserId);
	});
});
