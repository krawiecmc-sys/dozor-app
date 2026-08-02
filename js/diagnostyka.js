import { createCrudModule } from './crud-module.js';
import { DIAGNOSTYKA_ENTITIES, DIAGNOSTYKA_EXAMPLES } from './diagnostyka-entities.js';

const diagnostykaModule = createCrudModule({
  entities: DIAGNOSTYKA_ENTITIES,
  examples: DIAGNOSTYKA_EXAMPLES,
  tabsId: 'diagnostyka-entity-tabs',
  listId: 'diagnostyka-list-container',
  formId: 'diagnostyka-form-container',
  addBtnId: 'diagnostyka-add-btn',
});

export const initDiagnostyka = diagnostykaModule.init;
export const refreshDiagnostyka = diagnostykaModule.refresh;
