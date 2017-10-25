'use strict';


const AVAILABLE_PROVIDER_SETTINS = {
  'kgnja': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'medexis': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'onclinic': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'medwork': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'ugmk': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'clinic365': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'medicina': {
    availActions: ['reserve', 'confirm', 'cancel']
    // hasReservePreparation: true,
    // reservePrepActions: ['fetch_slots']
  },
  'infoclinica': {
    availActions: ['reserve', 'confirm', 'cancel'],
    uploadWorkerImages: true
  },
  'ident': {
    availActions: []
  },
  'onec': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'smclinic': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'phoenix': {
    availActions: ['reserve', 'confirm', 'cancel']
  },
  'helix': {
    availActions: ['reserve', 'confirm', 'cancel']
  },

};

const AVAILABLE_PROVIDERS = Object.keys(AVAILABLE_PROVIDER_SETTINS);


export function hasActiveMISIntegration(business) {
  return _.find(AVAILABLE_PROVIDERS, function(provider) {
    return isActiveMISIntegration(provider, business, action);
  });
};
