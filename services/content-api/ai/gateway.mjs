/**
 * AI Gateway — единственная точка, где content-api знает о конкретном
 * провайдере генерации (AI Generation Architecture, docs/07: «Studio никогда
 * не обращается к провайдеру напрямую»). По умолчанию — template,
 * детерминированный генератор без внешних вызовов (providers/template-provider.mjs).
 * С AI_PROVIDER=aitunnel и заданным AITUNNEL_API_KEY — настоящий LLM через
 * AITUNNEL (providers/aitunnel-provider.mjs), российский агрегатор без VPN.
 *
 * Чтобы подключить ещё один провайдер: добавить providers/<name>-provider.mjs
 * с той же сигнатурой generate({ topic, existingIds }), зарегистрировать
 * его в PROVIDERS ниже и выставить переменную окружения AI_PROVIDER=<name>.
 * Studio и остальной content-api не изменятся ни строкой.
 */

import * as templateProvider from './providers/template-provider.mjs';
import * as aitunnelProvider from './providers/aitunnel-provider.mjs';

const PROVIDERS = {
  template: templateProvider,
  aitunnel: aitunnelProvider,
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
