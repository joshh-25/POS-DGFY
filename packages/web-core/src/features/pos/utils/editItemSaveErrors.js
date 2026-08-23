const EDIT_ITEM_SAVE_STAGE_MESSAGES = Object.freeze({
  item_details: 'Item details could not be saved.',
  pos_catalog: 'Item details were saved, but the POS availability settings could not be saved.',
  barcode: 'Item details were saved, but the barcode could not be saved.',
  storefront_images: 'Item details were saved, but the product image could not be processed or saved.',
  refresh: 'Item was saved, but the item list could not refresh. Reopen Items to verify the changes.'
});

const readResponseData = (error) => error?.response?.data || {};

export const getApiErrorRequestId = (error) => (
  readResponseData(error)?.request_id
  || error?.response?.headers?.['x-request-id']
  || error?.response?.headers?.['X-Request-Id']
  || null
);

export const resolveEditItemSaveError = (error, stage = 'item_details') => {
  const responseData = readResponseData(error);
  const status = Number(error?.response?.status || 0);
  const requestId = getApiErrorRequestId(error);
  const serverMessage = typeof responseData.message === 'string'
    ? responseData.message.trim()
    : '';
  const isTimeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
  const stageMessage = EDIT_ITEM_SAVE_STAGE_MESSAGES[stage] || EDIT_ITEM_SAVE_STAGE_MESSAGES.item_details;
  const message = stage === 'storefront_images' && isTimeout
    ? 'The product image upload did not finish before the server response timed out. Check the item before trying again.'
    : serverMessage || stageMessage;
  const reference = requestId ? ` Reference: ${requestId}.` : '';

  return {
    message: `${message.replace(/[.!?]+$/, '')}.${reference}`,
    code: responseData.error_code || responseData.code || null,
    requestId,
    status: Number.isInteger(status) && status > 0 ? status : null,
    stage
  };
};

export default resolveEditItemSaveError;
