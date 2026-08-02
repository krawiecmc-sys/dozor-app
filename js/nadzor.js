import { createCrudModule } from './crud-module.js';
import { NADZOR_ENTITIES, NADZOR_EXAMPLES } from './nadzor-entities.js';

const nadzorModule = createCrudModule({
  entities: NADZOR_ENTITIES,
  examples: NADZOR_EXAMPLES,
  tabsId: 'nadzor-entity-tabs',
  listId: 'nadzor-list-container',
  formId: 'nadzor-form-container',
  addBtnId: 'nadzor-add-btn',
});

export const initNadzor = nadzorModule.init;
export const refreshNadzor = nadzorModule.refresh;
export const editNadzorRecord = nadzorModule.editRecord;
