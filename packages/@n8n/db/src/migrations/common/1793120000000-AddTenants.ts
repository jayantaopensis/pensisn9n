import type { MigrationContext, ReversibleMigration } from '../migration-types';

/** Same value as `DEFAULT_TENANT_ID`. Hardcoded, so the migration never changes. */
const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

/** Same tables as `TENANT_OWNED_TABLES`, frozen at the time of this migration. */
const TENANT_OWNED_TABLES = [
	'user',
	'project',
	'project_relation',
	'workflow_entity',
	'shared_workflow',
	'credentials_entity',
	'shared_credentials',
	'execution_entity',
	'webhook_entity',
	'variables',
	'tag_entity',
	'folder',
];

/**
 * Adds the `tenant` table (one row per school), creates the default tenant,
 * and gives every tenant-owned table a non-null, indexed `tenantId`.
 *
 * Each `tenantId` defaults to the default tenant. That assigns every existing
 * row to it, and lets single-tenant code keep inserting rows without knowing
 * about tenants.
 *
 * The columns are added with raw `ALTER TABLE ADD COLUMN`, so SQLite never
 * rebuilds these tables (see `AddKindToUserTable1792742505679` for why a
 * rebuild of `user` is dangerous).
 *
 * Only PostgreSQL gets the foreign key to `tenant`. SQLite refuses to add a
 * column with a REFERENCES clause and a non-null default while foreign keys
 * are on, and refuses to drop a column a foreign key names, so `down` would
 * need a rebuild. Multi-tenant mode requires PostgreSQL; on SQLite only the
 * default tenant exists. The key is `NOT VALID` to skip a scan of existing
 * rows: they all hold the default tenant, which exists.
 */
export class AddTenants1793120000000 implements ReversibleMigration {
	async up(ctx: MigrationContext) {
		const {
			schemaBuilder: { createTable, column, createIndex },
			escape,
			runQuery,
			isPostgres,
		} = ctx;

		await createTable('tenant')
			.withColumns(
				column('id').uuid.primary.notNull,
				column('name').varchar(128).notNull,
				column('slug').varchar(63).notNull.comment('Subdomain of the tenant, a single DNS label'),
				column('logoUrl').varchar(1024),
				column('primaryColor').varchar(7),
				column('secondaryColor').varchar(7),
				column('status')
					.varchar(16)
					.notNull.default("'active'")
					.withEnumCheck(['active', 'suspended']),
				column('plan').varchar(32).notNull.default("'default'"),
				column('maxUsers').int.comment('NULL means unlimited'),
				column('maxWorkflows').int.comment('NULL means unlimited'),
				column('maxExecutionsPerDay').int.comment('NULL means unlimited'),
			)
			.withTimestamps.withIndexOn('slug', true);

		await runQuery(
			`INSERT INTO ${escape.tableName('tenant')}
				(id, name, slug, ${escape.columnName('primaryColor')}, ${escape.columnName('secondaryColor')})
			VALUES (:id, :name, :slug, :primaryColor, :secondaryColor)`,
			{
				id: DEFAULT_TENANT_ID,
				name: 'openSIS',
				slug: 'default',
				primaryColor: '#EE1726',
				secondaryColor: '#000000',
			},
		);

		const tenantId = escape.columnName('tenantId');
		const columnType = isPostgres ? 'UUID' : 'VARCHAR(36)';

		for (const tableName of TENANT_OWNED_TABLES) {
			const table = escape.tableName(tableName);

			await runQuery(
				`ALTER TABLE ${table} ADD COLUMN ${tenantId} ${columnType} NOT NULL DEFAULT '${DEFAULT_TENANT_ID}'`,
			);

			if (isPostgres) {
				await runQuery(
					`ALTER TABLE ${table} ADD CONSTRAINT ${this.foreignKeyName(ctx, tableName)}
					FOREIGN KEY (${tenantId}) REFERENCES ${escape.tableName('tenant')} (id) NOT VALID`,
				);
				await runQuery(
					`COMMENT ON COLUMN ${table}.${tenantId} IS 'Tenant (school) owning this row'`,
				);
			}

			await createIndex(tableName, ['tenantId']);
		}
	}

	/**
	 * Drops every `tenantId` and the `tenant` table. Rows of all tenants stay,
	 * so a database that held several tenants merges into one instance.
	 */
	async down(ctx: MigrationContext) {
		const {
			schemaBuilder: { dropIndex, dropTable },
			escape,
			runQuery,
			isPostgres,
		} = ctx;
		const tenantId = escape.columnName('tenantId');

		for (const tableName of [...TENANT_OWNED_TABLES].reverse()) {
			const table = escape.tableName(tableName);

			// SQLite refuses to drop an indexed column.
			await dropIndex(tableName, ['tenantId']);
			if (isPostgres) {
				await runQuery(
					`ALTER TABLE ${table} DROP CONSTRAINT ${this.foreignKeyName(ctx, tableName)}`,
				);
			}
			await runQuery(`ALTER TABLE ${table} DROP COLUMN ${tenantId}`);
		}

		await dropTable('tenant');
	}

	private foreignKeyName({ escape, tablePrefix }: MigrationContext, tableName: string) {
		return escape.columnName(`FK_${tablePrefix}${tableName}_tenantId`);
	}
}
