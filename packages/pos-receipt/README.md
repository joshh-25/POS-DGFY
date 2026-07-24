# @sieitzz/pos-receipt

Dependency-free receipt renderers shared by DGFY browser POS and native POS.

```js
import { renderPosReceiptHtml, renderThermalReceiptText } from '@sieitzz/pos-receipt';

const html = renderPosReceiptHtml({ transaction, businessSettings, paperWidth: '80mm' });
const thermalText = renderThermalReceiptText({ transaction, paperWidth: '57mm' });
```

Both renderers accept plain receipt data. `renderPosReceiptHtml` escapes dynamic values before emitting HTML. This package is intended for frontend and mobile consumers only; backend services must not import it.
