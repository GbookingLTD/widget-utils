"use strict";

export class ScheduleSlotsIterator {
  /**
   * @return {boolean}
   */
  isSlotAvailable() {}

  /**
   * @return {{start: {number}, end: {number}, available: {boolean}}}
   */
  nextSlot() {}
}

/**
 * Create day slots from abstract slots iterator.
 * @param {ScheduleSlotsIterator} iterator
 * @returns {Array} day slots
 */
export function cutSlots(iterator) {
  let slot, slots = [];
  while (slot = iterator.nextSlot()) {
    slots.push(slot);
  }

  return slots;
}

/**
 * Create day slots from abstract slots iterator without busy bound slots.
 * @param {ScheduleSlotsIterator} iterator
 * @returns {Array} day slots
 */
export function cutSlotsWithoutBusyBounds(iterator) {
  let slot, isHead = true, slots = [], availSlots = 0;
  while (slot = iterator.nextSlot()) {
    // skip head busy slots
    if (!slot.available && isHead) continue;
    if (slot.available && isHead) isHead = false;
    slots.push(slot);
    if (!slot.available) availSlots = slots.length - 1;
  }

  // clean tailing busy slots
  return availSlots ? slots.slice(0, availSlots) : [];
}