"use strict";

import * as _ from 'lodash';
import {isDateForbidden} from "../busySlots"
import moment from 'moment-timezone';
import { applyMinBookingTime } from "../dateTime";
import {
  ScheduleSlotsIterator,
  cutSlots,
  cutSlotsWithoutBusy,
  cutSlotsWithoutStartBusy,
  cutSlotsWithoutStartFinishBusy,
} from "./scheduleSlots";
import {CRACResourcesAndRoomsSlot} from "./CRACResponse";

const ANY = 'ANY';

let assert = console.assert ? console.assert.bind(console) : function() {};

export class ScheduleCracStrictSlotsIterator extends ScheduleSlotsIterator {
  /**
   *
   * @param {number} start
   * @param {number} end
   * @param {boolean} available
   * @return {{start: number, end: number, duration: number, available: boolean}}
   * @private
   */
  static createSlot(start, end, available) {
    assert(
      start >= 0 && start < 1440,
      "Start should be more or equal than 0 and less than 1440"
    );
    assert(end - start > 0, "Duration should be more than 0");
    return {
      start: start,
      end: end,
      duration: end - start,
      available: available,
    };
  }

  /**
   *
   * @param {Array<Array<number>>} slots
   * @param {object} options
   * @param {Boolean} options.strictSlotCutting strict slot cutting starting from 00:00 with {@link scheduleSlotSize} duration
   * @param {function|null} enhanceSlotFn функция для изменения формата слота/добавления дополнительных данных для него
   */
  constructor(slots, options = {}, enhanceSlotFn = null) {
    super();
    this.slots = slots;
    this.options = options;
    this.enhanceSlotFn = enhanceSlotFn;
    this.nowMinutes = -1;
    this.curSlot = null;
    this.curSlotIndex = null;
  }

  createSlot(start, end) {
    if (start < 0) return null;
    let available = true;
    if (this.nowMinutes >= 0 && start < this.nowMinutes) {
      available = false;
    }

    let slot = ScheduleCracStrictSlotsIterator.createSlot(
      start,
      end,
      available
    );

    return this.enhanceSlotFn ? this.enhanceSlotFn(slot) : slot;
  }

  getNextSingleSlot() {
    const curSlot = this.slots[this.curSlotIndex];
    if (curSlot) {
      let [start, end] = this.slots[this.curSlotIndex];
      this.curSlotIndex += 1;
      return this.createSlot(start, end);
    }
    return this.createSlot(-1, -1);
  }
  getNextSlot() {
    const nextSlot = this.slots[this.curSlotIndex];
    this.curSlotIndex += 1;
    if (!nextSlot) {
      return [-1, -1];
    }

    return nextSlot;
  }
  findNextMultiSlot(startSlot, endPreviousSlot) {
    let [start, end] = this.getNextSlot();
    if (start == -1 && end == -1) {
      return this.createSlot(-1, -1);
    } else if (start != endPreviousSlot) {
      //start build slot from scratch 
      return this.findNextMultiSlot(start, end);
    } else if (end - startSlot >= this.options.slotSize) {
      return this.createSlot(startSlot, end);
    }
    // continut build slot
    return this.findNextMultiSlot(startSlot, end);
  }
  getNextSlotForAllSlots() {
    const curSlot = this.slots[this.curSlotIndex];
    if (curSlot) {
      let [start, end] = this.slots[this.curSlotIndex];
      this.curSlotIndex += 1;
      if (end - start >= this.options.slotSize) {
        return this.createSlot(start, end);
      }
      return this.findNextMultiSlot(start, end);
    }
    return this.createSlot(-1, -1);
  }

  nextSlot() {
    // first call or next one
    if (this.curSlotIndex === null) {
      this.curSlotIndex = 0;
    }
    switch (this.options.appointmentCreateDuration) {
      case "ALL_SLOTS":
        return this.getNextSlotForAllSlots();

      default:
        return this.getNextSingleSlot();
    }
  }

  isSlotAvailable() {
    if (this.curSlotIndex === null) return false;
    return true;
  }
}

