import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkflowMode } from '../WorkflowModeContext.jsx';
import { isFnbWorkflowMode, isMsmeWorkflowMode, isServicesWorkflowMode, modeHasCapability } from '../workflowMode.js';

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

export default function WorkflowModeRouteGate({
  blockInMsme = false,
  blockInServices = false,
  blockInFnb = false,
  requiredCapability = '',
  moduleLabel = 'This module',
  children
}) {
  const location = useLocation();
  const { loading, workflowMode } = useWorkflowMode();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[220px] text-sm text-slate-500">
        Loading workspace mode...
      </div>
    );
  }

  if (blockInMsme && isMsmeWorkflowMode(workflowMode)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  if (blockInServices && isServicesWorkflowMode(workflowMode)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  if (blockInFnb && isFnbWorkflowMode(workflowMode)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  if (requiredCapability && !modeHasCapability(workflowMode, requiredCapability)) {
    const fromPath = `${location.pathname}${location.search || ''}`;
    return <WorkflowModeRedirect moduleLabel={moduleLabel} fromPath={fromPath} />;
  }

  return children;
}
