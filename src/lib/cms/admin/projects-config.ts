import type { ProjectDoc } from '../validate/projects';
import { validateProjectInput } from '../validate/projects';
import type { EntityConfig } from './entity-actions';
import { PROJECT_FIELDS } from './project-form';
import { getProjectBase, projectSlugTaken } from './projects';

/** Projects mutation yapılandırması: Notes/Lab ile AYNI çekirdek (createEntityOps). 'use server' dosyasının dışında (testler enjekte eder). */
export const projectEntityConfig: EntityConfig<ProjectDoc> = {
  basePath: '/admin/projects',
  fields: PROJECT_FIELDS,
  rpc: { create: 'create_project', save: 'save_project_draft', publish: 'publish_project', unpublish: 'unpublish_project', discard: 'discard_project_draft' },
  validate: validateProjectInput,
  getBase: getProjectBase,
  slugTaken: projectSlugTaken,
};
