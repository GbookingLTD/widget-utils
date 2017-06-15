'use strict';

class phoneUtils {

  static get langCodes() {
    return {
      'ru_RU': 'ru-ru',
      'fr_FR': 'fr-fr',
      'en_US': 'en-us',
      'he_IL': 'he-il',
      'lv_LV': 'lv-lv',
      'lt_LT': 'lt-lt',
      'et_ET': 'et-et',
      'de_DE': 'de-de',
      'zh_CN': 'zh-cn',
      'fi_FI': 'fi-fi',
      'am_AM': 'am-am',
      'ge_GE': 'ge-ge'
    };
  }

  static get countryToLang() {
    return {
      'EN': 'en_US',
      'RU': 'ru_RU',
      'KZ': 'ru_RU',
      'FR': 'fr_FR',
      'UA': 'uk_UA',
      'HE': 'he_IL',
      'HU': 'hu_HU',
      'IL': 'he_IL',
      'LV': 'lv_LV',
      'LT': 'lt_LT',
      'ET': 'et_ET',
      'DE': 'de_DE',
      'CH': 'zh_CN',
      'AM': 'am_AM',
      'GE': 'ge_GE'
    };
  }


  static defaultExtractor(value) {
    let regex = /\+(\d+)\((\d+)\) (\d+)-(\d+)/;
    return value.match(regex);
  }

  static defaultStringMaker(p) {
    if (!p || !p.number) return '';
    //let p = person.phone[0];
    let p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
    let p2 = p.number.length > 3 ? p.number.substr(3) : '';
    return `+${p.country_code}(${p.area_code}) ${p1}-${p2}`;
  }

