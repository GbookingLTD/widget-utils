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
 * Контейнер для данных расписания одного дня. 
 * Предоставляет интерфейс к данным такого расписания.
 */
export class ScheduleDay {
  /**
   * @return {boolean}
   */
  isDayAvailable() {}

  /**
   * 
   * @return {Array<{start: {number}, end: {number}, available: {boolean}}>}
   */
  getSlots() {}
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
export function cutSlotsWithoutBusy(iterator) {
  let slot, slots = [];
  while (slot = iterator.nextSlot()) {
    if (slot.available) slots.push(slot);
  }

  return slots;
}