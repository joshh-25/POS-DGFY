/**
 * User repository contract for modular backend use-cases.
 *
 * Expected shape:
 * - findById(userId)
 * - findByEmail(email)
 * - updateById(userId, patch)
 */
export const UserRepositoryContract = Object.freeze([
    'findById',
    'findByEmail',
    'updateById'
]);

export const assertUserRepositoryContract = (repository) => {
    UserRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`UserRepository missing required method: ${method}`);
        }
    });
};
