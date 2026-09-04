// Phase 257 (#1318) — lists an item's secondary category memberships only.
// The primary category (items.folder_id) is not part of this payload; see
// ADR 0080 clause 1/2.
export const buildListItemFoldersUseCase = ({ itemRepository }) => {
  return async ({ itemId }) => {
    const memberships = await itemRepository.listItemFolderMemberships([itemId]);
    return { item_id: Number.parseInt(itemId, 10), memberships };
  };
};
