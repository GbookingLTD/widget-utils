'use strict';

  export function getPhoneSettings(business, options) {
    options = options || {};
    var country = business.general_info.address.length ? business.general_info.address[0].country : "RU";
    country = country || "RU";
    if (options.unfilled && ["RU", "LV"].indexOf(country) >= 0) {
      country += "_UNFILLED";
    }
    if (options.dirty && ["RU", "LV"].indexOf(country) >= 0) {
      country += '_DIRTY';
    }
    return phoneData[country] || phoneData["RU"];
  }

  export function getCountryPhoneSettings(countryCode) {
    return phoneData[countryCode] || phoneData["RU"];
  }

  export function getPhoneString(business, obj) {
    if (obj && obj.phone && obj.phone.length > 0) {
      var phone = getPhoneSettings(business).phoneStringMaker(obj.phone[0]);
      return phone.replace("++", "+");
    }
    return "";
  }

  export function getPhoneSettingsPhone(phoneSettings, phoneString) {
    var data = phoneSettings.phoneExtractor(phoneString);
    var phone = {
      country_code: '',
      area_code: '',
      number: ''
    };
    if (data && data.length) {
      phone.country_code = data[1];
      phone.area_code = data[2];
      phone.number = data[3] + data[4];
    }

    return phone;
  }

  export function getPhone(business, phoneString) {
    return getPhoneSettingsPhone(getPhoneSettings(business), phoneString);
  }

  export function isValidPhone(parsedPhone) {
    return parsedPhone && parsedPhone.country_code &&
      typeof parsedPhone.area_code === "string" && typeof parsedPhone.number === "string" &&
      (parsedPhone.area_code + parsedPhone.number).length >= 6;
  }

  export function getPhoneData(countryCode) {
    return phoneData[countryCode];
  }

  function defaultExtractor(value) {
    let regex = /\+(\d+)\((\d+)\) (\d+)-(\d+)/;
    return value.match(regex);
  }

function defaultStringMaker(p) {
    if (!p || !p.number) return '';
    //let p = person.phone[0];
    let p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
    let p2 = p.number.length > 3 ? p.number.substr(3) : '';
    return `+${p.country_code}(${p.area_code}) ${p1}-${p2}`;
  }

  export function getCountryPhoneDigits(country){
    return countryPhoneDigits[country] || 11;
  }

  var countryPhoneDigits = {
    'UZ': 12,
    'UA': 12
  };

  var phoneData =  {
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
          return defaultStringMaker(p);
        }
      },
      'PS': {
        code: '970',
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
            return ['', '970', value.substring(1, 3), value.substring(3), ''];
          }
          return ['', '970', '', '', ''];
        },
        phoneStringMaker(p){
          if (!p) return '';
          let countryCode = (p.country_code || '').replace("+");
          if (countryCode === "970") {
            return p.number ? `0${p.area_code}${p.number}` : "";
          }
          return defaultStringMaker(p);
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
          return defaultStringMaker(p);
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
        phoneExtractor: defaultExtractor,
        phoneStringMaker: defaultStringMaker
      },
      'UA': {
        code: '380',
        mask: '+380(dd) ddd-dddd',
        rules: {
          "0": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return [digits.substring(0, 2), digits.substring(2)];
        },
        phoneExtractor: function phoneExtractor(value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 11) {
            return ['', '380', digits.substring(digits.length - 9, digits.length - 7), digits.substring(digits.length - 7), ''];
          }
        },
        phoneStringMaker: defaultStringMaker
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
        phoneStringMaker: defaultStringMaker
      },
      'RU_DIRTY': {
        code: '7',
        mask: '+7(999) 999-9999',
        phoneExtractor: function (value) {
          var normalized = value.replace('-', '');
          return /(\+.)\((.{3})\)\s(.{7})/.exec(normalized);
        },
        phoneStringMaker: defaultStringMaker
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
        phoneStringMaker: defaultStringMaker
      },
      'UZ': {
        code: '998',
        mask: '+998dd ddd-dddd',
        rules: {
          "9": null,
          "d": /\d/
        },
        phoneExtractorWidget: function (value) {
          var digits = value.replace(/\D/g, '');
          return ['', digits.substring(digits.length - 9)];
        },
        phoneExtractor: function (value) {
          var digits = value.replace(/\D/g, '');
          if (digits.length >= 10) {
            return ['', '998', '', digits.substring(digits.length - 9), ''];
          }
          return ['', '998', '', '', ''];
        },
        phoneStringMaker: function (p) {
          if (!p || !p.number) return '';
          var p1 = p.number.length > 3 ? p.number.substr(0, 2) : '';
          var p2 = p.number.length > 3 ? p.number.substr(2, 3) : '';
          var p3 = p.number.length > 3 ? p.number.substr(5, 4) : '';
          var area_code = p.area_code.length ?  "(" + p.area_code + ") " : "";
          return "+" + p.country_code + area_code + p1 + " " + p2 + "-" + p3;
        },
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
        phoneStringMaker: defaultStringMaker
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
        phoneStringMaker: defaultStringMaker
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
  }

