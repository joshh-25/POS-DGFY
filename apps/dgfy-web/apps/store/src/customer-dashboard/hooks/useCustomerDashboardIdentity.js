import { useMemo } from 'react';

export function useCustomerDashboardIdentity({
  accountPanel,
  dgfySessionAccount,
  savedCustomerDetails,
  maskValue
}) {
  const accountDisplayName = useMemo(() => {
    const firstName = String(accountPanel?.me?.first_name || '').trim();
    const lastName = String(accountPanel?.me?.last_name || '').trim();
    const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (joinedName) return joinedName;

    const accountName = String(accountPanel?.me?.name || '').trim();
    if (accountName) return accountName;

    const username = String(accountPanel?.me?.username || '').trim();
    if (username) return username;

    const email = String(accountPanel?.me?.email || '').trim();
    if (email) return email;

    const sessionFirstName = String(dgfySessionAccount?.first_name || '').trim();
    const sessionLastName = String(dgfySessionAccount?.last_name || '').trim();
    const sessionJoinedName = [sessionFirstName, sessionLastName].filter(Boolean).join(' ').trim();
    if (sessionJoinedName) return sessionJoinedName;

    const sessionName = String(dgfySessionAccount?.name || '').trim();
    if (sessionName) return sessionName;

    const sessionUsername = String(dgfySessionAccount?.username || '').trim();
    if (sessionUsername) return sessionUsername;

    const sessionEmail = String(dgfySessionAccount?.email || '').trim();
    if (sessionEmail) return sessionEmail;

    const savedName = String(savedCustomerDetails?.name || '').trim();
    if (savedName) return savedName;

    return 'Guest customer';
  }, [
    accountPanel?.me?.email,
    accountPanel?.me?.first_name,
    accountPanel?.me?.last_name,
    accountPanel?.me?.name,
    accountPanel?.me?.username,
    dgfySessionAccount?.email,
    dgfySessionAccount?.first_name,
    dgfySessionAccount?.last_name,
    dgfySessionAccount?.name,
    dgfySessionAccount?.username,
    savedCustomerDetails?.name
  ]);

  const accountIdentityRawName = useMemo(() => {
    const accountFirstName = String(accountPanel?.me?.first_name || '').trim();
    const accountLastName = String(accountPanel?.me?.last_name || '').trim();
    const accountJoined = [accountFirstName, accountLastName].filter(Boolean).join(' ').trim();
    if (accountJoined) return accountJoined;

    const accountName = String(accountPanel?.me?.name || '').trim();
    if (accountName) return accountName;

    const sessionFirstName = String(dgfySessionAccount?.first_name || '').trim();
    const sessionLastName = String(dgfySessionAccount?.last_name || '').trim();
    const sessionJoined = [sessionFirstName, sessionLastName].filter(Boolean).join(' ').trim();
    if (sessionJoined) return sessionJoined;

    const sessionName = String(dgfySessionAccount?.name || '').trim();
    if (sessionName) return sessionName;

    return '';
  }, [
    accountPanel?.me?.first_name,
    accountPanel?.me?.last_name,
    accountPanel?.me?.name,
    dgfySessionAccount?.first_name,
    dgfySessionAccount?.last_name,
    dgfySessionAccount?.name
  ]);

  const accountIdentityRawPhone = useMemo(
    () => String(accountPanel?.me?.phone || dgfySessionAccount?.phone || '').trim(),
    [accountPanel?.me?.phone, dgfySessionAccount?.phone]
  );

  const accountIdentityRawEmail = useMemo(
    () => String(accountPanel?.me?.email || dgfySessionAccount?.email || '').trim(),
    [accountPanel?.me?.email, dgfySessionAccount?.email]
  );

  const accountIdentityContact = useMemo(() => {
    const accountPhone = String(accountPanel?.me?.phone || '').trim();
    const accountEmail = String(accountPanel?.me?.email || '').trim();
    if (accountPhone) return maskValue(accountPhone, 3, 2);
    if (accountEmail) return maskValue(accountEmail, 2, 8);

    const sessionPhone = String(dgfySessionAccount?.phone || '').trim();
    const sessionEmail = String(dgfySessionAccount?.email || '').trim();
    if (sessionPhone) return maskValue(sessionPhone, 3, 2);
    if (sessionEmail) return maskValue(sessionEmail, 2, 8);

    const savedPhone = String(savedCustomerDetails?.phone || '').trim();
    const savedEmail = String(savedCustomerDetails?.email || '').trim();
    if (savedPhone) return maskValue(savedPhone, 3, 2);
    if (savedEmail) return maskValue(savedEmail, 2, 8);

    return 'No linked account details yet';
  }, [
    accountPanel?.me?.email,
    accountPanel?.me?.phone,
    dgfySessionAccount?.email,
    dgfySessionAccount?.phone,
    maskValue,
    savedCustomerDetails?.email,
    savedCustomerDetails?.phone
  ]);

  const accountIdentityInitials = useMemo(() => {
    const base = String(accountDisplayName || '').trim();
    if (!base) return 'GU';
    const parts = base.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map((part) => part.charAt(0).toUpperCase()).join('');
    return initials || 'GU';
  }, [accountDisplayName]);

  return useMemo(() => ({
    accountDisplayName,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    accountIdentityName: accountDisplayName,
    accountIdentityContact,
    accountIdentityInitials
  }), [
    accountDisplayName,
    accountIdentityContact,
    accountIdentityInitials,
    accountIdentityRawEmail,
    accountIdentityRawName,
    accountIdentityRawPhone
  ]);
}

export default useCustomerDashboardIdentity;
