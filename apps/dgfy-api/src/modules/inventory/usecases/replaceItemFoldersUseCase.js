// Phase 257 (#1318) — replaces an item's secondary category memberships.
// Never touches items.folder_id (the primary category); see ADR 0080
// clause 1/2.
//
// Phase 268 fix: the destroy-then-bulkCreate pair in
// itemRepository.replaceItemFolderMemberships is only atomic when it runs
// inside one transaction — wrap it here the same way
// buildReplaceFolderModifierGroupsUseCase (fnbUseCases.js) wraps
// fnbRepository.replaceFolderModifierGroups, or a mid-failure leaves the
// item with zero secondary memberships instead of its previous set.
export const buildReplaceItemFoldersUseCase = ({ itemRepository }) => {
  return async ({ itemId, folderIds }) => {
    const transaction = await itemRepository.beginTransaction();
    try {
      const memberships = await itemRepository.replaceItemFolderMemberships(itemId, folderIds, { transaction });
      await transaction.commit();
      return { item_id: Number.parseInt(itemId, 10), memberships };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };
};
