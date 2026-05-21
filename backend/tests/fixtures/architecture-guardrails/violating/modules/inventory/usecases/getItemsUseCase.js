import db from '../../../models/index.js';
import legacyItemService from '../../../services/itemService.js';

export const getItemsUseCase = () => ({ db, legacyItemService });
