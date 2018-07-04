"use strict";

import {getServiceDuration} from "../taxonomies";
import {ScheduleSlotsIterator, cutSlotsWithoutBusyBounds} from "./scheduleSlots";
import {getCracVectorSlotSize, prepareBitset, _findBack0, getFirstLastMinutes, isSlotAvailable, 
  calcCRACSlotIntermediate} from '../../bower_components/crac-utils/src';

const ANY = 'ANY';

let assert = console.assert ? console.assert.bind(console) : function() {};

export class ScheduleCracSlotsIterator extends ScheduleSlotsIterator {
  /**
   * 
   * @param {number} start
   * @param {number} duration
   * @param {boolean} available
   * @return {{start: number, end: number, duration: number, available: boolean}}
   * @private
   */
  static createSlot(start, duration, available) {
    assert(start >= 0 && start < 1440, 'Start should be more or equal than 0 and less than 1440');
    assert(duration > 0, 'Duration should be more than 0');
    return {
      start: start,
      end: start + duration,
      duration: duration,
      available: available
    };
  }
  
  /**
   * 
   * @param {Array<number>} bitset
   * @param {number} vectorSlotSize
   * @param {number} duration
   * @param {number} scheduleSlotSize
   * @param {function|null} enhanceSlotFn функция для изменения формата слота/добавления дополнительных данных для него
   */
  constructor(bitset, vectorSlotSize, duration, scheduleSlotSize, enhanceSlotFn = null) {
    super();
    this.bitset = bitset;
    this.vectorSlotSize = vectorSlotSize;
    this.duration = duration;
    this.slotSize = scheduleSlotSize;
    this.enhanceSlotFn = enhanceSlotFn;
    this.curSlot = null;
    this._initializeDayBounds();
  }

  /**
   * Инициализация границ набора слотов за день. 
   * Если набор слотов пустой, то устанавливает {start:0, end:0}.
   * 
   * @private
   */
  _initializeDayBounds() {
    let bounds = getFirstLastMinutes(this.bitset, this.vectorSlotSize);
    this.dayBounds = {start: bounds.start || 0, end: bounds.end || 0};
  }

  /**
   * Если начальная или конечная даты слота выходят за рамки дня - возвращает число, меньше нуля.
   * 
   * Если текущий слот неактивный и "заканчивается" на свободное время - сдвинуть его вперёд на позицию 
   * первого свободного бита. Если слот при этом стал свободным, то сохранить позицию, в противном случае, 
   * вернуть позицию. Возможно сделать наоборот - если предыдущий занятый слот заканчивается на свободное время, 
   * то сдвинуть текущий слот назад (под "заканчивается" понимаю крайний правый бит в слоте, который уже
   * не будет участвовать в следующем, с учётом шага сетки).
   * 
   * @param {number} prevStart начало предыдущего слота в минутах от начала дня (если -1, то возвращает начало дня)
   * @private
   */
  _lookupNextSlot(prevStart) {
    let start, end;
    start = prevStart === -1 ? this.dayBounds.start : prevStart + this.slotSize;
    end = start + this.duration;
    if (end > this.dayBounds.end) {
      return {start: -1, duration: false};
    }
    
    let available = isSlotAvailable(this.bitset,
        start,
        start + this.duration,
        this.vectorSlotSize);
    
    if (!available) {
      // Необходимо проверить конечный бит - если это 1, то пройтись по вектору, найдя первый 0 бит.
      // Следующая за ним позиция и будет искомой.
      // Затем проверим, будет ли в новой позиции слот доступным для записи.
      
      const lastBitPosition = Math.floor((start + this.slotSize - 1) / this.vectorSlotSize);
      const p = {i:lastBitPosition >> 5, b:lastBitPosition % 32};
      const offset = _findBack0(this.bitset, p, this.slotSize);
      if (offset > 0) {
        let checkStart = start + (this.slotSize - offset * this.vectorSlotSize);
        available = isSlotAvailable(this.bitset, checkStart, checkStart + this.duration, this.vectorSlotSize);
        if (available) start = checkStart;
      }
    }

    return {start, available};
  }
  
