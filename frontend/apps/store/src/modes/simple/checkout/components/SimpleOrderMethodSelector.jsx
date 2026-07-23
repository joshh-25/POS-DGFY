import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';

export function SimpleOrderMethodSelector({
  isMobileViewport = false,
  options = [],
  orderMethod,
  onOrderMethodChange
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
      {options.map((option) => {
        const isActive = orderMethod === option.value;
        return (
          <SelectableOptionCard
            key={`simple-order-method-${option.value}`}
            onClick={() => onOrderMethodChange?.(option.value)}
            label={option.label}
            active={isActive}
            activeBorderColor="#0f766e"
            activeBackground="#ecfeff"
            activeTextColor="#0f766e"
            inactiveBorderColor="#dbe5ee"
            inactiveTextColor="#334155"
            minHeight={48}
            padding="0 16px"
            gap={10}
            borderRadius={12}
            fontSize={14}
            fontWeight={800}
            showCheck={false}
          />
        );
      })}
    </div>
  );
}
