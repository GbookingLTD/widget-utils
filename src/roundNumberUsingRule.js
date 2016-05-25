export function roundNumberUsingRule(input, businessData, noCommas) {
  if (!input) {
    return 0;
  }

  var roundSettings = {
      rule: 'TWO_DECIMALS',
      value: 10
    },
    country = '';

  if (businessData.business) {
    roundSettings = businessData.business.widget_configuration.discountedPriceRounding;
    var address = businessData.business.general_info.address;
    if (address && address.length && address[0].country) {
      country = businessData.business.general_info.address[0].country;
    }
  }
  else if (businessData.widget_configuration) {
    roundSettings = businessData.widget_configuration.discountedPriceRounding;
    var address = businessData.general_info.address;
    if (address && address.length && address[0].country) {
      country = address.country;
    }
  }

  if (country && country === 'RU' && roundSettings.value && roundSettings.value < 0) {
    roundSettings = {
      rule: 'CUSTOM',
      value: 10
    };
  }

  var output = 0;
  if (roundSettings && roundSettings.rule) {
    if (roundSettings.rule === 'CUSTOM' && roundSettings.value && RegExp(/^\d+$/).test(roundSettings.value)) {
      output = input - (input % roundSettings.value);
      if (input - output >=  roundSettings.value / 2) {
        output +=  roundSettings.value;
      }
      //return output;
    }
    else if (roundSettings.rule === 'NEAREST_INTEGER') {
      output = Math.round(input);
    }
    else {
      output = input.toFixed(2);
    }
  }
  else {
    output = input.toFixed(2);
  }

  if (!noCommas && ['RU', 'FR', 'LV', 'LT', 'UA', 'BY', 'KZ'].indexOf(country) > -1) {
    var outputStr = '' + output;
    output = outputStr.replace('.', ',');
  }
  return output;
}