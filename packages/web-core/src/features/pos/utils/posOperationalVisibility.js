export const isPosOnlineOrderQueueEnabled = ({ workflowMode, posDefaults } = {}) => (
  String(workflowMode || '').trim().toLowerCase() !== 'services'
  && posDefaults?.show_online_queue !== false
);
