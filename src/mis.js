'use strict';
import _ from 'lodash';

const AVAILABLE_PROVIDER_SETTINS = {
  'kgnja': {
    availActions: ['scheduleUpdate']
  },
  'medexis': {
    availActions: ['scheduleUpdate']
  },
  'onclinic': {
    availActions: ['scheduleUpdate']
  },
  'medwork': {
    availActions: ['scheduleUpdate']
  },
  'ugmk': {
    availActions: ['scheduleUpdate']
  },
  'clinic365': {
    availActions: ['scheduleUpdate']
  },
  'medicina': {
    availActions: ['scheduleUpdate']
  },
  'infoclinica': {
    availActions: ['scheduleUpdate'],
  },
  'ident': {
    availActions: []
  },
  'onec': {
    availActions: ['scheduleUpdate']
  },
  'smclinic': {
    availActions: ['scheduleUpdate']
  },
  'phoenix': {
    availActions: ['scheduleUpdate']
  },
  'helix': {
    availActions: ['scheduleUpdate']
  },

};

const AVAILABLE_PROVIDERS = Object.keys(AVAILABLE_PROVIDER_SETTINS);

var isActiveMISIntegration = function(provider, business, action) {
  return business.integrationData && business.integrationData[provider] &&
    business.integrationData[provider].active &&
    (AVAILABLE_PROVIDER_SETTINS[provider].availActions.indexOf(action) >= 0 ||
      business.integrationData[provider].availActions &&
      business.integrationData[provider].availActions.indexOf(action) >= 0);
}

export function hasActiveMISIntegration(business, action) {
  return _.find(AVAILABLE_PROVIDERS, function(provider) {
    return isActiveMISIntegration(provider, business, action);
  });
};