/**
 * Данный класс инкапсулирует данные CRAC по одному дню и, в случае необходимости,
 * на их основе "нарезает слоты" за этот день.
 * Данный класс ничего не должен знать про структуру данных бизнеса. Его сфера ответственности - данные CRAC.
 * Если необходимо использовать данные бизнеса - передавайте их через параметры функций или свойства объекта.
 */
export class ScheduleCRACDayStrictSlots {

  /**
   *
   * @param {CRACResourcesAndRoomsSlot} cracDay raw CRAC data
   * @param {Date} businessNow now time in business timezone (in tz_like_utc representation)
   * @param {object} options
   * @param {Boolean} options.strictSlotCutting strict slot cutting starting from 00:00 with {@link scheduleSlotSize} duration
   * @param {function(ScheduleSlotsIterator)} cutSlotsFn
   * @param {function(ScheduleSlotsIterator)} cutSlotsThisDayFn
   */
  constructor(cracDay, businessNow, options = {}, cutSlotsFn = cutSlots, cutSlotsThisDayFn = cutSlotsWithoutStartBusy) {
    this.cracDay = cracDay;
    this.businessNow = businessNow;
    this.options = options;
    this.cutSlotsFn = cutSlotsFn;
    this.cutSlotsThisDayFn = cutSlotsThisDayFn;
  }

  isThisDay() {
    return this.cracDay.date.substr(0, 10) === this.businessNow.toISOString().substr(0, 10);
  }

  isDayBefore() {
    return moment.utc(this.cracDay.date).isBefore(moment.utc(this.businessNow).startOf('day'));
  }

  /**
   * Create all slots from raw CRAC data.
   *
   * @param {string} resourceID specific resource. Could be 'ANY' for any available
   * @param {number} duration
   * @param {number} slotSize
   * @param {function|null} enhanceSlotFn
   * @returns {Array<{start: {number}, end: {number}, available: {boolean}}>} slots
   */
  cutSlots(resourceID, enhanceSlotFn = null) {
    if(this.isDayBefore()){
      return [];
    }
    const iterator = this.getSlotsIterator(resourceID, enhanceSlotFn);
    const _cutSlots = this.isThisDay() ? this.cutSlotsThisDayFn : this.cutSlotsFn;
    return iterator ? _cutSlots(iterator) : null;
  }

  getSlotsIterator(resourceID, enhanceSlotFn = null) {
    const cracDay = this.cracDay;
    let slots =
      ANY === resourceID
        ? cracDay.getResourceUnionSlots()
        : cracDay.resources[0].strictSlots;
    if (Array.isArray(slots)) {
      const iterator = new ScheduleCracStrictSlotsIterator(
        slots,
        this.options,
        enhanceSlotFn && enhanceSlotFn.bind(cracDay)
      );
      // Если текущий день, то необходимо не учитывать слоты времени, которое уже истекло
      if (this.isThisDay()) {
        iterator.nowMinutes = getMinutesFromStartOfDay(this.businessNow);
      }

      return iterator;
    }
    return null;
  }
}

function getMinutesFromStartOfDay(d) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}


export function getStrictSlots(cracDay, business, workerID, enhanceSlotFn, options = {}) {
  assert(cracDay instanceof CRACResourcesAndRoomsSlot, 'cracDay should be instance of CRACResourcesAndRoomsSlot');
  const widgetConfiguration = business.widget_configuration || {};
  const isForbidden = isDateForbidden(widgetConfiguration, cracDay.date);
  if(isForbidden){
    return [];
  }
  const appointmentCreateDurationOption =
    (business.integration_data.mis.options||[]).find(
      (o) => o.name == 'appointmentCreateDuration'
    );
  const appointmentCreateDuration = appointmentCreateDurationOption ? appointmentCreateDurationOption.value : 'ONE_SLOT';
  options.appointmentCreateDuration = appointmentCreateDuration;
  let cutSlots = widgetConfiguration.hideGraySlots ? cutSlotsWithoutBusy : cutSlots;
  const businessNow = applyMinBookingTime(moment.utc(), { business });
  
  const scheduleCRACStrictSlots = new ScheduleCRACDayStrictSlots(cracDay, businessNow, options, cutSlotsWithoutStartFinishBusy, cutSlotsWithoutStartFinishBusy);
  return scheduleCRACStrictSlots.cutSlots(workerID, enhanceSlotFn);
}

