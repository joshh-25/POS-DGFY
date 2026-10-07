import { buildDgfyLaundryOrderUseCases } from '../src/modules/dgfyLaundryOrders/usecases/dgfyLaundryOrderUseCases.js';
import { jest } from '@jest/globals';

const build = ({ role = 'owner', mapped = true, row = null } = {}) => {
  const repository = {
    findActiveMapping: jest.fn(async () => mapped ? { status: 'active' } : null),
    listDeadLetters: jest.fn(async () => [{ id: 'dl-1', type: 'submitOrder' }]),
    findDeadLetter: jest.fn(async () => row || { id: 'dl-1', status: 'dead_letter', attempts: 8, direction: 'outbound' }),
    redriveOutbound: jest.fn(async () => true),
    redriveOutboundCompletion: jest.fn(async () => true),
    claimInboundRedrive: jest.fn(async () => true)
  };
  const operatorRepository = {
    findLaundryCompany: jest.fn(async () => ({ company_id: 'company-1', role })),
    audit: jest.fn(async () => {})
  };
  const partnerClient = { limits: { maxAttempts: 8 } };
  return {
    repository,
    operatorRepository,
    useCases: buildDgfyLaundryOrderUseCases({ repository, operatorRepository, partnerClient })
  };
};

describe('DGLaundry scoped dead-letter recovery', () => {
  it('lists metadata only after owner/admin membership and active mapping checks', async () => {
    const { repository, operatorRepository, useCases } = build();
    await expect(useCases.listOperatorDeadLetters({
      dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', direction: 'outbound', limit: 20
    })).resolves.toEqual([{ id: 'dl-1', type: 'submitOrder' }]);
    expect(operatorRepository.findLaundryCompany).toHaveBeenCalledWith({ dgfyAccountId: 'account-1', companyId: 'company-1' });
    expect(repository.findActiveMapping).toHaveBeenCalledWith({ companyId: 'company-1', locationId: 'location-1' });
    expect(repository.listDeadLetters).toHaveBeenCalledWith({ companyId: 'company-1', locationId: 'location-1', direction: 'outbound', limit: 20 });
  });

  it.each([
    ['customer', 'customer'],
    ['unmapped company', 'owner']
  ])('denies %s callers before listing', async (label, role) => {
    const { repository, useCases } = build({ role, mapped: label !== 'unmapped company' });
    await expect(useCases.listOperatorDeadLetters({ dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', limit: 100 }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.listDeadLetters).not.toHaveBeenCalled();
  });

  it('requires a reason and audits prior state/attempt history before outbound requeue', async () => {
    const { repository, operatorRepository, useCases } = build();
    await expect(useCases.redriveOperatorDeadLetter({
      dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', id: 'dl-1', direction: 'outbound', reason: 'Provider recovered'
    })).resolves.toEqual({ id: 'dl-1', direction: 'outbound', disposition: 'requeued' });
    expect(operatorRepository.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'dglaundry_dead_letter_redrive', dgfyAccountId: 'account-1', companyId: 'company-1',
      metadata: expect.objectContaining({ old_status: 'dead_letter', prior_attempts: 8, reason: 'Provider recovered' })
    }));
    expect(repository.redriveOutbound).toHaveBeenCalledWith({ id: 'dl-1', companyId: 'company-1', locationId: 'location-1', maxAttempts: 8 });
    await expect(useCases.redriveOperatorDeadLetter({
      dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', id: 'dl-1', direction: 'outbound', reason: ''
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid limits and unknown directions', async () => {
    const { useCases } = build();
    await expect(useCases.listOperatorDeadLetters({ dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', limit: 501 }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(useCases.listOperatorDeadLetters({ dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', direction: 'any', limit: 10 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('redrives failed caller completion without resetting or resending provider delivery', async () => {
    const { repository, useCases } = build({ row: { id: 'dl-1', status: 'delivered', completion_status: 'failed', attempts: 1, direction: 'outbound' } });
    await expect(useCases.redriveOperatorDeadLetter({
      dgfyAccountId: 'account-1', companyId: 'company-1', locationId: 'location-1', id: 'dl-1', direction: 'outbound', reason: 'Retry local finalization'
    })).resolves.toEqual({ id: 'dl-1', direction: 'outbound', disposition: 'completion_requeued' });
    expect(repository.redriveOutboundCompletion).toHaveBeenCalledWith({ id: 'dl-1', companyId: 'company-1', locationId: 'location-1' });
    expect(repository.redriveOutbound).not.toHaveBeenCalled();
  });
});
