'use strict';

export function getLangCode(lang) {
  return langCodes[lang] || 'ru-ru';
};

export function getCountryLang(country) {
  return countryToLang[country] || countryToLang.EN;
};

var langCodes = {
  'ru_RU': 'ru-ru',
  'fr_FR': 'fr-fr',
  'en_US': 'en-us',
  'he_IL': 'he-il',
  'ar_PS': 'ar-ps',
  'lv_LV': 'lv-lv',
  'lt_LT': 'lt-lt',
  'et_ET': 'et-et',
  'de_DE': 'de-de',
  'zh_CN': 'zh-cn',
  'fi_FI': 'fi-fi',
  'am_AM': 'am-am',
  'ge_GE': 'ge-ge'
}

var countryToLang = {
  'EN': 'en_US',
  'RU': 'ru_RU',
  'KZ': 'ru_RU',
  'FR': 'fr_FR',
  'UA': 'uk_UA',
  'HE': 'he_IL',
  'HU': 'hu_HU',
  'IL': 'he_IL',
  'PS': 'he_PS',
  'LV': 'lv_LV',
  'LT': 'lt_LT',
  'ET': 'et_ET',
  'DE': 'de_DE',
  'CH': 'zh_CN',
  'AM': 'am_AM',
  'GE': 'ge_GE'
}

