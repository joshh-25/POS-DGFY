export const buildGetItemsUseCase = ({ itemRepository, resolveLocationScope = null }) => {
    return async ({ query = {}, user = null }) => {
        // #682: only resolve+grant-check a location when one is actually requested. Calling
        // resolveLocationScope unconditionally would reject the (correct, default) omitted case
        // with a 422 once multi-location inventory is enabled with more than one active location
        // -- that's the right behavior for a stock-mutating command, but wrong for this read
        // default, where omitted must mean "tenant-wide aggregate", not an error.
        if (query?.location_id && typeof resolveLocationScope === 'function') {
            await resolveLocationScope({
                requestedLocationId: query.location_id,
                userId: user?.user_id,
                operationLabel: 'Items list read'
            });
        }
        return itemRepository.getItems(query);
    };
};
