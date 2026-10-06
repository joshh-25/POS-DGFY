import { useEffect, useId, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { ADDRESS_SEARCH_MIN_LENGTH, searchDeliveryAddresses } from '../../../services/geocodingService.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';

const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_MESSAGE = 'No matching address. Try a street, barangay or city, or tap the map to pin it.';
const ERROR_MESSAGE = 'Address search is unavailable right now. Tap the map to pin your location instead.';

/**
 * #759: the delivery-address line doubles as an address search. Typing still edits the address
 * text exactly as before (#1219's typed-address-wins rule is unchanged), and after a short pause it
 * also offers geocoded suggestions; choosing one hands the result to `onSelectResult` so the caller
 * can drop the map pin there. Suggestions come from dgfy-api (`searchDeliveryAddresses`), never a
 * browser-side third-party geocoder (#506).
 *
 * Suggestions only appear for text the customer typed since their last pick, so an address filled
 * in from the pin (reverse geocoding) or a chosen suggestion never re-triggers a search by itself.
 */
export function DeliveryAddressSearchField({
  value = '',
  onValueChange = () => {},
  onSelectResult = () => {},
  bias = null,
  resolving = false,
  isMobileViewport = false,
  ariaLabel = 'Delivery address',
  placeholder = 'Search an address or landmark',
  resolvingPlaceholder = 'Finding the address for your pin…',
  accentColor = '#1a4e8d',
  accentTint = '#eef4fb',
  accentBorder = '#b9cfe8',
  highlighted = false,
  searchAddresses = searchDeliveryAddresses,
  debounceMs = SEARCH_DEBOUNCE_MS
}) {
  const listboxId = useId();
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const query = String(value || '').trim();
  const shouldSearch = editing && query.length >= ADDRESS_SEARCH_MIN_LENGTH;
  const biasLatitude = bias?.latitude ?? null;
  const biasLongitude = bias?.longitude ?? null;

  useEffect(() => {
    if (!shouldSearch) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const nextResults = await searchAddresses({
          query,
          bias: biasLatitude != null && biasLongitude != null ? { latitude: biasLatitude, longitude: biasLongitude } : null,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setResults(nextResults);
        setActiveIndex(0);
        setStatus(nextResults.length > 0 ? 'ready' : 'empty');
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) return;
        setResults([]);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, shouldSearch, biasLatitude, biasLongitude, debounceMs, searchAddresses]);

  // Derived rather than reset inside the effect: once the customer stops editing (picked a
  // suggestion, cleared, or the text came from the pin) the last search's state is simply ignored.
  const effectiveStatus = shouldSearch ? status : 'idle';
  const open = focused && !dismissed && effectiveStatus !== 'idle';
  const showResults = open && effectiveStatus === 'ready';
  const activeResult = showResults ? results[activeIndex] : null;

  const selectResult = (result) => {
    if (!result) return;
    setEditing(false);
    setStatus('idle');
    onSelectResult(result);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setDismissed(true);
      return;
    }
    if (!showResults) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  const panelMessage = effectiveStatus === 'loading'
    ? 'Searching…'
    : effectiveStatus === 'empty'
      ? EMPTY_MESSAGE
      : effectiveStatus === 'error'
        ? ERROR_MESSAGE
        : '';
  const inputFontSize = isMobileViewport ? 16 : 13;

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%' }}>
      <div style={{ minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: `1px solid ${highlighted || focused ? accentBorder : '#dbe5ee'}`, background: '#fff', padding: '0 4px 0 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, boxSizing: 'border-box' }}>
        <Search size={isMobileViewport ? 18 : 16} color="#64748b" aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-activedescendant={activeResult ? `${listboxId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          placeholder={resolving ? resolvingPlaceholder : placeholder}
          onChange={(event) => {
            setEditing(true);
            setDismissed(false);
            onValueChange(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          style={{ border: 'none', outline: 'none', background: 'transparent', flex: '1 1 auto', width: '100%', minWidth: 0, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT - 2, color: '#334155', fontSize: inputFontSize, lineHeight: 1.35, fontWeight: 500, fontFamily: CHECKOUT_FONT_FAMILY, textOverflow: 'ellipsis' }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear delivery address"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setEditing(false);
              onValueChange('');
            }}
            style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'transparent', color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          style={{
            position: isMobileViewport ? 'static' : 'absolute',
            left: 0,
            right: 0,
            top: isMobileViewport ? undefined : 'calc(100% + 6px)',
            marginTop: isMobileViewport ? 8 : 0,
            zIndex: 30,
            background: '#fff',
            border: '1px solid #dbe5ee',
            borderRadius: 12,
            boxShadow: isMobileViewport ? 'none' : '0 12px 28px rgba(15,23,42,0.14)',
            padding: 4,
            fontFamily: CHECKOUT_FONT_FAMILY
          }}
        >
          <ul id={listboxId} role="listbox" aria-label="Suggested addresses" style={{ listStyle: 'none', margin: 0, padding: 0, display: showResults ? 'grid' : 'none', gap: 2 }}>
            {showResults ? results.map((result, index) => {
              const active = index === activeIndex;
              return (
                <li
                  key={`${result.latitude},${result.longitude},${result.addressLine}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                  style={{ minHeight: isMobileViewport ? 52 : 44, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: active ? accentTint : 'transparent', color: '#1e293b', fontSize: isMobileViewport ? 14 : 13, lineHeight: 1.35, boxSizing: 'border-box' }}
                >
                  <MapPin size={16} color={accentColor} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>{result.addressLine}</span>
                </li>
              );
            }) : null}
          </ul>
          {panelMessage ? (
            <div role="status" style={{ padding: '10px', fontSize: 12, lineHeight: 1.45, color: effectiveStatus === 'error' ? '#9f1239' : '#64748b' }}>
              {panelMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
