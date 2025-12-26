import api from './api.js';

export const getItems = async (params = {}) => {
  const response = await api.get('/items', { params });
  return response.data.data;
};

export const getItemById = async (itemId) => {
  const response = await api.get(`/items/${itemId}`);
  return response.data.data;
};

export const createItem = async (itemData) => {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:13',message:'createItem API call - request payload',data:{itemData,max_capacity:itemData.max_capacity,max_capacity_type:typeof itemData.max_capacity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    const response = await api.post('/items', itemData);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:17',message:'createItem API call - success response',data:{status:response.status,data:response.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return response.data.data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:22',message:'createItem API call - error response',data:{status:error.response?.status,errors:error.response?.data?.errors,message:error.response?.data?.message,fullError:error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw error;
  }
};

export const updateItem = async (itemId, itemData) => {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:31',message:'updateItem API call - request payload',data:{itemId,itemData,max_capacity:itemData.max_capacity,max_capacity_type:typeof itemData.max_capacity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    const response = await api.put(`/items/${itemId}`, itemData);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:35',message:'updateItem API call - success response',data:{status:response.status,data:response.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return response.data.data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemService.js:38',message:'updateItem API call - error response',data:{status:error.response?.status,errors:error.response?.data?.errors,message:error.response?.data?.message,fullError:error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw error;
  }
};

export const deleteItem = async (itemId) => {
  const response = await api.delete(`/items/${itemId}`);
  return response.data;
};

export const getItemBatches = async (itemId) => {
  const response = await api.get(`/items/${itemId}/batches`);
  return response.data.data.batches;
};

export const getItemMovements = async (itemId) => {
  const response = await api.get(`/items/${itemId}/movements`);
  return response.data.data.movements;
};

export const getItemStockHistory = async (itemId, params = {}) => {
  const response = await api.get(`/items/${itemId}/stock-history`, { params });
  return response.data.data.movements;
};

