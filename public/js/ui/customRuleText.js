import { t, tc } from '../../../shared/i18n.js';
import { tr } from '../i18n/i18n.js';

/** Localize metadata before rendering; native output must not go through DOM translation again. */
export function customRuleText(rule, value, id = '') {
  if (rule?.category !== 'restart') return tr(`${rule?.name || id} ${value}${rule?.unit || ''}`);
  return `${t(rule.name)} ${customRuleValue(rule, value)}`;
}

export function customRuleValue(rule, value) {
  const option = rule.options?.find((entry) => entry.value === value);
  return option ? t(option.label) : `${value} ${tc('restart-unit', rule.unit)}`;
}
