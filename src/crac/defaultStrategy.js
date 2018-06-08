"use strict";

import _ from 'lodash';
import * as TaxonomyUtils from '../taxonomies';

export default {
  getDayBounds,
  getSlotSize,
  getNextSlotMinute,
  enhanceSlot,
  postProcessing
};

const INT_BITS = 32;

function minutesFromBitset(bucket, slotIndex, vectorSlotSize) {
  return ((bucket << 5) + slotIndex) * vectorSlotSize;
}

/**
 * Calculate day start and end time
 *
 * @param bitset CRAC bitset
 * @param vectorSlotSize CRAC bitset slot size
 * @returns {{start: *, end: *}}
 */
function getDayBounds(bitset, vectorSlotSize) {
  let startBoundMinutes, endBoundMinutes;
  let startBoundBucket, startBoundIndex, endBoundBucket, endBoundIndex;
  for (let bucket = 1; bucket <= bitset.length; bucket++) {
    if (bitset[bucket] === 0) {
      continue;
    }
    for (let slotIndex = INT_BITS - 1; slotIndex !== 0; slotIndex--) {
      const slotAvailable = bitset[bucket] & (1 << slotIndex);
      if (slotAvailable) {
        if (!startBoundIndex) {
          startBoundBucket = bucket;
          startBoundIndex = INT_BITS - slotIndex - 1;
        }

        endBoundBucket = bucket;
        endBoundIndex = INT_BITS - slotIndex - 1;
      }
    }
  }

  if (startBoundIndex) {
    startBoundMinutes = minutesFromBitset(startBoundBucket, startBoundIndex, vectorSlotSize);
  }
  if (endBoundIndex) {
    endBoundMinutes = minutesFromBitset(endBoundBucket, endBoundIndex + 1, vectorSlotSize);
  }

  return {
    start: startBoundMinutes,
    end: endBoundMinutes
  };
}

/**
 * Calculate slot size
 *
 * @param business business data
 * @param taxonomyIDs array of required taxonomies
 * @param resourceID specific resource ID. Could be 'ANY' for any available
 * @returns {*}
 */
function getSlotSize(business, taxonomyIDs, resourceID) {
  const widgetConfiguration = business.widget_configuration;
  if (widgetConfiguration && widgetConfiguration.displaySlotSize) {
    return widgetConfiguration.displaySlotSize;
  }

  const resourceObj = _.find(business.resources, {id: String(resourceID)});
  const totalDuration = business.taxonomies.filter(function (tax) {
    return taxonomyIDs.indexOf(String(tax.id)) >= 0;
  }).map(function (tax) {
    return TaxonomyUtils.getServiceDuration(tax, resourceObj);
  }).reduce(function (ret, duration) {
    return ret + duration;
  }, 0);
  return totalDuration;
}

/**
 * Caclulate next slot start minute
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
