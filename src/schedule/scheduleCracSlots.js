"use strict";

import _ from 'lodash';
import {isDateForbidden} from "../busySlots"
import moment from 'moment-timezone';
import {getBusinessDateLikeUTC} from "../dateTime";
import {getServiceDuration} from "../taxonomies";
import {
  ScheduleSlotsIterator,
  cutSlots,
  cutSlotsWithoutBusy,
  cutSlotsWithoutStartBusy,
  cutSlotsWithoutStartFinishBusy,
  GCD,
} from "./scheduleSlots";
import {getCracVectorSlotSize, _findBack0, getFirstLastMinutes,
  isSlotAvailable} from 'crac-utils/src';
import {CRACResourcesAndRoomsSlot} from "./CRACResponse";

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
    this.nowMinutes = -1;
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
      const offset = _findBack0(this.bitset, p, Math.floor(this.slotSize / this.vectorSlotSize));
      if (offset > 0) {
        let checkStart = start + (this.slotSize - offset * this.vectorSlotSize);
        available = isSlotAvailable(this.bitset, checkStart, checkStart + this.duration, this.vectorSlotSize);
        if (available) start = checkStart;
      }
    }

    if (this.nowMinutes >= 0) {
      if (start < this.nowMinutes) available = false;
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
 * Данный класс инкапсулирует данные CRAC по одному дню и, в случае необходимости,
 * на их основе "нарезает слоты" за этот день.
 * Данный класс ничего не должен знать про структуру данных бизнеса. Его сфера ответственности - данные CRAC.
 * Если необходимо использовать данные бизнеса - передавайте их через параметры функций или свойства объекта.
 */
export class ScheduleCRACDaySlots {

  /**
   *
   * @param {CRACResourcesAndRoomsSlot} cracDay raw CRAC data
   * @param {Date} businessNow now time in business timezone (in tz_like_utc representation)
   * @param {function(ScheduleSlotsIterator)} cutSlotsFn
   * @param {function(ScheduleSlotsIterator)} cutSlotsThisDayFn
   */
  constructor(cracDay, businessNow, cutSlotsFn = cutSlots, cutSlotsThisDayFn = cutSlotsWithoutStartBusy) {
    this.cracDay = cracDay;
    this.businessNow = businessNow;
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
  cutSlots(resourceID, duration, slotSize, enhanceSlotFn = null) {
    if(this.isDayBefore()){
      return [];
    }
    const iterator = this.getSlotsIterator(resourceID, duration, slotSize, enhanceSlotFn);
    const _cutSlots = this.isThisDay() ? this.cutSlotsThisDayFn : this.cutSlotsFn;
    return iterator ? _cutSlots(iterator) : null;
  }

  getSlotsIterator(resourceID, duration, slotSize, enhanceSlotFn = null) {
    const cracDay = this.cracDay;
    const bitset = ANY === resourceID ? cracDay.getResourceUnionBitset() :
      cracDay.getResourceBitset(resourceID);
    if (bitset) {
      const vectorSlotSize = getCracVectorSlotSize(bitset);
      const iterator = new ScheduleCracSlotsIterator(bitset, vectorSlotSize, duration, slotSize, enhanceSlotFn && enhanceSlotFn.bind(cracDay));
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

/**
 * Возвращает готовый набор слотов для случая выбора нескольких последовательно идущих услуг.
 *
 * Суммируем продолжительность услуг.
 *
 * @param {CRACResourcesAndRoomsSlot} cracDay
 * @param business
 * @param multiServices
 * @param worker
 * @param enhanceSlotFn
 * @return {Object|Array|*|void}
 */
export function getSlotsFromBusinessAndCRACMultiServices(cracDay, business, multiServices, worker, enhanceSlotFn) {
  let totalDuration = multiServices.reduce((sum, taxonomy) => sum + getServiceDuration(taxonomy, worker), 0);
  return getSlotsFromBusinessAndCRACWithDuration(cracDay, business, worker.id, totalDuration, enhanceSlotFn);
}

/**
 * Принимает на вход объект-хранилище слотов CRACResourcesAndRoomsSlot, биизнес данные, работника, услугу
 * и возвращает готовый набор слотов.
 *
 * @param {CRACResourcesAndRoomsSlot} cracDay
 * @param business
 * @param taxonomy
 * @param worker
 * @param enhanceSlotFn
 * @return {Object|Array|*|void}
 */
export function getSlotsFromBusinessAndCRAC(cracDay, business, taxonomy, worker, enhanceSlotFn) {
  let taxDuration = getServiceDuration(taxonomy, worker);
  return getSlotsFromBusinessAndCRACWithDuration(cracDay, business, worker.id, taxDuration, enhanceSlotFn)
}

export function getSlotsFromBusinessAndCRACWithDuration(cracDay, business, workerID, taxDuration, enhanceSlotFn) {
  assert(cracDay instanceof CRACResourcesAndRoomsSlot, 'cracDay should be instance of CRACResourcesAndRoomsSlot');
  const widgetConfiguration = business.widget_configuration;
  const isForbidden = isDateForbidden(widgetConfiguration, cracDay.date);
  if(isForbidden){
    return [];
  }
  let forceSlotSize = widgetConfiguration && widgetConfiguration.displaySlotSize &&
      widgetConfiguration.displaySlotSize < taxDuration;
  let slotSize = forceSlotSize ? widgetConfiguration.displaySlotSize : taxDuration;
  let cutSlots = widgetConfiguration.hideGraySlots ? cutSlotsWithoutBusy : cutSlots;
  let now = business.general_info && business.general_info.min_booking_time ?
            moment.utc().add(business.general_info.min_booking_time, 'h') : moment.utc();
  let businessNow = getBusinessDateLikeUTC(now, {business}).toDate();
  let res = cracDay.resources.find((res) => res.id === workerID);
  if (res && res.durations.length) {
    // supported only one taxonomy
    slotSize = res.durations[0] || slotSize;
  }
  const scheduleCRACSlots = new ScheduleCRACDaySlots(cracDay, businessNow, cutSlotsWithoutStartFinishBusy, cutSlotsWithoutStartFinishBusy);
  return scheduleCRACSlots.cutSlots(workerID, taxDuration, slotSize, enhanceSlotFn);
}


/**
 * Принимает на вход объект-хранилище слотов CRACResourcesAndRoomsSlot, биизнес данные, работника, комплексную услугу,
 * список работников выполняющих некоторые из составляющих комплексную услуг
 *
 *
 * @param {CRACResourcesAndRoomsSlot} cracDay
 * @param business
 * @param {string} resourceId
 * @param {Number} slotSize
 * @param enhanceSlotFn
 * @param resourceList
 * @param taxonomy
 * @return {Object|Array|*|void}
 */
export function getSlotsFromBusinessAndCRACWithAdjacent(cracDay, business, resourceId, slotSize, enhanceSlotFn, resourceList, taxonomy) {
  let useAdjacentTaxonomies = !!business.backoffice_configuration.useAdjacentTaxonomies;
  let useATSlotSplitting = !!business.backoffice_configuration.useAdjacentTaxonomiesSlotSplitting;
  let ATTreshold = business.backoffice_configuration.adjacentTaxonomiesTreshold || 0;
  let gcd = 0;
  let DIFF_SLOTS_VARIABLE = 5;
  if(taxonomy.adjacentTaxonomies && taxonomy.adjacentTaxonomies.length){
    taxonomy.adjacentTaxonomies.sort((a,b) => {
      return a.order > b.order ? 1 : -1;
     });
  }
  let adjasentTaxonomies = _.cloneDeep(taxonomy.adjacentTaxonomies) || [];
  if (!useAdjacentTaxonomies || adjasentTaxonomies.length === 0) {
    const cracRes = _.find(cracDay.resources, { id: resourceId });
    const slotSizeRes = cracRes.durations[0] || slotSize;

    return getSlotsFromBusinessAndCRACWithDuration(cracDay, business, resourceId, slotSizeRes, enhanceSlotFn)
  }
  if ( useATSlotSplitting ) {
    gcd = GCD( adjasentTaxonomies.map( t => +t.slotDuration ) );
    // we need to remove possible step between first slots,
    // if start time is not a multiple
    if ( gcd > DIFF_SLOTS_VARIABLE && gcd % DIFF_SLOTS_VARIABLE === 0 ) {
      gcd = DIFF_SLOTS_VARIABLE;
    }
  }
  adjasentTaxonomies.forEach((tax) => {
    if (!tax.slots) {
      tax.slots = [];
    }
    let slotSizeTax = gcd || tax.slotDuration

    if (!tax.isAnyAvailable) {
      const taxSlots = getSlotsFromBusinessAndCRACWithDuration(cracDay, business, resourceId, slotSizeTax);
      tax.slots.push(taxSlots);
    } else {
      const taxResourceList = getResourceListByTaxID(tax.taxonomyID, resourceList);
      taxResourceList.forEach((r) => {
        const taxSlots = getSlotsFromBusinessAndCRACWithDuration(cracDay, business, r, slotSizeTax);
        tax.slots.push(taxSlots);
      });
    }
  });

  return combineAdjacentSlots( adjasentTaxonomies, enhanceSlotFn && enhanceSlotFn.bind(cracDay), gcd, ATTreshold, taxonomy );
}

/**
 * Filtering resourceList by taxonomy
 *
 * @param {String} taxonomyId
 * @param {Array[Resource]} resourceList
 */
function getResourceListByTaxID( taxonomyId, resourceList ) {
  let result = [];
  resourceList.forEach( ( res ) => {
    if ( res && res.taxonomies && res.taxonomies.indexOf( taxonomyId ) >= 0 ) {
      result.push( res.id );
    }
  } );

  return result;
}

/**
 * combine slots for adjacent taxononmy
 * by slots of simple taxonomies in adjacentTaxonomy
 *
 * @param {*} resTaxData
 * @param {*} enhanceSlotFn
 * @param {Number} gcd - greather common delimeter
 * @param {Number} treshold - possible time between slots
 * @param {Taxonomy} taxonomy - original taxonomy
 * @returns {Array[Slot]} slots
 */
function combineAdjacentSlots( adjasentTaxonomies, enhanceSlotFn, gcd, treshold, taxonomy ) {
  var sameTimeStart = taxonomy.adjacentSameTimeStart;
  const slots = [];
  if ( !adjasentTaxonomies[ 0 ].slots || adjasentTaxonomies[ 0 ].slots.length === 0 ) {
    return [];
  }
  let startTime = 1440;
  let endTime = 0;
  adjasentTaxonomies[ 0 ].slots.forEach( ( taxSlots ) => {
    if ( taxSlots.length === 0 ) {
      return;
    }
    startTime = Math.min( taxSlots[ 0 ].start, startTime )
    const taxSlotsCnt = taxSlots.length;
    endTime = Math.max( taxSlots[ taxSlotsCnt - 1 ].end, endTime );
  } );

  let step = gcd;
  if(sameTimeStart && gcd === 0 ){
    step = _.minBy(adjasentTaxonomies, t=>t.slotDuration);
    if(taxonomy.duration < step){
      step = taxonomy.duration;
    }
  }

  let time = startTime;
  while ( time < endTime ) {
    if(sameTimeStart){
      var adjacentSameTimeSlot = checkAdjacentSameTimeSlot(adjasentTaxonomies, time, step, gcd);
      if(adjacentSameTimeSlot.available){
        adjacentSameTimeSlot.start = time;
        adjacentSameTimeSlot.duration = taxonomy.duration;
        if ( enhanceSlotFn ) {
          adjacentSameTimeSlot = enhanceSlotFn( adjacentSameTimeSlot );
        }
        slots.push( adjacentSameTimeSlot );
      }
      time = adjacentSameTimeSlot.available ? time + taxonomy.duration : time + step;
    } else {
      let adjacentSlot = checkAdjacentSlot( adjasentTaxonomies, { end:time }, 0, gcd, treshold );
      adjacentSlot.start = adjacentSlot.available ? adjacentSlot.adjasentStart[ 0 ] : time;
      adjacentSlot.duration = adjacentSlot.end - time;
      if ( enhanceSlotFn ) {
        adjacentSlot = enhanceSlotFn( adjacentSlot );
      }
      slots.push( adjacentSlot );
      //TODO: we can add some option per taxonomy to cut slots by duration of first taxononmy
      time = adjacentSlot.end;
    }
  }

  return slots.filter( function ( s ) { return s.available });
}
/**
 * Searching slot with needed duration in slots
 * by finding chain of slots, that create duration that we need.
 *
 * If treshold is bigger then duration we can start start chain
 * from the scratch several times
 * @param {*} slots
 * @param {*} adjasentTaxonomies
 * @param {*} level
 * @param {*} time
 * @param {*} gcd
 * @param {*} treshold
 * @returns {} slot | false
 */
function findAvailableSlot( slots, adjasentTaxonomies, level, time, gcd, treshold ) {
  var duration = adjasentTaxonomies[ level ].slotDuration;
  var slotsCnt = gcd === 0 ? 1 : Math.round(duration / gcd);
  var start_slot = time;
  var end_slot = start_slot + treshold + duration;
  var prevSlot;
  var slotRangeCheck = function(s) {
    if(!s.available){
      return false;
    }
    if (slotsCnt === 1) {
      return s.start >= start_slot && s.end<=end_slot;
    }

    return (s.start <= start_slot && s.end > start_slot)
    || (s.start < end_slot && s.end >= end_slot)
    || (s.start >= start_slot && s.end <= end_slot)

  }

  var slotsChain = (slots || []).reduce( function ( ret, s ) {
    if ( slotRangeCheck(s) &&
      ( !prevSlot || prevSlot.end == s.start ) ) {
      prevSlot = s;
      ret.push( s );
    } else if ( ret.length < slotsCnt ) {
      ret = [];
      prevSlot = undefined;
    }

    return ret;
  }, [] );

  if ( slotsChain.length < slotsCnt ) {
    return false;
  }

  slotsChain = slotsChain.splice( 0, slotsCnt );

  return {
    start: slotsChain[ 0 ].start,
    end: slotsChain[ slotsCnt - 1 ].end,
    available: true,
    duration: adjasentTaxonomies[ level ].slotDuration,
  }
}
/** Check do we have slots for taxonomy from adjacent taxononmy.
 *  We start from taxonomy with order = 1 and
 *  if it has available slot - we add taxonomy duration and check next taxonomy slots
 *
 * @param {Array} adjasentTaxonomies
 * @param {Slot} prevSlot
 * @param {Number} level
 * @param {Number} gcd
 * @param {Number} treshold
 * @return {Slot}
 */
function checkAdjacentSlot( adjasentTaxonomies, prevSlot, level, gcd, treshold ) {
  let time = prevSlot.end;
  let adjasentStart = prevSlot.adjasentStart || [];
  let slot;
  adjasentTaxonomies[ level ].slots.forEach( ( resSlots ) => {
    if ( slot ) {
      return false;
    }
    if ( !treshold && ( !gcd || gcd == adjasentTaxonomies[ level ].slotDuration ) ) {
      slot = (resSlots || []).find( function ( s ) {
        return s.start === time && s.available;
      } );
    } else {
      slot = findAvailableSlot( resSlots, adjasentTaxonomies, level, time, gcd, treshold );
    }
  } );

  if ( slot ) {
    slot.adjasentStart = adjasentStart || [];
    slot.adjasentStart.push( slot.start );
    if ( adjasentTaxonomies.length === ( level + 1 ) ) {
      return slot;
    } else {
      return checkAdjacentSlot( adjasentTaxonomies, slot, level + 1, gcd, treshold );
    }
  }


  // if slot for some taxonomy was disabled we should skip duration of first taxonomy
  let startTime = level === 0 ? time : time - adjasentTaxonomies[ level - 1 ].slotDuration;
  let endTime = level === 0 ? time + adjasentTaxonomies[ 0 ].slotDuration : time;
  return {
    start: startTime,
    end: endTime,
    available: false,
    duration: adjasentTaxonomies[ 0 ].slotDuration,
  };
}

/**
 *
 * @param {*} adjasentTaxonomies
 * @param {*} time
 * @param {Number} step
 */
function checkAdjacentSameTimeSlot(adjasentTaxonomies, time, step, gcd) {
  let available = true;
  adjasentTaxonomies.forEach((tax, index) => {
    if (!available) {
      return;
    }
    available = _.some(
      tax.slots,
      s => !!findAvailableSlot(s, adjasentTaxonomies, index, time, gcd, 0)
    );
  });
  return {
    start: time,
    end: time + step,
    duration: step,
    available: !!available,
    adjasentStart: adjasentTaxonomies.map(t => time)
  };
}
