/**
 * AI Gateway — единственная точка, где content-api знает о конкретном
 * провайдере генерации (AI Generation Architecture, docs/07: «Studio никогда
 * не обращается к провайдеру напрямую»). Сейчас доступен только template —
 * детерминированный генератор без внешних вызовов (см. providers/template-provider.mjs).
 *
 * Чтобы подключить настоящую LLM: добавить providers/<name>-provider.mjs
 * с той же сигнатурой generate({ topic, existingIds }), зарегистрировать
 * его в PROVIDERS ниже и выставить переменную окружения AI_PROVIDER=<name>.
 * Studio и остальной content-api не изменятся ни строкой.
 */

import * as templateProvider from './providers/template-provider.mjs';

const PROVIDERS = {
  template: templateProvider,
};

export async function generateDraftCase(input) {
  const providerName = process.env.AI_PROVIDER || 'template';
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Неизвестный AI-провайдер: ${providerName}`);
  return provider.generate(input);
}

export function currentProviderName() {
  return process.env.AI_PROVIDER || 'template';
}
