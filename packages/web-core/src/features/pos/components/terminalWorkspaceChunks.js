export const loadIncomingQueueWorkspace = () => import('./TerminalOperationsPanels.jsx')
  .then((module) => ({ default: module.IncomingQueueWorkspace }));
