/**
 * The tenant that owns every row created before multi-tenancy, and every row
 * created while it is off. Each tenant-owned table defaults `tenantId` to this
 * id, so single-tenant code paths never have to set it.
 *
 * The migration `AddTenants1793120000000` hardcodes the same value, because a
 * migration must not change when this file does. A test keeps the two equal.
 */
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export const DEFAULT_TENANT_SLUG = 'default';

export const TENANT_STATUSES = ['active', 'suspended'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * A slug is the tenant's subdomain, so it must be a single DNS label:
 * lowercase letters, digits and inner hyphens, at most 63 characters.
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Brand colors are stored as `#rrggbb`. */
export const TENANT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Tables whose rows belong to exactly one tenant. Each has a non-null,
 * indexed `tenantId` column.
 */
export const TENANT_OWNED_TABLES = [
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
] as const;
