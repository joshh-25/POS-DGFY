import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkflowMode } from '../WorkflowModeContext.jsx';
import { isMsmeWorkflowMode, modeHasCapability } from '../workflowMode.js';

function WorkflowModeRedirect({ moduleLabel, fromPath }) {
  const navigate = useNavigate();
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      toast.info(`${moduleLabel} is hidden in this Business Mode. Redirected to Dashboard.`);
    }
    navigate('/', {
      replace: true,
      state: {
        workflow_mode_redirect: {
          module: moduleLabel,
          from: fromPath
        }
      }
    });
  }, [fromPath, moduleLabel, navigate]);

  return null;
}

// Route gating is capability-driven: pass the same capability the module's
// backend routes enforce, so a route can never render for a mode whose API
// will 403 it. `blockInMsme` remains only for AI Chat, which has no workflow
// capability at all (backend/src/routes/ai.js gates on premium subscription),
// so its MSME hide is a product preference rather than a capability.
export default function WorkflowModeRouteGate({
  blockInMsme = false,
  requiredCapability = '',
  moduleLabel = 'This module',
  children
}) {
  const location = useLocation();
  const { loading, resolved, workflowMode, enabledCapabilities } = useWorkflowMode();

  if (loading || !resolved) {
    return (
      <div className="flex items-center justify-center min-h-[220px] text-sm text-slate-500">
        {loading ? 'Loading workspace mode...' : 'Unable to confirm workspace mode. Refresh and try again.'}
      </div>
    );
  }

  if (blockInMsme && isMsmeWorkflowMode(workflowMode)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  if (requiredCapability && !modeHasCapability(workflowMode, requiredCapability, enabledCapabilities)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  return children;
}
