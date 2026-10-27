import { Column, Entity, ManyToOne } from '@n8n/typeorm';

import { TenantIdColumn, WithStringId } from './abstract-entity';
import type { Project } from './project';

@Entity()
export class Variables extends WithStringId {
	@TenantIdColumn()
	tenantId?: string;

	@Column('text')
	key: string;

	@Column('text', { default: 'string' })
	type: string;

	@Column('text')
	value: string;

	// If null, it's a global variable
	@ManyToOne('Project', {
		onDelete: 'CASCADE',
		nullable: true,
	})
	project: Project | null;
}
