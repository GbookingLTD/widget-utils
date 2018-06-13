"use strict";

import {defaultVectorSlotSize, prepareBitset, getFirstLastMinutes, isSlotAvailable} from '../../bower_components/crac-utils/src';
import defaultStrategy from './defaultStrategy';

const ANY = 'ANY';

/**
 * Create day slots from raw CRAC data.
 * @param date date in YYYY-MM-DD format
 * @param bitset resource CRAC bitset
 * @param vectorSlotSize CRAC bitset slot size
 * @param business business data
 * @param taxonomyIDs array of required taxonomies
 * @param resourceID specific resource ID. Could be 'ANY' for any available
 * @param strategy slot strategy
 * @returns {Array} day slots
 */
function cutSlots(date, bitset, vectorSlotSize, business, taxonomyIDs, resourceID, strategy) {

  const dayBounds = getFirstLastMinutes(bitset, vectorSlotSize);
  const slotSize = strategy.getSlotSize(business, taxonomyIDs, resourceID);

  let slots = [];
  for (let slotMinute = dayBounds.start; slotMinute <= dayBounds.end;) {
    const available = isSlotAvailable(bitset, slotMinute, slotMinute + slotSize, vectorSlotSize);

    let slot = {
      start: slotMinute,
      end: slotMinute + slotSize,
      available: available
    };
    if (strategy.enhanceSlot) {
      slot = strategy.enhanceSlot(date, slot);
    }

    const newSlot = strategy.getNextSlotMinute(bitset, slot.start, slot.end, vectorSlotSize);
    if (newSlot < slotMinute + slotSize) {
      throw new Error("New slot start: " + newSlot + " is less then previous end: " + (slotMinute + slotSize));
    }
    slotMinute = newSlot;
    slots.push(slot);
  }
  return strategy.postProcessing(date, slots);
}

/**
 * Create all slots from raw CRAC data.
 * @param cracData raw CRAC data
 * @param business business data from 'business.get_profile_by_id' request
 * @param taxonomyIDs array of required taxonomies
 * @param resourceID specific resource ID. Could be 'ANY' for any available
 * @param strategy slot strategy
 * @returns {Object} slots
 */
export function makeSlots(cracData, business, taxonomyIDs, resourceID, strategy) {
  const vectorSlotSize = business.widget_configuration.cracSlotSize || defaultVectorSlotSize;

  return cracData.slots.reduce(function (ret, day) {
    const dayKey = day.date.substr(0, 10);
    let bs;

    if (ANY === resourceID) {
      bs = prepareBitset(day.intersection, vectorSlotSize);
    } else {
      const isExcluded = day.excludedResources && day.excludedResources.indexOf(resourceID) !== -1;
      if (!isExcluded) {
        const resourceData = day.resources.find(r => r.resourceId === resourceID);
        if (resourceData) {
          bs = prepareBitset(resourceData.bitset, vectorSlotSize);
        }
      }
    }
    if (bs) {
      ret[dayKey] = cutSlots(dayKey, bs, vectorSlotSize, business, taxonomyIDs, resourceID, strategy || defaultStrategy);
    }
    return ret;
  }, {});
}
