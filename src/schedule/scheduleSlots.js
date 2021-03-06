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
 * Данный класс служит моделью для визуального представления (или ответа на запрос).
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
 * Контейнер для данных расписания одного дня для данных.
 * Принимает на вход массив слотов и, таким образом, работает тривиальным образом.
 */
export class ScheduleSlotsDay extends ScheduleDay {
  /**
   *
   * @param {Array<{start: {number}, end: {number}, available: {boolean}}>} slots
   * @return {Object|Array|*|void}
   */
  constructor(slots) {
    super();
    this.slots = slots;
  }

  isDayAvailable() {
    return this.slots.length > 0;
  }

  getSlots() {
    return this.slots;
  }
}

/**
 * Create day slots from abstract slots iterator.
 * @param {ScheduleSlotsIterator} iterator
 * @returns {Array} day slots
 */
export function cutSlots(iterator) {
  let slot, slots = [];
  while ((slot = iterator.nextSlot())) {
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
  while ((slot = iterator.nextSlot())) {
    if (slot.available) slots.push(slot);
  }

  return slots;
}

/**
 * Create day slots from abstract slots iterator without start busy slots.
 * @param {ScheduleSlotsIterator} iterator
 * @returns {Array} day slots
 */
export function cutSlotsWithoutStartBusy(iterator) {
  let slot, slots = [];
  // skip unavailable slots from start of day
  while ((slot = iterator.nextSlot()) && !slot.available) {}
  if (!slot) return slots;

  slots.push(slot);
  while ((slot = iterator.nextSlot())) {
    slots.push(slot);
  }

  return slots;
}

/**
 * Create day slots from abstract slots iterator without start and finish busy slots.
 * @param {ScheduleSlotsIterator} iterator
 * @returns {Array} day slots
 */
export function cutSlotsWithoutStartFinishBusy(iterator) {
  let slots = cutSlotsWithoutStartBusy(iterator);
  // skip unavailable slots from end of day
  let lastPosition = -1;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].available) {
      lastPosition = i;
      break;
    }
  }

  return lastPosition < 0 ? [] : slots.slice(0, lastPosition + 1);
}

/**
 * Calculate GCD - greatest common divisor
 * @param {Array} slot sizes
 * @returns {Number} GCD
 */
export function GCD( A ) {
  var n = A.length,
    x = Math.abs( A[ 0 ] );
  for ( var i = 1; i < n; i++ ) {
    var y = Math.abs( A[ i ] );
    while ( x && y ) {
      x > y ? x %= y : y %= x;
    }
    x += y;
  }

  return x;
}
