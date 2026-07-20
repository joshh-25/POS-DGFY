export const buildDownloadExportUseCase = ({ getTemporaryFile }) => {
    return async ({ fileId, userId }) => {
        const file = await getTemporaryFile(fileId, userId);

        if (!file) {
            return {
                success: false,
                statusCode: 404,
                message: 'Export file not found or expired'
            };
        }

        return {
            success: true,
            data: file
        };
    };
};