  static get phoneData() {
    return {
      'AM': {
        code: '374',
        mask: '+374(dd) dd-dd-dd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          return ['', '374', digits.substring(3, 5), digits.substring(5), ''];
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 2), digits.substring(2)];
        },
        phoneStringMaker: function (p) {
          if (!p || !p.number) return '';
          let p1 = p.number.length > 3 ? p.number.substr(0, 2) : '';
          let p2 = p.number.length > 3 ? p.number.substr(2, 2) : '';
          let p3 = p.number.length > 3 ? p.number.substr(4, 2) : '';
          return `+${p.country_code}(${p.area_code}) ${p1}-${p2}-${p3}`;
        }
      },
      'GE': {
        code: '995',
        rules: {
          "9": null,
          "d": /\d/
        },
        mask: '+995 (ddd) ddd-ddd',
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 3), digits.substring(3)];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length === 12) {
            return ['', '995',  digits.substring(3, 6),  digits.substring(6), ''];
          }
          return ['', '995', '', '', ''];
        },
        phoneStringMaker: function(p){
          if (!p || !p.number) return '';
          let p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
          let p2 = p.number.length > 3 ? p.number.substr(3,6) : '';
          return `+${p.country_code}(${p.area_code}) ${p1}-${p2}`;
        }
      },
      'IL': {
        code: '972',
        mask: 'dddddddddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          if (value[0] === '0') {
            return [value.substring(1, 3), value.substring(3)];
          }
          return ['', ''];
        },
        phoneExtractor: function (value) {
          if (value[0] === '0' && value.length === 10) {
            return ['', '972', value.substring(1, 3), value.substring(3), ''];
          }
          return ['', '972', '', '', ''];
        },
        phoneStringMaker(p){
          if (!p) return '';
          let countryCode = (p.country_code || '').replace("+");
          if (countryCode === "972") {
            return p.number ? `0${p.area_code}${p.number}` : "";
          }
          return phoneUtils.defaultStringMaker(p);
        }
      },
      'FR': {
        code: '33',
        mask: 'dddddddddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          if (value[0] === '0') {
            return [value.substring(1, 3), value.substring(3)];
          }
          return ['', ''];
        },
        phoneExtractor: function (value) {
          if (value[0] === '0' && value.length === 10) {
            return ['', '33', value.substring(1, 3), value.substring(3), ''];
          }
          return ['', '33', '', '', ''];
        },
        phoneStringMaker(p){
          if (!p) return '';
          let countryCode = (p.country_code || '').replace("+");
          if (countryCode === "33") {
            return p.number ? `0${p.area_code}${p.number}` : "";
          }
          return phoneUtils.defaultStringMaker(p);
        }
      },
      'US': {
        code: '1',
        mask: '+1(ddd) ddd-dddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 3), digits.substring(3)];
        },
        phoneExtractor: phoneUtils.defaultExtractor,
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'UA': {
        code: '380',
        mask: '+380(dd) ddd-dddd',
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 2), digits.substring(2)];
        },
        phoneExtractor: phoneUtils.defaultExtractor,
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'LV': {
        code: '371',
        mask: '+(371) dddddddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          return ['', value];
        },
        phoneExtractor: function (value) {
          if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
          let regex = /\+?\((\d+)\)\s*(\d*)/;
          var m = value.match(regex);
          return (m && m[2]) ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
        },
        phoneStringMaker: function (p) {
          if (!p) return '';
          return `+(371) ${p.area_code}${p.number}`;
        }
      },
      'LV_UNFILLED': {
        code: '371',
        mask: '+(371) 99999999',
        phoneExtractor: function (value) {
          if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
          let regex = /\+?\((\d+)\)[\s_]*(\d*)/;
          var m = value.match(regex);
          return (m && m[2]) ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
        },
        phoneStringMaker: function (p) {
          if (!p) return '';
          return `+(371) ${p.area_code}${p.number}`;
        }
      },
      'LV_DIRTY': {
        code: '371',
        mask: '+(371) 99999999',
        phoneExtractor: function (value) {
          if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
          let regex = /\+?\((\d+)\)[\s_]*(\d*)/;
          var m = value.match(regex);
          return (m && m[2]) ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
        },
        phoneStringMaker: function (p) {
          if (!p) return '';
          return `+(371) ${p.area_code}${p.number}`;
        }
      },
      'RU_UNFILLED': {
        code: '7',
        mask: '+7(999) 999-9999',
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          return ['', '7', digits.substr(1, 3), digits.substr(4), ''];
        },
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'RU_DIRTY': {
        code: '7',
        mask: '+7(999) 999-9999',
        phoneExtractor: function (value) {
          var normalized = value.replace('-', '');
          return /(\+.)\((.{3})\)\s(.{7})/.exec(normalized);
        },
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'RU': {
        code: '7',
        mask: '+7(ddd) ddd-dddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 3), digits.substring(3)];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 10) {
            return ['', '7', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
          }
          return ['', '7', '', '', ''];
        },
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'BLR': {
        code: '7',
        mask: '+7(ddd) ddd-dddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 3), digits.substring(3)];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 10) {
            return ['', '7', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
          }
          return ['', '7', '', '', ''];
        },
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'CH': {
        code: '86',
        mask: '+86 (ddd) ddd-dd-dd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          return [value.substring(0, 3), value.substring(3)];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 10) {
            return ['', '86', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
          }
          return ['', '86', '', '', ''];
        },
        phoneStringMaker: phoneUtils.defaultStringMaker
      },
      'DE': {
        code: '49',
        rules: {
          "9": null,
          "d": /\d/
        },
        mask: '+49 (dd dd) dd dd dd',
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 8) {
            return [digits.substring(0,3), digits.substring(3)];
          }
          return ['', ''];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          //console.log("digits",digits);
          if (digits.length >= 10) {
            console.log(digits.substring(digits.length - 10, digits.length - 6), digits.substring(digits.length - 6));
            return ['', '49', digits.substring(digits.length - 10, digits.length - 6), digits.substring(digits.length - 6), ''];
          }
          return ['', '49', '', '', ''];
        },
        phoneStringMaker: function (p) {
          if (!p) return '';
          if (p.area_code && p.area_code.length >= 4 && p.number && p.number.length >= 6) {
            return `+${p.country_code} (${p.area_code.substr(0, 2)} ${p.area_code.substr(2, 2)}) ${p.number.substr(0, 2)} ${p.number.substr(2, 2)} ${p.number.substr(4, 2)}`;
          }
          return `+${p.country_code} (${p.area_code}) ${p.number}`;
        }
      }
    };
  }
}

export default phoneUtils;
