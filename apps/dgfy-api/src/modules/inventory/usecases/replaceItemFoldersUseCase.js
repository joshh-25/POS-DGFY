// Phase 257 (#1318) — replaces an item's secondary category memberships.
// Never touches items.folder_id (the primary category); see ADR 0080
// clause 1/2.
export const buildReplaceItemFoldersUseCase = ({ itemRepository }) => {
  return async ({ itemId, folderIds }) => {
    const memberships = await itemRepository.replaceItemFolderMemberships(itemId, folderIds);
    return { item_id: Number.parseInt(itemId, 10), memberships };
  };
};
