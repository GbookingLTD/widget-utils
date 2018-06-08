"use strict";

import defaultStrategy from './defaultStrategy';

const DEFAULT_CRAC_VECTOR_SLOT_SIZE = 5;
const MINUTES_IN_DAY = 24 * 60;
const INT_BITS = 32;
const ANY = 'ANY';

/**
 * Convert string bitset into int32 array
 * @param bitsetString bitset in string representation
 * @param vectorSlotSize CRAC bitset slot size
 * @returns {Array} int32 bitset
 */
function bitsetStrToInt32Array(bitsetString, vectorSlotSize) {
  const vector = bitsetString.replace(/\./g, '');
  const numberOfTimeUnits = Math.ceil(MINUTES_IN_DAY / vectorSlotSize);

  if (vector.length !== numberOfTimeUnits) {
    throw new Error('Unexpected CRAC vector size. Expected ' + numberOfTimeUnits);
  }
  var int32Count = numberOfTimeUnits >> 5;
  var i, bi, bs = [];
  // fill bitset array
  for (i = 0; i < int32Count; ++i) {
    bs[i] = 0;
  }
  for (i = vector.length - 1; i >= 0; i--) {
    // i  - char index: from numberOfTimeUnits - 1 to 0
    // bi - byte index: from 0 to 8
    bi = (numberOfTimeUnits - 1 - i) >> 5;
    bs[bi] = bs[bi] << 1 | (vector[i] === "1");
  }
  return bs;
}

function prepareBitset(bitset, vectorSlotSize) {
  return (typeof bitset === "string") ? bitsetStrToInt32Array(bitset, vectorSlotSize) : bitset;
}

/**
 * Checking slot availability
 * @param bitset CRAC bitset
 * @param start start time in minutes
 * @param end end time in minutes
 * @param vectorSlotSize CRAC bitset slot size
 * @returns {boolean} availability
 */
function isSlotAvailable(bitset, start, end, vectorSlotSize) {
  for (let time = start; time < end; time += vectorSlotSize) {
    const cracSlotIndex = parseInt(time / vectorSlotSize),
      bucket = cracSlotIndex >> 5,
      bitIndex = cracSlotIndex % INT_BITS;
    const slot = bitset[bucket] & (1 << INT_BITS - bitIndex - 1);
    if (!slot) {
      return false;
    }
  }
  return true;
}

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

  const dayBounds = strategy.getDayBounds(bitset, vectorSlotSize);
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
  const vectorSlotSize = business.widget_configuration.cracSlotSize || DEFAULT_CRAC_VECTOR_SLOT_SIZE;

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
