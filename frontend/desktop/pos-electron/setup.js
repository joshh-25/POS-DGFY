const form = document.getElementById('setup-form');
const statusNode = document.getElementById('status');
const submitButton = document.getElementById('submit');

const setStatus = (message, tone = '') => {
  statusNode.textContent = message;
  statusNode.className = tone ? `status ${tone}` : 'status';
};

const hydrate = async () => {
  if (!window.posDesktop?.getRuntimeConfig) return;
  const runtime = await window.posDesktop.getRuntimeConfig().catch(() => null);
  if (!runtime) return;

  form.backendOrigin.value = runtime.backendOrigin || '';
  form.companyToken.value = runtime.companyToken || '';
  form.terminalId.value = runtime.terminalId || '';
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus('Saving connection settings...');

  try {
    await window.posDesktop.saveRuntimeConfig({
      backendOrigin: form.backendOrigin.value,
      companyToken: form.companyToken.value,
      terminalId: form.terminalId.value
    });
    setStatus('Launching POS...', 'success');
  } catch (error) {
    setStatus(error?.message || 'Failed to save POS desktop settings.', 'error');
    submitButton.disabled = false;
  }
});

hydrate();