  createSlot(start, available) {
    if (start < 0) return null;
    
    let slot = ScheduleCracSlotsIterator.createSlot(
      start,
      this.duration,
      available);
    
    return this.enhanceSlotFn ? this.enhanceSlotFn(slot) : slot;
  }

  nextSlot() {
    // first call or next one
    let {start, available} = this.curSlot === null ? this._lookupNextSlot(-1) : 
      this._lookupNextSlot(this.curSlot.start);
    return this.curSlot = this.createSlot(start, available);
  }

  isSlotAvailable() {
    if (this.curSlot === null) return false;
    return this.curSlot.available;
  }
}

/**
 * Данный класс инкапсулирует данные CRAC и, в случае необходимости, на их основе "нарезает слоты".
 * Данный класс ничего не должен знать про структуру данных бизнеса. Его сфера ответственности - данные CRAC.
 * Если необходимо использовать данные бизнеса - передавайте их через параметры функций или свойства объекта.
 */
export class ScheduleCRACSlots {

  /**
   * 
   * @param {*} cracData raw CRAC data
   * @param {function(ScheduleSlotsIterator)} cutSlotsFn
   */
  constructor(cracData, cutSlotsFn = cutSlotsWithoutBusyBounds) {
    this._cracData = cracData;
    this._cutSlotsFn = cutSlotsFn;
  }

  /**
   * Create all slots from raw CRAC data.
   * 
   * @param {string} resourceID specific resource. Could be 'ANY' for any available
   * @param {number} duration
   * @param {number} slotSize
   * @param {function|null} enhanceSlotFn
   * @returns {Object} slots
   */
  cutSlots(resourceID, duration, slotSize, enhanceSlotFn = null) {
    const cutSlots = this._cutSlotsFn;

    return this._cracData.slots.reduce(function (ret, cracDay) {
      let bitset
        , vectorSlotSize;
      
      if (ANY === resourceID) {
        const intersection = calcCRACSlotIntermediate(cracDay);
        vectorSlotSize = getCracVectorSlotSize(intersection);
        bitset = prepareBitset(intersection, vectorSlotSize);
      } else {
        const isExcluded = cracDay.excludedResources && cracDay.excludedResources.indexOf(resourceID) !== -1;
        if (!isExcluded) {
          const resourceData = cracDay.resources.find(r => r.resourceId === resourceID);
          if (resourceData) {
            vectorSlotSize = getCracVectorSlotSize(resourceData.bitset);
            bitset = prepareBitset(resourceData.bitset, vectorSlotSize);
          }
        }
      }

      if (bitset) {
        const dayKey = cracDay.date.substr(0, 10);
        let iterator = new ScheduleCracSlotsIterator(bitset, vectorSlotSize, duration, slotSize, enhanceSlotFn);
        ret[dayKey] = cutSlots(iterator);
      }

      return ret;
    }, {});
  }
}

/**
 * Принимает на вход объект-хранилище слотов ScheduleCRACSlots, биизнес данные, работника, услугу
 * и возвращает готовый набор слотов.
 * 
 * @param cracSlots
 * @param business
 * @param taxonomy
 * @param worker
 * @param enhanceSlotFn
 * @return {Object|Array|*|void}
 */
export function cutCRACBusinessSlots(cracSlots, business, taxonomy, worker, enhanceSlotFn) {
  assert(cracSlots instanceof ScheduleCRACSlots, 'cracSlots should be instance of ScheduleCRACSlots');
  let taxDuration = getServiceDuration(taxonomy, worker);
  const widgetConfiguration = business.widget_configuration;
  let forceSlotSize = widgetConfiguration && widgetConfiguration.displaySlotSize && 
      widgetConfiguration.displaySlotSize < taxDuration;
  let slotSize = forceSlotSize ? widgetConfiguration.displaySlotSize : taxDuration;
  return cracSlots.cutSlots(worker.id, taxDuration, slotSize, enhanceSlotFn);
}
