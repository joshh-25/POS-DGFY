// Presentation-only mobile catalog-to-checkout animation.
export const flyImageToCheckoutBar = (cardElement) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.matchMedia('(max-width: 639.98px)').matches) return;
    if (!cardElement) return;
    const sourceImg = cardElement.querySelector('.product-image');
    if (!sourceImg || typeof sourceImg.animate !== 'function') return;
    const checkoutBar = document.getElementById('checkout-bar');
    if (!checkoutBar) return;
    const checkoutTarget = document.getElementById('checkout-bar-button') || checkoutBar;
    const sourceRect = sourceImg.getBoundingClientRect();
    if (sourceRect.width === 0 || sourceRect.height === 0) return;
    const targetRect = checkoutTarget.getBoundingClientRect();
    const size = 44;
    const clone = sourceImg.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = [
        'position: fixed',
        `left: ${sourceRect.left + (sourceRect.width / 2) - (size / 2)}px`,
        `top: ${sourceRect.top + (sourceRect.height / 2) - (size / 2)}px`,
        `width: ${size}px`,
        `height: ${size}px`,
        'border-radius: 9999px',
        'object-fit: cover',
        'pointer-events: none',
        'z-index: 2147483647',
        'will-change: transform, opacity'
    ].join(';');
    document.body.appendChild(clone);
    const deltaX = (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
    const deltaY = (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2);
    const animation = clone.animate(
        [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
            { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.35}px) scale(0.7)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.15)`, opacity: 0, offset: 1 }
        ],
        { duration: 550, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' }
    );
    const cleanup = () => clone.remove();
    if (animation.finished && typeof animation.finished.then === 'function') {
        animation.finished.then(cleanup).catch(cleanup);
    } else {
        animation.onfinish = cleanup;
        animation.oncancel = cleanup;
    }
};
