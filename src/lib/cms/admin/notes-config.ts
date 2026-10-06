import type { NoteDoc } from '../validate/notes';
import { validateNoteInput } from '../validate/notes';
import type { EntityConfig } from './entity-actions';
import { NOTE_FIELDS } from './note-form';
import { getNoteBase, noteSlugTaken } from './notes';

/** Notes mutation yapılandırması. 'use server' dosyasının dışında tutulur: testler enjekte edilmiş bağımlılıklarla kullanabilsin. */
export const noteEntityConfig: EntityConfig<NoteDoc> = {
  basePath: '/admin/notes',
  fields: NOTE_FIELDS,
  rpc: { create: 'create_note', save: 'save_note_draft', publish: 'publish_note', unpublish: 'unpublish_note', discard: 'discard_note_draft' },
  validate: validateNoteInput,
  getBase: getNoteBase,
  slugTaken: noteSlugTaken,
};
