import type { Locale } from './i18n/locales';

/** Exact English UI strings from the CutSheetRX panel → locale */
const JA: Record<string, string> = {
  Map: 'マップ',
  'Go to': '移動',
  Go: '移動',
  Rendering: 'レンダリング',
  Lidar: 'LiDAR',
  Off: 'オフ',
  'Relief & shadows': '起伏と陰影',
  Tools: 'ツール',
  Field: '圃場',
  Layers: 'レイヤー',
  'Help & data sources': 'ヘルプとデータソース',
  'Help and data sources': 'ヘルプとデータソース',
  'Draw elevation profile': '標高断面を描く',
  'Draw field area': '圃場範囲を描く',
  'Town, county, address, or lat, long': '市区町村、住所、または緯度・経度',
  'Shaded relief (gray)': '陰影起伏（グレー）',
  'Color elevation + shading': '標高カラー + 陰影',
  'Color elevation (flat)': '標高カラー（平面）',
  'Slope (shaded)': '斜面（陰影）',
  'Contours, 2 ft (USGS)': '等高線 2 ft (USGS)',
  'Contours, 5 ft (USGS)': '等高線 5 ft (USGS)',
  Fine: '細かい',
  Normal: '標準',
  'Main only': '主のみ',
  'Estimate only. Not a survey. Verify with a professional before bidding or building.':
    '推定のみ。測量ではありません。入札・施工前に専門家へ確認してください。',
  'Move over the map for elevation': '地図上で標高を表示',
  'Tap the map for elevation': '地図をタップして標高を表示',
};

const AR: Record<string, string> = {
  Map: 'الخريطة',
  'Go to': 'انتقل إلى',
  Go: 'اذهب',
  Rendering: 'العرض',
  Lidar: 'LiDAR',
  Off: 'إيقاف',
  'Relief & shadows': 'التضاريس والظلال',
  Tools: 'أدوات',
  Field: 'الحقل',
  Layers: 'الطبقات',
  'Help & data sources': 'مساعدة ومصادر البيانات',
  'Help and data sources': 'مساعدة ومصادر البيانات',
  'Draw elevation profile': 'رسم مقطع ارتفاع',
  'Draw field area': 'رسم مساحة الحقل',
  'Town, county, address, or lat, long': 'مدينة، مقاطعة، عنوان، أو خط عرض/طول',
  'Shaded relief (gray)': 'تضاريس مظللة (رمادي)',
  'Color elevation + shading': 'ارتفاع ملون + تظليل',
  'Color elevation (flat)': 'ارتفاع ملون (مسطح)',
  'Slope (shaded)': 'انحدار (مظلل)',
  'Contours, 2 ft (USGS)': 'خطوط كنتور 2 قدم (USGS)',
  'Contours, 5 ft (USGS)': 'خطوط كنتور 5 قدم (USGS)',
  Fine: 'دقيق',
  Normal: 'عادي',
  'Main only': 'الرئيسي فقط',
  'Estimate only. Not a survey. Verify with a professional before bidding or building.':
    'تقدير فقط — ليس مسحاً. تحقق مع مختص قبل البناء.',
  'Move over the map for elevation': 'حرّك المؤشر على الخريطة للارتفاع',
  'Tap the map for elevation': 'المس الخريطة للارتفاع',
};

const DICTS: Record<Locale, Record<string, string>> = {
  en: {},
  ja: JA,
  ar: AR,
};

const ATTR = 'data-csrx-en';

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function stampAndSet(el: HTMLElement, next: string) {
  if (!el.getAttribute(ATTR)) {
    el.setAttribute(ATTR, decodeEntities((el.textContent || '').trim()));
  }
  const original = el.getAttribute(ATTR) || '';
  const value = next || original;
  if ((el.textContent || '').trim() === value.trim()) return;
  el.textContent = value;
}

let applying = false;

/** Translate CutSheetRX drawer labels only — map/tools keep working. */
export function translateCsrxPanel(doc: Document, locale: Locale) {
  if (applying) return;
  applying = true;
  try {
    translateCsrxPanelInner(doc, locale);
  } finally {
    applying = false;
  }
}

function translateCsrxPanelInner(doc: Document, locale: Locale) {
  const dict = DICTS[locale] || {};
  const lookup = (original: string) => {
    const key = decodeEntities(original.trim());
    if (!key) return key;
    if (locale === 'en') return key;
    return dict[key] ?? key;
  };

  const nodes = doc.querySelectorAll<HTMLElement>(
    'p.cap, label.cap, button.toolbtn, button#goBtn, .foot > span, output#opacityOut, #readout, p.disclaim',
  );

  nodes.forEach((el) => {
    if (el.matches('button.toolbtn')) {
      // Keep SVG; translate trailing text nodes only
      if (!el.getAttribute(ATTR)) {
        const parts: string[] = [];
        el.childNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) {
            const t = (n.textContent || '').trim();
            if (t) parts.push(t);
          }
        });
        el.setAttribute(ATTR, parts.join(' ') || decodeEntities((el.textContent || '').trim()));
      }
      const original = el.getAttribute(ATTR) || '';
      const translated = lookup(original);
      let textSet = false;
      el.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim()) {
          n.textContent = textSet ? '' : ` ${translated}`;
          textSet = true;
        }
      });
      if (!textSet) stampAndSet(el, translated);
      return;
    }

    if (el.id === 'opacityOut') {
      const current = decodeEntities((el.textContent || '').trim());
      const offForms = new Set(['Off', JA.Off, AR.Off]);
      if (offForms.has(current)) {
        const next = locale === 'en' ? 'Off' : lookup('Off');
        if (current !== next) el.textContent = next;
      }
      return;
    }

    if (!el.getAttribute(ATTR)) {
      el.setAttribute(ATTR, decodeEntities((el.textContent || '').trim()));
    }
    const original = el.getAttribute(ATTR) || '';
    stampAndSet(el, lookup(original));
  });

  doc.querySelectorAll<HTMLInputElement>('input[placeholder]').forEach((el) => {
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, el.placeholder);
    const original = el.getAttribute(ATTR) || '';
    el.placeholder = lookup(original);
  });

  doc.querySelectorAll<HTMLOptionElement>('select option').forEach((el) => {
    if (!el.getAttribute(ATTR)) {
      el.setAttribute(ATTR, decodeEntities((el.textContent || '').trim()));
    }
    const original = el.getAttribute(ATTR) || '';
    stampAndSet(el, lookup(original));
  });

  doc.querySelectorAll<HTMLElement>('[aria-label]').forEach((el) => {
    const key = `${ATTR}-aria`;
    if (!el.getAttribute(key)) el.setAttribute(key, el.getAttribute('aria-label') || '');
    const original = el.getAttribute(key) || '';
    const next = lookup(original);
    if (next) el.setAttribute('aria-label', next);
  });
}
