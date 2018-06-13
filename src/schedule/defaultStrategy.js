"use strict";

import _ from 'lodash';
import {getServiceDuration} from '../taxonomies';

export default {
  getSlotSize,
  getNextSlotMinute,
  enhanceSlot,
  postProcessing
};

/**
 * Calculate slot size
 *
 * @param business business data
 * @param taxonomyIDs array of required taxonomies
 * @param resourceID specific resource ID. Could be 'ANY' for any available
 * @returns {*}
 */
export function getSlotSize(business, taxonomyIDs, resourceID) {
  const widgetConfiguration = business.widget_configuration;
  if (widgetConfiguration && widgetConfiguration.displaySlotSize) {
    return widgetConfiguration.displaySlotSize;
  }

  const resourceObj = _.find(business.resources, {id: String(resourceID)});
  return business.taxonomies.filter(function (tax) {
    return taxonomyIDs.indexOf(String(tax.id)) >= 0;
  }).map(function (tax) {
    return getServiceDuration(tax, resourceObj);
  }).reduce(function (ret, duration) {
    return ret + duration;
  }, 0);
}

/**
 * Calculate next slot start minute
 *
 * @param bitset CRAC bitset
 * @param prevSlotStart prev slot start
 * @param prevSlotEnd prev slot end
 * @param vectorSlotSize CRAC bitset slot size
 * @returns {*}
 */
function getNextSlotMinute(bitset, prevSlotStart, prevSlotEnd, vectorSlotSize) {
  return prevSlotEnd;
}

/**
 * Enhance slot with some data not from CRAC
 *
 * @param date date in YYYY-MM-DD format
 * @param slot
 * @returns {*}
 */
function enhanceSlot(date, slot) {
  return slot;
}

/**
 * Do some final slots postprocessing
 *
 * @param date date in YYYY-MM-DD format
 * @param slots
 * @returns {Array.<T>|*}
 */
function postProcessing(date, slots) {
  return slots;
}
