import { ShoppingBag, Truck } from 'lucide-react';
import { useState } from 'react';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import { getUnavailableFulfillmentMessage } from '../../../../shared/model/storefrontFulfillmentOptions.js';

const SIMPLE_ORDER_METHOD_ICONS = {
  delivery: ({ size }) => <Truck size={size} />,
  pickup: ({ size }) => <ShoppingBag size={size} />
};

export function SimpleOrderMethodSelector({
  isMobileViewport = false,
  options = [],
  orderMethod,
  onOrderMethodChange
}) {
  const [unavailableMessage, setUnavailableMessage] = useState('');

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        {options.map((option) => {
        const isActive = orderMethod === option.value;
        const isAvailable = option.available !== false;
        return (
          <SelectableOptionCard
            key={`simple-order-method-${option.value}`}
            onClick={() => {
              if (!isAvailable) {
                setUnavailableMessage(getUnavailableFulfillmentMessage(option));
                return;
              }
              setUnavailableMessage('');
              onOrderMethodChange?.(option.value);
            }}
            label={option.label}
            icon={SIMPLE_ORDER_METHOD_ICONS[option.value] || null}
            active={isActive}
            activeBorderColor="#176B3A"
            activeBackground="#FFF8E7"
            activeTextColor="#176B3A"
            activeIconBackground="#FFF7E6"
            activeIconColor="#176B3A"
            inactiveBorderColor="#dbe5ee"
            inactiveTextColor="#334155"
            minHeight={isMobileViewport ? 52 : 64}
            padding={isMobileViewport ? '10px 12px' : '12px 14px'}
            gap={isMobileViewport ? 10 : 12}
            borderRadius={14}
            fontSize={14}
            fontWeight={700}
            iconBoxSize={isMobileViewport ? 34 : 40}
            iconSize={isMobileViewport ? 18 : 20}
            unavailable={!isAvailable}
          />
        );
        })}
      </div>
      {unavailableMessage ? <div role="alert" style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{unavailableMessage}</div> : null}
    </div>
  );
}
