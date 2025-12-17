import en, { type Messages } from './locales/en';
import zhCN from './locales/zh-CN';

// Keep keys stable; add new locales by adding another import and map entry.
export { type Messages };

export const MESSAGES_BY_LOCALE: Record<string, Messages> = {
  en,
  'zh-CN': zhCN,
};

