import type { LabDoc } from '../validate/lab';
import { validateLabInput } from '../validate/lab';
import type { EntityConfig } from './entity-actions';
import { LAB_FIELDS } from './lab-form';
import { getLabBase, labSlugTaken } from './labs';

/** Lab mutation yapılandırması (bkz. notes-config.ts). */
export const labEntityConfig: EntityConfig<LabDoc> = {
  basePath: '/admin/lab',
  fields: LAB_FIELDS,
  rpc: {
    create: 'create_lab_entry',
    save: 'save_lab_entry_draft',
    publish: 'publish_lab_entry',
    unpublish: 'unpublish_lab_entry',
    discard: 'discard_lab_entry_draft',
  },
  validate: validateLabInput,
  getBase: getLabBase,
  slugTaken: labSlugTaken,
};
