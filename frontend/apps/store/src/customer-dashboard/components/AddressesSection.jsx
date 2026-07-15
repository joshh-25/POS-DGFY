import React, { useState } from 'react';
import { Lock, MapPin } from 'lucide-react';
import { AddressEditorModal } from './AddressEditorModal.jsx';
import { SavedAddressCard, SavedAddressCardEmpty } from '../../checkout/components/SavedAddressCard.jsx';
import {
  getCustomerAddressActionMeta,
  getCustomerAddressLine,
  getCustomerAddressNote,
  getCustomerAddressTitle
} from '../model/customerAddressPresentation.js';
export function AddressesSection({
  addresses,
  isMobileViewport,
  onSaveAddress,
  onDeleteAddress,
  onSetDefaultAddress,
  onUseAddressForCheckout,
  renderAddressPinEditor,
  accountAddressActionId,
  theme
}) {
  const allAddresses = Array.isArray(addresses) ? addresses : [];
  const THEME = theme;
  const [addressDraft, setAddressDraft] = useState({ label: '', address_line: '', latitude: null, longitude: null, is_default: true });
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState('create');
  const [deletingAddressId, setDeletingAddressId] = useState(null);
  const fieldStyle = {
    width: '100%',
    minHeight: 44,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: '0 14px',
    fontSize: 14,
    color: THEME.text,
    outline: 'none',
    boxSizing: 'border-box',
    background: THEME.surface,
    transition: 'border-color 0.2s'
  };

  // Sort addresses to pin default to top
  const sortedAddresses = [...allAddresses].sort((a, b) => {
    if (a.is_default) return -1;
    if (b.is_default) return 1;
    return 0;
  });

  const handleOpenAddAddressModal = () => {
    setAddressModalMode('create');
    setAddressDraft({ label: '', address_line: '', latitude: null, longitude: null, is_default: true });
    setIsAddressModalOpen(true);
  };

  const handleOpenEditAddressModal = (address) => {
    setAddressModalMode(`edit-${address.address_id}`);
    setAddressDraft({
      label: getCustomerAddressNote(address),
      address_line: getCustomerAddressLine(address),
      latitude: address.latitude,
      longitude: address.longitude,
      is_default: address.is_default === true,
      address_id: address.address_id
    });
    setIsAddressModalOpen(true);
  };

  const handleSaveAddressModal = async (e) => {
    e.preventDefault();
    // Auto-set as default if it's a new address
    const draftPayload = { ...addressDraft };
    if (addressModalMode === 'create') draftPayload.is_default = true;

    const payload = {
      label: String(draftPayload.label || '').trim(),
      address_line: String(draftPayload.address_line || '').trim(),
      latitude: draftPayload.latitude,
      longitude: draftPayload.longitude,
      is_default: Boolean(draftPayload.is_default)
    };

    const isEdit = String(addressModalMode).startsWith('edit-');
    const targetAddress = isEdit ? allAddresses.find(a => a.address_id === addressDraft.address_id) : null;

    const success = await onSaveAddress?.(payload, targetAddress);
    if (success !== false) { // Assuming returning nothing or true means success
      setIsAddressModalOpen(false);
    }
  };

  const confirmDelete = async (address) => {
    await onDeleteAddress?.(address);
    setDeletingAddressId(null);
  };

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 800, color: THEME.text }}>Saved Locations</h2>
          <p style={{ margin: '6px 0 0', color: THEME.muted, fontSize: 14 }}>Locations saved here are available during checkout.</p>
        </div>
        {typeof onSaveAddress === 'function' && (
          <button
            type="button"
            onClick={handleOpenAddAddressModal}
            style={{ background: THEME.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s ease', flexShrink: 0 }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <MapPin size={16} /> Add New Address
          </button>
        )}
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {sortedAddresses.length === 0 ? (
            <SavedAddressCardEmpty message="No addresses saved. Add one below for faster checkout." />
          ) : sortedAddresses.map((address) => {
            const isDefault = Boolean(address.is_default);
            const isDeleting = deletingAddressId === address.address_id;
            const actionMeta = getCustomerAddressActionMeta(accountAddressActionId);
            const isAddressActionTarget = actionMeta.id === String(address.address_id);
            const busy = isDeleting || isAddressActionTarget;

            return (
              <div key={`dashboard-addr-wrapper-${address.address_id}`} style={{ display: 'grid', gap: 10 }}>
                <SavedAddressCard
                  address={{
                    id: `dashboard-address-${address.address_id}`,
                    addressId: address.address_id,
                    label: getCustomerAddressTitle(address),
                    fullAddress: getCustomerAddressLine(address),
                    isDefault,
                    source: 'account'
                  }}
                  isSelected={isDefault}
                  isBusy={busy}
                  onSelect={isAddressActionTarget ? undefined : (() => onUseAddressForCheckout?.(address))}
                  onSetDefault={!isDefault ? () => onSetDefaultAddress?.(address) : undefined}
                  onEdit={() => handleOpenEditAddressModal(address)}
                  onRemove={() => setDeletingAddressId(address.address_id)}
                  showActions={!isDeleting}
                  themeColor={THEME.primary}
                  themeBg="#eff6ff"
                  themeHoverBorder="#93c5fd"
                  themeHoverBg="#f8fbff"
                  themeShadowColor="rgba(59,130,246,0.16)"
                  themeShadowColorSoft="rgba(59,130,246,0.12)"
                />
                {isDeleting ? (
                  <div style={{ marginTop: -2, padding: '0 8px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: THEME.orange }}>Delete this address?</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setDeletingAddressId(null)} style={{ border: `1px solid ${THEME.border}`, background: 'transparent', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => confirmDelete(address)} style={{ border: 'none', background: THEME.orange, color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: THEME.muted, fontSize: 12, marginTop: 8 }}>
          <Lock size={14} /> Your addresses are private and secure.
        </div>
      </section>

      {/* Modal Overlay */}
      {isAddressModalOpen ? (
        <AddressEditorModal
          isMobileViewport={isMobileViewport}
          theme={THEME}
          addressModalMode={addressModalMode}
          addressDraft={addressDraft}
          setAddressDraft={setAddressDraft}
          onClose={() => setIsAddressModalOpen(false)}
          onSubmit={handleSaveAddressModal}
          renderAddressPinEditor={renderAddressPinEditor}
          accountAddressActionId={accountAddressActionId}
          fieldStyle={fieldStyle}
        />
      ) : null}

      {/* CSS for animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes zoomIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}} />
    </div>
  );
}
