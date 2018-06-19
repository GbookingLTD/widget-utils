(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('lodash'), require('moment')) :
  typeof define === 'function' && define.amd ? define(['lodash', 'moment'], factory) :
  (global.WidgetUtils = factory(global._,global.moment));
}(this, function (_$1,moment) { 'use strict';

  _$1 = 'default' in _$1 ? _$1['default'] : _$1;
  moment = 'default' in moment ? moment['default'] : moment;

  function setBusinessDateTZ(businessData, date) {
    var timeOffset = businessData.business.general_info.timezone ? parseInt(businessData.business.general_info.timezone, 10) : utcOffset(moment());

    if (isNaN(timeOffset)) {
      date.tz(businessData.business.general_info.timezone);
    } else {
      date.zone(-timeOffset);
    }

    return date;
  }

  var utcOffset = function utcOffset(date) {
    return date.utcOffset ? date.utcOffset() : -date.zone();
  };

  function businessTimezoneUtcOffset(businessData) {
    var curDate = setBusinessDateTZ(businessData, moment.utc());
    return utcOffset(curDate);
  }

  /**
   * The calculation of the beginning of the day for business.
   *
   *  1. save the day, month, year
   *  2. convert the date to timezone business
   *  3. to put the previously stored day, month, year
   *  4. set the start day (in timezone business)
   *
   * @param businessData
   * @param utcDate
   */
  function startBusinessTZDay(businessData, utcDate) {
    var originalDateUnits = _$1.reduce(['year', 'month', 'date'], function (ret, unit) {
      ret[unit] = utcDate.get(unit);
      return ret;
    }, {});

    setBusinessDateTZ(businessData, utcDate);

    _$1.each(originalDateUnits, function (value, unit) {
      utcDate.set(unit, value);
    });

    // If timezone is greater than zero,
    // then add this offset to the time zone's business day was the same
    utcDate.startOf('day');
    var businessUtcOffset = businessTimezoneUtcOffset(businessData);
    if (businessUtcOffset > 0) {
      utcDate.add(businessUtcOffset, 'minute');
    }
  }

  function getDateLikeUTC(date) {
    return moment.utc(date).add(utcOffset(date), 'minute');
  }

  var busySlotsDate = function busySlotsDate(date) {
    return getDateLikeUTC(date).startOf('day').toISOString();
  };

  /**
   * Convert date to business timezone like it UTC
   *
   * @param date
   * @param businessData
   */
  var getBusinessDateLikeUTC = function getBusinessDateLikeUTC(date, businessData) {
    setBusinessDateTZ(businessData, date);
    return getDateLikeUTC(date);
  };

  function busySlotsInterval(date, businessData, daysToFetch) {
    if (!date) {
      date = moment.utc();
    }

    date = getBusinessDateLikeUTC(date, businessData);
    var minBookingTime = getBusinessDateLikeUTC(moment.utc(), businessData);
    businessData.business.general_info.min_booking_time && minBookingTime.add('hours', businessData.business.general_info.min_booking_time);

    if (date < minBookingTime) {
      date = minBookingTime;
    }

    var then = moment(date).add('days', daysToFetch);
    return {
      startDate: busySlotsDate(date),
      endDate: busySlotsDate(then)
    };
  }

  function alignTimeByQuantum(minutes, quantum) {
    return Math.ceil(minutes / quantum) * quantum;
  }

  function alignSlotTime(startTime, slotSize, m, isMoment) {
    var diff = m.diff(startTime, 'minute');
    var alignedDiff = alignTimeByQuantum(diff, slotSize);
    if (isMoment) {
      return startTime.add(alignedDiff, 'minute');
    }
    return startTime.add(alignedDiff, 'minute').toDate();
  }

var DateTime = Object.freeze({
    setBusinessDateTZ: setBusinessDateTZ,
    businessTimezoneUtcOffset: businessTimezoneUtcOffset,
    startBusinessTZDay: startBusinessTZDay,
    getDateLikeUTC: getDateLikeUTC,
    busySlotsInterval: busySlotsInterval,
    alignTimeByQuantum: alignTimeByQuantum,
    alignSlotTime: alignSlotTime
  });

  /**
   * Calculates whether the busy day.
   *
   * For calendar mode not need setup slot size because need to use service duration
   *
   * Не предусматривает случай, когда дискаунт кампания как-то влияет на занятость дня.
   *
   * @deprecated
   * @param day
   * @param taxonomy
   * @param slotSize
   * @param busySlots
   * @param businessData
   * @returns {Array}
   */
  function calculateDaySlotsV1(day, taxonomy, slotSize, busySlots, businessData) {
    var slots = [];
    var finish = moment.utc(day.end_time);

    var businessNow = moment.utc();
    setBusinessDateTZ(businessData, businessNow);
    var businessNowLikeUTC = getDateLikeUTC(businessNow);

    if (businessNowLikeUTC.isSame(day.date, 'day')) {
      if (businessData.business.general_info.min_booking_time) {
        finish.add(-businessData.business.general_info.min_booking_time, 'hours');
      }
    }

    for (var slot_time = moment.utc(day.start_time); slot_time.isBefore(finish);) {
      var dateCheck = checkDate(day.slots, slot_time.toDate(), slotSize);
      var space = dateCheck[0],
          duration = dateCheck[1];
      var spaceLeft = space;
      var busy = false;
      if (spaceLeft === 1 && busySlots.maxSlotCapacity > 0) {
        spaceLeft = -busySlots.maxSlotCapacity;
      }

      if (spaceLeft === 0) {
        var currentSlotBackRange = moment.range(moment(slot_time).add('m', -taxonomy.duration), slot_time);
        /* jshint loopfunc:true */
        slots.forEach(function (s) {
          if (!s.busy) {
            s.busy = s.actualSlot.within(currentSlotBackRange) && !currentSlotBackRange.start.isSame(s.actualSlot);
          }
        });
      }
      if (moment(slot_time).add('m', taxonomy.duration).isAfter(finish)) {
        space = 0;
      }

      var actualSlot = moment(slot_time);

      busy = businessNowLikeUTC.isAfter(actualSlot) || space === 0 || day.forceAllSlotsBusy;

      slots.push({
        actualSlot: actualSlot,
        slotTime: slot_time.format('LT'),
        spaceLeft: -spaceLeft,
        busy: !!busy
      });
      slot_time.add('minutes', slotSize);
    }

    return slots;
  }

  /**
   * @deprecated
   * @param day
   * @param taxonomy
   * @param slotSize
   * @param busySlots
   * @return {Array}
   */
  function calculateDaySlotsV2(day, taxonomy, slotSize, busySlots) {
    var slots = [];
    day.slots.forEach(function (slot) {
      if (!_$1.isUndefined(slot.busy) && slot.busy && _$1.isUndefined(slot.space_left)) {
        return;
      }
      var businessNow = moment.utc();
      var businessNowLikeUTC = getDateLikeUTC(businessNow);

      var slot_time = moment.utc(day.date).add(slot.time, 'm');
      var duration = slot.duration || slotSize;
      var spaceLeft;
      if (!_$1.isUndefined(slot.space_left)) {
        spaceLeft = slot.space_left;
        if (spaceLeft === 1 && busySlots.maxSlotCapacity > 0) {
          spaceLeft = busySlots.maxSlotCapacity;
        }
      } else {
        spaceLeft = busySlots.maxSlotCapacity;
      }

      var actualSlot = moment(slot_time);
      slots.push({
        actualSlot: actualSlot,
        slotTime: slot_time.format('LT'),
        spaceLeft: spaceLeft,
        busy: businessNowLikeUTC.isAfter(actualSlot) || spaceLeft === 0
      });
      slot_time.add('minutes', slotSize);
    });

    return slots;
  }

  /**
   * @deprecated
   * @param slots
   * @param date
   * @param defaultStep
   * @return {*[]}
   */
  function checkDate(slots, date, defaultStep) {
    var result = [1, defaultStep];
    if (slots.busy && slots.busy.length) {
      slots.busy.forEach(function (obj) {
        var slotDuration = obj.duration || defaultStep;
        var busySlotRange = moment.range(moment(obj.time), moment(obj.time).add('m', slotDuration));
        if (moment(date).within(busySlotRange) && !moment(date).isSame(busySlotRange.end)) {
          result = [-obj.space_left, slotDuration];
          return false;
        }
      });
    } else if (!slots.available) {
      result = [0, defaultStep];
    }
    return result;
  }

  /**
   * @deprecated
   * @param dayBusySlots
   * @param date
   * @param defaultStep
   * @return {*[]}
   */
  function checkSlotInterval(dayBusySlots, date, defaultStep) {
    var result = [1, defaultStep];
    if (dayBusySlots.busy && dayBusySlots.busy.length) {
      var targetSlotRange = moment.range(moment(date), moment(date).add(defaultStep, 'minutes'));
      for (var i = 0; i < dayBusySlots.busy.length; i++) {
        var busySlot = dayBusySlots.busy[i];
        var busySlotDuration = busySlot.duration || defaultStep;
        var busySlotRange = moment.range(moment(busySlot.time), moment(busySlot.time).add(busySlotDuration, 'minutes'));
        if (targetSlotRange.intersect(busySlotRange) && !moment(date).isSame(busySlotRange.end)) {
          result = [-busySlot.space_left, busySlotDuration, busySlot.time];
          break;
        }
      }
    } else if (!dayBusySlots.available) {
      result = [0, defaultStep];
    }
    return result;
  }

  /**
   * @deprecated
   * @param day
   * @param crunchv2
   * @param taxonomy
   * @param slotSize
   * @param busySlots
   * @param businessData
   * @return {boolean}
   */
  function isBusyDay(day, crunchv2, taxonomy, slotSize, busySlots, businessData) {
    var calculateDaySlots = crunchv2 ? calculateDaySlotsV2 : calculateDaySlotsV1;
    var slots = calculateDaySlots(day, taxonomy, slotSize, busySlots, businessData);
    var hasFreeSlot = _$1.find(slots, { busy: false });
    return !hasFreeSlot;
  }

  /**
   * @deprecated
   * @param widgetConfiguration
   * @param date
   * @param ignoreStartDate
   * @return {*}
   */
  function isDateForbidden(widgetConfiguration, date, ignoreStartDate) {
    if (ignoreStartDate === null || typeof ignoreStartDate == 'undefined') {
      ignoreStartDate = false;
    }

    if (widgetConfiguration && widgetConfiguration.bookableDateRanges && widgetConfiguration.bookableDateRanges.enabled) {
      var dateMoment = moment(date),
          dateAvailable = true,
          start = widgetConfiguration.bookableDateRanges.start,
          end = widgetConfiguration.bookableDateRanges.end;
      if (start && end && !ignoreStartDate) {
        dateAvailable = dateMoment.isAfter(moment(start).startOf('day')) && dateMoment.isBefore(moment(end).endOf('day'));
      } else if (start && !ignoreStartDate) {
        dateAvailable = dateMoment.isAfter(moment(start).startOf('day'));
      } else if (end) {
        dateAvailable = dateMoment.isBefore(moment(end).endOf('day'));
      }

      return !dateAvailable;
    }
    //bookable weeks calculation
    if (widgetConfiguration.bookableMonthsCount > 0 && widgetConfiguration.bookableMonthsCount < 1) {
      var weeks = Math.round(widgetConfiguration.bookableMonthsCount / 0.23);
      return moment().add(weeks, 'weeks').isBefore(date);
    }

    return !!(widgetConfiguration && widgetConfiguration.bookableMonthsCount > 0 && moment().add('M', widgetConfiguration.bookableMonthsCount - 1).endOf('M').isBefore(date));
  }

var BusySlots = Object.freeze({
    calculateDaySlotsV1: calculateDaySlotsV1,
    calculateDaySlotsV2: calculateDaySlotsV2,
    checkDate: checkDate,
    checkSlotInterval: checkSlotInterval,
    isBusyDay: isBusyDay,
    isDateForbidden: isDateForbidden
  });

  /**
   *
   * Do not supported for GT
   *
   * @param businessData
   * @param busySlots
   * @param slotSize
   * @param day
   * @returns {boolean}
   */
  function calendarBookingTime(businessData, busySlots, slotSize, day, isGT) {
    var widgetConfiguration = businessData.business.widget_configuration;
    if (isDateForbidden(widgetConfiguration, day.date)) {
      return;
    }
    if (isGT) {
      return calendarBookingTimeGT(businessData, busySlots, slotSize, day);
    }
    var slotDay = _$1(busySlots.days).find(function (d) {
      return moment(d.date).isSame(day.date, 'day');
    });
    if (slotDay) {
      var startTime = moment.utc(slotDay.start_time);
      var endTime = moment.utc(slotDay.end_time);

      var now = moment.utc();
      var businessOffset = moment.tz(now, businessData.business.general_info.timezone);
      var businessNow = moment.utc().add(businessOffset._offset, 'm');

      if (businessNow.isSame(startTime, 'day') && businessNow > startTime) {
        startTime = alignSlotTime(startTime, slotSize, businessNow, true);
      }
      businessData.business.general_info.min_booking_time && startTime.add('hours', businessData.business.general_info.min_booking_time);

      for (var slot_time = startTime; slot_time.isBefore(endTime);) {
        var dateCheck = checkDate(slotDay.slots, slot_time);
        if (dateCheck[0] !== 0) {
          return slot_time;
        }
        slot_time.add('minutes', slotSize);
      }
    }
  }

  function calendarBookingTimeGT(businessData, slots, slotSize, day) {

    var slotDay = _$1(slots.days).find(function (d) {
      return moment(d.date).isSame(day.date, 'day');
    });
    var selectedSlot = undefined;
    if (slotDay && slotDay.slots && slotDay.slots.length > 0) {
      for (var i = 0; i < slotDay.slots.length; i++) {
        if (slotDay.slots[i].space_left > 0) {
          var checkSlot = moment.utc(slotDay.date).add(slotDay.slots[i].time, 'm');
          if (checkSlot > moment.utc()) {
            selectedSlot = checkSlot;
            break;
          }
        }
      }
      return selectedSlot;
    }
  }

var Booking = Object.freeze({
    calendarBookingTime: calendarBookingTime
  });

  var TAXONOMY_CHILDREN = 'CHILDREN';
  var TAXONOMY_ADULT = 'PARENT';
  var TAXONOMY_COMMON = 'COMMON';

  function getServiceDuration(taxonomy, resource) {
    if (resource) {
      var taxLevel = (_.find(resource.taxonomyLevels, { id: taxonomy.id }) || {}).level;
      if (typeof taxLevel !== 'undefined') {
        var level = _.find(taxonomy.additionalDurations, { level: taxLevel });
        if (level) {
          return level.duration ? level.duration : taxonomy.duration;
        }
      }
    }
    return taxonomy.duration;
  }

  /**
   * Возвращает минимальную длительность из всех услуг.
   * 
   * Необходимо, например, для получения ближайшего доступного для записи по услуге(-ам) дня.
   * 
   * @param taxonomies
   * @param resources
   */
  function findMinResourceServiceDuration(taxonomies, resources) {
    var minDuration = Number.MAX_SAFE_INTEGER;
    taxonomies.forEach(function (tax) {
      resources.forEach(function (res) {
        var duration = getServiceDuration(tax, res);
        if (duration < minDuration) {
          minDuration = duration;
        }
      });
    });

    return minDuration;
  }

  function setupChildishnes(taxonomies, resources) {
    var C = {}; // child taxonomies
    var P = {}; // adult taxonomies
    var N = {}; // common taxonomies


    if (!Array.isArray(taxonomies) || !Array.isArray(resources)) {
      console.log('empty data');
      return taxonomies;
    }

    resources.forEach(function (r) {
      if (r.taxonomyChildren && r.taxonomyChildren.length > 0) {
        var rChildID = {}; // all tax id where children=true
        var rParentID = {}; // all tax id where children=false

        r.taxonomyChildren.forEach(function (c) {
          if (c !== null && typeof c.children !== 'undefined' && typeof c.taxonomyID !== 'undefined') {
            c.children === true ? rChildID[c.taxonomyID] = true : rParentID[c.taxonomyID] = true;
          }
        });

        r.taxonomyChildren.forEach(function (c) {
          if (c !== null && typeof c.children !== 'undefined' && typeof c.taxonomyID !== 'undefined') {
            // если услуга встречается 2-ды - как взрослая и как детская
            if (rChildID[c.taxonomyID] && rParentID[c.taxonomyID]) N[c.taxonomyID] = true;else if (rChildID[c.taxonomyID]) C[c.taxonomyID] = true;else if (rParentID[c.taxonomyID]) P[c.taxonomyID] = true;
          }
        });
      }
    });

    var getTaxonomyTypes = function getTaxonomyTypes(C, P, N, taxonomyID) {
      var types = [];
      if (C[taxonomyID]) {
        types.push(TAXONOMY_CHILDREN);
      }
      if (P[taxonomyID]) {
        types.push(TAXONOMY_ADULT);
      }
      if (!C[taxonomyID] && !P[taxonomyID] || N[taxonomyID]) {
        types.push(TAXONOMY_COMMON);
      }
      return types;
    };

    taxonomies.forEach(function (t) {
      t.childrenTypes = getTaxonomyTypes(C, P, N, parseInt(t.id));
    });
    return taxonomies;
  }

var taxonomies = Object.freeze({
    getServiceDuration: getServiceDuration,
    findMinResourceServiceDuration: findMinResourceServiceDuration,
    setupChildishnes: setupChildishnes
  });

  var defaultStrategy = {
    getSlotSize: getSlotSize,
    getNextSlotMinute: getNextSlotMinute,
    enhanceSlot: enhanceSlot,
    postProcessing: postProcessing
  };

  /**
   * Calculate slot size
   *
   * @param business business data
   * @param taxonomyIDs array of required taxonomies
   * @param resourceID specific resource ID. Could be 'ANY' for any available
   * @returns {*}
   */
  function getSlotSize(business, taxonomyIDs, resourceID) {
    var widgetConfiguration = business.widget_configuration;
    if (widgetConfiguration && widgetConfiguration.displaySlotSize) {
      return widgetConfiguration.displaySlotSize;
    }

    var resourceObj = _$1.find(business.resources, { id: String(resourceID) });
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

  var minutesInDay = 1440;
  var defaultVectorSlotSize = 5;

  var busyBitSets = {
    5: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  var freeBitSets = {
    5: busyBitSets[5].map(function (num) {
      return ~num >>> 0;
    }),
    1: busyBitSets[1].map(function (num) {
      return ~num >>> 0;
    })
  };

  /**
   * Convert string bitset into int32 array
   * @param str bitset in string representation
   * @param vectorSlotSize CRAC bitset slot size
   * @returns {Array} int32 bitset
   */
  function bitsetStrToInt32Array(str, vectorSlotSize) {
    str = str.replace(/\./g, '');
    vectorSlotSize = vectorSlotSize || defaultVectorSlotSize;
    var numberOfTimeUnits = Math.ceil(minutesInDay / vectorSlotSize);
    if (str.length !== numberOfTimeUnits) throw Error('string bitset should contain ' + numberOfTimeUnits + ' chars');
    var int32Count = numberOfTimeUnits >> 5;
    var i = void 0,
        bi = void 0,
        bs = [];
    // fill bitset array
    for (i = 0; i < int32Count; ++i) {
      bs[i] = 0;
    }
    for (i = str.length - 1; i >= 0; i--) {
      // i  - char index: from numberOfTimeUnits - 1 to 0
      // bi - byte index: from 0 to 8
      bi = numberOfTimeUnits - 1 - i >> 5;
      bs[bi] = bs[bi] << 1 | str[i] === "1";
    }
    return bs;
  }

  function prepareBitset(bitset, vectorSlotSize) {
    return typeof bitset === "string" ? bitsetStrToInt32Array(bitset, vectorSlotSize) : bitset;
  }

  function newBusyBitset(vectorSlotSize) {
    return busyBitSets[vectorSlotSize].slice();
  }

  function newFreeBitset(vectorSlotSize) {
    return freeBitSets[vectorSlotSize].slice();
  }

  /**
   * And operation by bit between 2 sets
   *
   * @param {Array<Number>} setA
   * @param {Array<Number>} setB
   */
  function setAnd(setA, setB) {
    var unifiedSet = [];
    for (var i = 0; i < setA.length; i++) {
      unifiedSet[i] = (setA[i] & setB[i]) >>> 0;
    }
    return unifiedSet;
  }

  /**
   * OR operation by bit between 2 sets
   *
   * @param {Array<Number>} setA
   * @param {Array<Number>} setB
   */
  function setUnion(setA, setB) {
    var unifiedSet = [];
    for (var i = 0; i < setA.length; i++) {
      unifiedSet[i] = (setA[i] | setB[i]) >>> 0;
    }
    return unifiedSet;
  }

  var INT32_SIZE = 32;

  function minutesFromBitset(bucket, slotIndex, vectorSlotSize) {
    return ((bucket << 5) + slotIndex) * vectorSlotSize;
  }

  /**
   * Calculate start and end time
   *
   * @param bitset CRAC bitset
   * @param vectorSlotSize CRAC bitset slot size
   * @returns {{start: *, end: *}}
   */
  function getFirstLastMinutes(bitset, vectorSlotSize) {
    var startBoundMinutes = void 0,
        endBoundMinutes = void 0;
    var startBoundBucket = void 0,
        startBoundIndex = void 0,
        endBoundBucket = void 0,
        endBoundIndex = void 0;
    for (var i = 0; i < bitset.length; ++i) {
      var b = Math.clz32(bitset[i]);
      if (b < INT32_SIZE) {
        startBoundBucket = i;
        startBoundIndex = b;
        break;
      }
    }

    for (var _i = bitset.length - 1; _i >= startBoundBucket; --_i) {
      if (bitset[_i]) {
        for (var _b = INT32_SIZE - 1; _b >= 0; --_b) {
          var bit = bitset[_i] & 1 << INT32_SIZE - _b - 1;
          if (bit) {
            endBoundBucket = _i;
            endBoundIndex = _b;
            break;
          }
        }

        if (endBoundIndex) break;
      }
    }

    if (typeof startBoundIndex !== 'undefined') {
      startBoundMinutes = minutesFromBitset(startBoundBucket, startBoundIndex, vectorSlotSize);
    }
    if (typeof endBoundIndex !== 'undefined') {
      endBoundMinutes = minutesFromBitset(endBoundBucket, endBoundIndex + 1, vectorSlotSize);
    }

    return {
      start: startBoundMinutes,
      end: endBoundMinutes
    };
  }

  /**
   * Находит позицию первой 1 в векторе. 
   * Направление битов - слева направо (от старших к младшим разрядам), поэтому возможно использовать clz внутри числа.
   * 
   * Если не найдено 1 - возвращаем отрицательное число.
   * 
   * @param {{i:number, b:number}} p
   * @param vector
   * @return {*}
   * @private
   */
  function _find1(p, vector) {
    while (p.i < vector.length) {
      p.b = Math.clz32(vector[p.i] << p.b) + p.b;
      // все 0 - проверяем следующее число
      if (p.b >= 32) {
        p.b = 0;
        ++p.i;
        continue;
      }

      // найдена 1 - возвращаем результат
      return 0;
    }

    // весь вектор заполнен 0, возвращаем отрицательное число
    return -1;
  }

  /**
   * Маски левых (старших) единиц от 0 до 32-х (33 элемента в массиве).
   * 
   * 0-й элемент соответствует нулю единиц слева, начиная от 32-й позиции.
   * 1-й элемент соответствует одной единице слева на 32-й позиции и тд. до 32-х.
   * 32-й элемент соответствует 32-м единицам от 32-й до крайней правой позиции.
   * 
   * @type {{}}
   */
  var mask_left1 = [0, 2147483648, 3221225472, 3758096384, 4026531840, 4160749568, 4227858432, 4261412864, 4278190080, 4286578688, 4290772992, 4292870144, 4293918720, 4294443008, 4294705152, 4294836224, 4294901760, 4294934528, 4294950912, 4294959104, 4294963200, 4294965248, 4294966272, 4294966784, 4294967040, 4294967168, 4294967232, 4294967264, 4294967280, 4294967288, 4294967292, 4294967294, 4294967295];

  /**
   * Маски правых (младших) единиц от 0 до 32-х (33 элемента в массиве).
   * 
   * @type {{}}
   */
  var mask_right1 = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535, 131071, 262143, 524287, 1048575, 2097151, 4194303, 8388607, 16777215, 33554431, 67108863, 134217727, 268435455, 536870911, 1073741823, 2147483647, 4294967295];

  /*
  (() => {
  let m = new Array(33);
  m[0] = 0;
  for (let i = 0; i < 32; ++i) {
    // m[32 - i] = (0xffffffff << i) >>> 0; // for mask_left1
    m[32 - i] = 0xffffffff >>> i; // for mask_right1
  }
  return m;
  })()
  */

  /**
   * Заполнение результирующего вектора 1.
   * 
   * @param bitset crac-вектор
   * @param i    начальное смещение элементов массива
   * @param b    начальное смещение в битах в элементе массива
   * @param count количество бит, которое необходимо заполнить
   * @private
   */
  function _fill1(bitset, i, b, count) {
    var left_bound = b;
    var right_bound = Math.min(count + b, INT32_SIZE);
    for (; i < bitset.length && count > 0; ++i) {
      bitset[i] = (bitset[i] | mask_left1[right_bound] & mask_right1[INT32_SIZE - left_bound]) >>> 0;
      count -= right_bound - left_bound;
      left_bound = 0;
      right_bound = count >= INT32_SIZE ? INT32_SIZE : count;
    }
  }

  /**
   * Checking slot availability
   * 
   * @param bitset CRAC bitset
   * @param start start time in minutes
   * @param end end time in minutes (not inclusive)
   * @param vectorSlotSize CRAC bitset slot size
   * @returns {boolean} availability
   */
  function isSlotAvailable(bitset, start, end, vectorSlotSize) {
    var cracSlotIndex = Math.floor(start / vectorSlotSize),
        i = cracSlotIndex >> 5,
        b = cracSlotIndex % INT32_SIZE,
        count = Math.ceil((end - start) / vectorSlotSize);

    if (count === 0) return false;

    var left_bound = b;
    var right_bound = Math.min(count + b, INT32_SIZE);
    for (; i < bitset.length && count > 0; ++i) {
      var slot_mask = (mask_left1[right_bound] & mask_right1[INT32_SIZE - left_bound]) >>> 0;
      if (((bitset[i] | slot_mask) ^ bitset[i]) >>> 0) return false;
      count -= right_bound - left_bound;
      left_bound = 0;
      right_bound = count >= INT32_SIZE ? INT32_SIZE : count;
    }

    return true;
  }

  /**
   * Возвращаем вектор, в котором 1 означает возможность записи на это время с учётом 
   * переданной длительности.
   * 
   * Переходим на первый свободный бит. Очевидно, что все биты до него заняты. 
   * Находим первый занятый бит, идущий за свободным. 
   * Все биты, которые отстоят от этого занятого на расстояние duration будут свободны.
   *
   * Операция "найти первый свободный бит" оптимизирована с помощью операции Math.clz32.
   * Операции заполнения битов используют битовые маски.
   * 
   * Функция имеет сложность O(n), n - количество элементов в массиве (не бит, в отличие от простого итерирования по CRAC-вектору).
   * 
   * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
   * 
   * @param bitset
   * @param offset смещение в crac-векторе
   * @param sz
   * @param vectorSlotSize
   */
  function buildBookingCRACVector(bitset, offset, sz, vectorSlotSize) {
    var r = newBusyBitset(vectorSlotSize);
    var p = {};
    p.i = Math.floor(offset / INT32_SIZE);
    p.b = offset % INT32_SIZE;

    var inverseBitset = bitset.map(function (n) {
      return ~n >>> 0;
    });
    while (p.i < bitset.length) {
      // Находим первую 1 ("свободный" бит).
      // Если достигнут конец входного вектора, то возвращаем результирующий вектор.
      if (_find1(p, bitset) < 0) return r;

      // Все биты до него заняты. 
      // Вектор r и так заполнен 0, поэтому заполнения 0 не требуется.

      // Находим первый 0 ("занятый" бит), начиная с текущей позиции.
      // Если "занятый" бит не был найден, то берём весь оставшийся вектор.
      var pp = { i: p.i, b: p.b };
      _find1(p, inverseBitset);

      // Находим количество бит, которое нужно заполнить
      var prevPos = pp.i * INT32_SIZE + pp.b;
      var pos = p.i * INT32_SIZE + p.b;
      var fillCount = pos - prevPos - sz + 1;
      if (fillCount > 0) {
        // Заполняем результирующий вектор 1
        _fill1(r, pp.i, pp.b, fillCount);
      }
    }

    return r;
  }

  var SLOT_SIZE = 5;
  var VECTOR_SIZE = 24 * 60 / SLOT_SIZE;

  function setSlotSize(slotSize) {
    SLOT_SIZE = slotSize;
    VECTOR_SIZE = 24 * 60 / SLOT_SIZE;
  }

  function getDayBoundsFromCracSlot(date, bitset) {
    bitset = prepareBitset(bitset, SLOT_SIZE);
    var dayBounds = getFirstLastMinutes(bitset, SLOT_SIZE);
    dayBounds.start_time = moment(date).add(dayBounds.start, 'minutes').toISOString();
    dayBounds.end_time = moment(date).add(dayBounds.end, 'minutes').toISOString();
    return dayBounds;
  }

  // Generate crunch-capable data from CRAC.
  // Complexity: O(N), where N = 24hours / 5 minutes
  function cutSlotsFromCrac(cracSlot, date, startMinutes, endMinutes, scheduleStrategy, scheduleSlotSize) {
    var bitset = prepareBitset(cracSlot.bitset, SLOT_SIZE);
    var bitsetTaxonomy = cracSlot.taxonomyBitset ? prepareBitset(cracSlot.taxonomyBitset, SLOT_SIZE) : newFreeBitset();
    bitset = setAnd(bitset, bitsetTaxonomy);

    var dayBounds = getDayBoundsFromCracSlot(date, bitset);
    var slots = cutSlots(date, bitset, SLOT_SIZE, scheduleSlotSize, scheduleStrategy || defaultStrategy);
    return {
      available: _$1.find(slots, { available: true }),
      busy: slots,
      start_time: dayBounds.start_time,
      end_time: dayBounds.end_time
    };
  }

  // Special fix for `$scope.getEmptyDayLabel()` in `desktopwidget` app.
  function isoDateForDayOff(date) {
    return moment(date).toISOString().replace('.000Z', 'Z');
  }

  /**
   * Presence CRAC data type as Crunch' Busy Slots
   *
   * Its need for soft migration from Crunch to CRAC
   *
   * @param  {Array<Object>} cracSlots CRAC response format
   * @param {{}} business
   * @param {Array} taxonomyIDs
   * @param {Array} [resourceIDs = []]
   * @param {*} [scheduleStrategy = null]
   * @return {{taxonomyId: *, slots_size: number, maxSlotCapacity: number, daysOff: Array, excludedResources: Array, days: *}}
   */
  function toBusySlots(cracSlots, business, taxonomyIDs) {
    var resourceIDs = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
    var scheduleStrategy = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;

    var daysOff = [];
    var excludedResources = [];
    var excludedResourcesCountMap = {};

    function excludedResource(resource_id, date) {
      excludedResourcesCountMap[resource_id] = (excludedResourcesCountMap[resource_id] || 0) + 1;
      daysOff.push({ date: date, resource_id: resource_id });
    }

    var busySlotsResponse = {
      taxonomyIDs: taxonomyIDs,
      daysOff: daysOff,
      excludedResources: excludedResources,
      days: _$1.map(cracSlots, function (cracSlot) {
        var date = cracSlot.date;

        var dayBounds;
        dayBounds = getDayBoundsFromCracSlot(date, cracSlot);

        if (!dayBounds) {
          var dayOffDate = isoDateForDayOff(date);
          business.resources.forEach(function (rr) {
            return excludedResource(rr.id, dayOffDate);
          });

          return {
            date: date,
            slots: {
              busy: [],
              available: false
            }
          };
        } else {
          var dayStart = dayBounds.start;
          var startTime = dayBounds.start_time;
          var dayEnd = dayBounds.end;

          var slots = cutSlotsFromCrac(cracSlot, date, dayStart, dayEnd, scheduleStrategy, scheduleStrategy.getSlotSize(business, taxonomyIDs, resourceIDs[0]));

          if (cracSlot.excludedResources) {
            var _dayOffDate = isoDateForDayOff(date);
            cracSlot.excludedResources.forEach(function (rid) {
              return excludedResource(rid, _dayOffDate);
            });
          }

          return {
            date: date,
            start_time: slots.start_time || startTime,
            end_time: slots.end_time || dayBounds.end_time,
            slots: slots
          };
        }
      })
    };

    // Post processing of excludedResources
    var daysCount = busySlotsResponse.days.length;
    for (var resourceId in excludedResourcesCountMap) {
      if (Object.prototype.hasOwnProperty.call(excludedResourcesCountMap, resourceId)) {
        if (excludedResourcesCountMap[resourceId] >= daysCount) {
          excludedResources.push(resourceId);
        }
      }
    }

    return busySlotsResponse;
  }

  /**
   * Return vector:true mean the resource is free for total duration of all taxonomies and rooms are available for these taxonomies
   * 
   * Объединяем вектор возможности для записи работника со всеми векторами возможности для записи комнат.
   * Метод возвращает вектор, в котором 1 означает, что в данное время можно совершить запись.
   * Здесь используется жадный алгоритм обхода расписания.
   * 
   * @param {Array} workerBitset
   * @param {string} workerId
   * @param {Array} roomsBitSets
   * @param {Number} totalDuration
   * @param {Number} serviceDuration
   * @param {Number} cracVectorSlotSize
   */
  function getServiceRoomVector(workerBitset, workerId, roomsBitSets, totalDuration, serviceDuration, cracVectorSlotSize) {
    var unionBookingVector = buildBookingCRACVector(workerBitset, cracVectorSlotSize, totalDuration);
    for (var j = 0; j < roomsBitSets.length; j++) {
      var roomBookingVector = buildBookingCRACVector(roomsBitSets[j], cracVectorSlotSize, serviceDuration[workerId]);
      unionBookingVector = setUnion(unionBookingVector, roomBookingVector);
    }
    return unionBookingVector;
  }

  /**
   * Return all combination of setting elements in array
   * example: taxonomyCombo(["a","b","c"]) return
   * [["a", "b", "c"],["a", "c", "b"],["b", "a", "c"],
   * ["b", "c", "a"],["c", "a", "b"],["c", "b", "a"]]
   * @param {Array} input
   */
  function taxonomyCombo(input) {
    var permArr = [],
        usedChars = [];

    function permute(input) {
      var i = void 0,
          ch = void 0;
      for (i = 0; i < input.length; i++) {
        ch = input.splice(i, 1)[0];
        usedChars.push(ch);
        if (input.length === 0) {
          permArr.push(usedChars.slice());
        }
        permute(input);
        input.splice(i, 0, ch);
        usedChars.pop();
      }
      return permArr;
    }
    return permute(input);
  }

  /**
   * Check if series of taxonomies can be executed by specific worker at specific bit.
   *
   * Получаем вектор возможности записи для переданной комбинации услуг.
   * 
   * @param {Object} serviceRoomVectors вектора возможности записи на работника для комбинации таксономий
   * @param {Array} taxonomyCombo
   * @param {String} resourceId
   * @param {Object} serviceDurationByWorker
   * @param {Number} cracVectorSlotSize
   * @return {Array<Number>}
   */
  function buildTaxonomyComboBookingVector(serviceRoomVectors, taxonomyCombo, resourceId, serviceDurationByWorker, cracVectorSlotSize) {
    return buildSequenceBookingCRACVector(taxonomyCombo.map(function (taxonomyId) {
      return serviceRoomVectors[taxonomyId][resourceId];
    }), taxonomyCombo.map(function (taxonomyId) {
      return serviceDurationByWorker[taxonomyId][resourceId];
    }), cracVectorSlotSize);
  }

  /**
   * Return resource vector; bit true when atleast 1 combination of taxonomy can be done
   * for example: in case of padicure and manicure service in request, true grante that worker can execute the
   * services by doing padicure first or manicure first
   *
   * @param {Object} serviceRoomVectors
   * @param {String} resourceId
   * @param {Object} serviceDurationByWorker
   * @param {Array} taxonomies
   * @param {Array} taxonomiesRooms
   * @param {Number} cracVectorSlotSize
   */
  function getWorkerBookingVector(serviceRoomVectors, resourceId, serviceDurationByWorker, taxonomies, taxonomiesRooms, cracVectorSlotSize) {
    // Получаем все перестановки таксономий
    var combinations = taxonomyCombo(taxonomies);

    // Для каждой комбинации таксономий получаем вектор возможности записи.
    // Объединяем эти вектора. Полученный вектор и будет искомым.
    var unionBookingVector = newBusyBitset(cracVectorSlotSize);
    for (var i = 0; i < combinations.length; i++) {
      var comboVector = buildTaxonomyComboBookingVector(serviceRoomVectors, combinations[i], resourceId, serviceDurationByWorker, cracVectorSlotSize);
      unionBookingVector = setUnion(unionBookingVector, comboVector);
    }

    return unionBookingVector;
  }

  /**
   * Execute the capacity of each taxonomy from request Crac.GetRoomsFromTaxonomies
   * 
   * @param {Object} taxonomyTreeCapacity
   * @param {Object} taxonomiesRooms
   */
  function getRoomCapacityByService(taxonomyTreeCapacity, taxonomiesRooms) {
    var capacity = {};
    taxonomiesRooms.forEach(function (t) {
      var treeCapacity = _$1.find(taxonomyTreeCapacity, { parent_id: t.room });
      capacity[t.taxonomy] = treeCapacity && treeCapacity.capacity ? treeCapacity.capacity : 0;
    });
    return capacity;
  }

  var SLOT_SIZE$1 = 5;
  var VECTOR_SIZE$1 = 24 * 60 / SLOT_SIZE$1;

  /**
   * Return map of taxonomies, and foreach taxonomy map of resources and durations
   * 
   * @param {Array} businessResources
   * @param {Array} businessTaxonomies
   */
  function getServiceDurationByWorker(businessResources, businessTaxonomies) {
    var taxonomyDuration = {};
    businessTaxonomies.forEach(function (t) {
      taxonomyDuration[t.id] = {};
      businessResources.forEach(function (r) {
        taxonomyDuration[t.id][r.id] = getServiceDuration(r, t);
      });
    });
    return taxonomyDuration;
  }

  /**
   * Return map of resources each resource the total duration to execute all taxonomies
   * 
   * @param {*} ServiceDurationByWorker
   * @param {*} taxonomies
   * @param {*} resources
   */
  function getTotalDurationsByWorker(ServiceDurationByWorker, taxonomies, resources) {
    var duration = {};
    resources.forEach(function (r) {
      duration[r] = 0;
      taxonomies.forEach(function (t) {
        duration[r] += ServiceDurationByWorker[t][r];
      });
    });
    return duration;
  }

  /**
   * convert crac bitset response into bitset vectors
   * @param {Object} cracSlot
   * @param {Object} roomCapacityByService
   * @param {Array} taxonomies
   * @param {Array} resources
   * @param {Array} taxonomiesRooms
   */
  function getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms) {
    var bitSets = {};
    bitSets.resources = {};
    bitSets.rooms = {};
    resources.forEach(function (r) {
      var cracResource = _$1.find(cracSlot.resources, { resourceId: r });
      if (cracResource) {
        bitSets.resources[r] = prepareBitset(cracResource.bitset, SLOT_SIZE$1);
      } else {
        bitSets.resources[r] = newBusyBitset(SLOT_SIZE$1);
      }
    });

    taxonomies.forEach(function (tId) {
      var capacity = roomCapacityByService[tId];
      var room = _$1.find(taxonomiesRooms, { taxonomy: tId });
      if (room && !bitSets.rooms[room.room]) {
        var roomId = room.room;
        bitSets.rooms[roomId] = [];
        for (var i = 0; i < capacity; i++) {
          var cracRoom = _$1.find(cracSlot.rooms, { roomId: roomId + "_" + i });
          if (cracRoom) {
            bitSets.rooms[roomId][i] = prepareBitset(cracRoom.bitset, SLOT_SIZE$1);
          } else {
            bitSets.rooms[roomId][i] = newFreeBitset(SLOT_SIZE$1);
          }
        }
      }
    });
    return bitSets;
  }

  /**
   * Способ формирования слотов из вектора возможности записи (1 - можно записаться на это время 
   * с учётом длительностей услуг и, возможно, других условий, 0 - нет возможности записи), при котором
   * слоты формируются с шагом равным размеру бита в CRAC векторе.
   * 
   * @param {bitset} bookingVector
   */
  function getGreedySlots(bookingVector) {
    var slots = [];
    for (var i = 0; i < bookingVector.length; i++) {
      if (bookingVector[i]) {
        slots.push({ time: i * SLOT_SIZE$1, duration: SLOT_SIZE$1, space_left: 1, discount: 10 });
      }
    }
    return slots;
  }

  /**
   * Return slots of each resource and the union slot for any available view.
   *
   * Данный метод используется для обработки запросов с использованием комнат.
   * Данный метод возвращает данные в формате crunch busySlots.
   * 
   * @param {Object} cracResult
   * @param {Object} business
   * @param {Array} taxonomyIDs
   * @param {Array} resourceIDs
   * @param {Array} taxonomiesRooms
   */
  function prepareSlots(cracResult, business, taxonomyIDs, resourceIDs, taxonomiesRooms) {
    var finalSlots = {};
    finalSlots.days = [];
    finalSlots.excludedResource = [];

    var businessWorkers = _$1.filter(business.resources, function (r) {
      return r.status === 'ACTIVE' && resourceIDs.indexOf(r.id) > -1;
    });

    var businessTaxonomies = _$1.filter(business.taxonomies, function (t) {
      return t.active && taxonomyIDs.indexOf(t.id) > -1;
    });

    var serviceDurationByWorker = getServiceDurationByWorker(businessWorkers, businessTaxonomies);
    var totalServicesDurationByWorker = getTotalDurationsByWorker(serviceDurationByWorker, taxonomyIDs, resourceIDs);
    var roomCapacityByService = getRoomCapacityByService(business.taxonomy_tree_capacity, taxonomiesRooms);

    var isAvailableResource = {};
    cracResult.forEach(function (cracSlot) {
      var bitSets = getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomyIDs, resourceIDs, taxonomiesRooms);
      var daySlots = {};
      daySlots.date = moment(cracSlot.date).utc().startOf('day').toISOString();
      daySlots.resources = [];
      daySlots.slots = [];
      var serviceRoomVectors = {};

      taxonomyIDs.forEach(function (tId) {
        serviceRoomVectors[tId] = {};
        var room = _$1.find(taxonomiesRooms, { taxonomy: tId });
        var roomBitSet = room ? bitSets.rooms[room.room] : [];
        resourceIDs.forEach(function (rId) {
          serviceRoomVectors[tId][rId] = getServiceRoomVector(bitSets.resources[rId], rId, roomBitSet, totalServicesDurationByWorker[rId], serviceDurationByWorker[tId], SLOT_SIZE$1);
        });
      });

      var anyAvailableVector = newBusyBitset(SLOT_SIZE$1);
      resourceIDs.forEach(function (rId) {
        var workerBookingsVector = getWorkerBookingVector(serviceRoomVectors, rId, serviceDurationByWorker, taxonomyIDs, taxonomiesRooms, SLOT_SIZE$1);
        var resourceSlots = getGreedySlots(workerBookingsVector);
        daySlots.resources.push({ id: rId, slots: resourceSlots });
        if (resourceSlots.length > 0) {
          isAvailableResource[rId] = true;
        }
        anyAvailableVector = setUnion(anyAvailableVector, workerBookingsVector);
      });

      daySlots.slots = getGreedySlots(anyAvailableVector);
      daySlots.available = daySlots.slots.length > 0;
      finalSlots.days.push(daySlots);
    });

    finalSlots.excludedResource = resourceIDs.filter(function (rId) {
      return !isAvailableResource[rId];
    });

    return finalSlots;
  }

  var ANY = 'ANY';

  /**
   * Create day slots from raw CRAC data.
   * @param date date in YYYY-MM-DD format
   * @param bitset resource CRAC bitset
   * @param vectorSlotSize CRAC bitset slot size
   * @param scheduleSlotSize business data
   * @param strategy slot strategy
   * @returns {Array} day slots
   */
  function cutSlots$1(date, bitset, vectorSlotSize, scheduleSlotSize, strategy) {
    var dayBounds = getFirstLastMinutes(bitset, vectorSlotSize);

    var slots = [];
    for (var slotMinute = dayBounds.start; slotMinute <= dayBounds.end;) {
      var available = isSlotAvailable(bitset, slotMinute, slotMinute + scheduleSlotSize, vectorSlotSize);

      var slot = {
        start: slotMinute,
        end: slotMinute + scheduleSlotSize,
        available: available
      };
      if (strategy.enhanceSlot) {
        slot = strategy.enhanceSlot(date, slot);
      }

      var newSlot = strategy.getNextSlotMinute(bitset, slot.start, slot.end, vectorSlotSize);
      if (newSlot < slotMinute + scheduleSlotSize) {
        throw new Error("New slot start: " + newSlot + " is less then previous end: " + (slotMinute + scheduleSlotSize));
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
  function makeSlots$1(cracData, business, taxonomyIDs, resourceID, strategy) {
    var vectorSlotSize = business.widget_configuration.cracSlotSize || defaultVectorSlotSize;

    return cracData.slots.reduce(function (ret, day) {
      var dayKey = day.date.substr(0, 10);
      var bs = void 0;

      if (ANY === resourceID) {
        bs = prepareBitset(day.intersection, vectorSlotSize);
      } else {
        var isExcluded = day.excludedResources && day.excludedResources.indexOf(resourceID) !== -1;
        if (!isExcluded) {
          var resourceData = day.resources.find(function (r) {
            return r.resourceId === resourceID;
          });
          if (resourceData) {
            bs = prepareBitset(resourceData.bitset, vectorSlotSize);
          }
        }
      }
      if (bs) {
        ret[dayKey] = cutSlots$1(dayKey, bs, vectorSlotSize, business, taxonomyIDs, resourceID, strategy || defaultStrategy);
      }
      return ret;
    }, {});
  }

  var Strategies = {
    DefaultStrategy: defaultStrategy
  };



  var Schedule = Object.freeze({
    Strategies: Strategies,
    setSlotSize: setSlotSize,
    toBusySlots: toBusySlots,
    prepareSlots: prepareSlots,
    makeSlots: makeSlots$1
  });

  function roundNumberUsingRule(input, businessData, noCommas) {
    if (!input) {
      return 0;
    }

    var roundSettings = {
      rule: 'TWO_DECIMALS',
      value: 10
    },
        country = '';

    if (businessData.business) {
      roundSettings = businessData.business.widget_configuration.discountedPriceRounding;
      var address = businessData.business.general_info.address;
      if (address && address.length && address[0].country) {
        country = businessData.business.general_info.address[0].country;
      }
    } else if (businessData.widget_configuration) {
      roundSettings = businessData.widget_configuration.discountedPriceRounding;
      var address = businessData.general_info.address;
      if (address && address.length && address[0].country) {
        country = address.country;
      }
    }

    if (country && country === 'RU' && roundSettings.value && roundSettings.value < 0) {
      roundSettings = {
        rule: 'CUSTOM',
        value: 10
      };
    }

    var output = 0;
    if (roundSettings && roundSettings.rule) {
      if (roundSettings.rule === 'CUSTOM' && roundSettings.value && RegExp(/^\d+$/).test(roundSettings.value)) {
        output = input - input % roundSettings.value;
        if (input - output >= roundSettings.value / 2) {
          output += roundSettings.value;
        }
        //return output;
      } else if (roundSettings.rule === 'NEAREST_INTEGER') {
        output = Math.round(input);
      } else {
        output = input.toFixed(2);
      }
    } else {
      output = input.toFixed(2);
    }

    if (!noCommas && ['RU', 'FR', 'LV', 'LT', 'UA', 'BY', 'KZ'].indexOf(country) > -1) {
      var outputStr = '' + output;
      output = outputStr.replace('.', ',');
    }
    return output;
  }

  function getPhoneSettings(business, options) {
    options = options || {};
    var country = business.general_info.address.length ? business.general_info.address[0].country : "RU";
    country = country || "RU";
    if (options.unfilled && ["RU", "LV"].indexOf(country) >= 0) {
      country += "_UNFILLED";
    }
    if (options.dirty && ["RU", "LV"].indexOf(country) >= 0) {
      country += '_DIRTY';
    }
    return phoneData[country] || phoneData["RU"];
  }

  function getCountryPhoneSettings(countryCode) {
    return phoneData[countryCode] || phoneData["RU"];
  }

  function getPhoneString(business, obj) {
    if (obj && obj.phone && obj.phone.length > 0) {
      var phone = getPhoneSettings(business).phoneStringMaker(obj.phone[0]);
      return phone.replace("++", "+");
    }
    return "";
  }

  function getPhoneSettingsPhone(phoneSettings, phoneString) {
    var data = phoneSettings.phoneExtractor(phoneString);
    var phone = {
      country_code: '',
      area_code: '',
      number: ''
    };
    if (data && data.length) {
      phone.country_code = data[1];
      phone.area_code = data[2];
      phone.number = data[3] + data[4];
    }

    return phone;
  }

  function getPhone(business, phoneString) {
    return getPhoneSettingsPhone(getPhoneSettings(business), phoneString);
  }

  function isValidPhone(parsedPhone) {
    return parsedPhone && parsedPhone.country_code && typeof parsedPhone.area_code === "string" && typeof parsedPhone.number === "string" && (parsedPhone.area_code + parsedPhone.number).length >= 6;
  }

  function getPhoneData(countryCode) {
    return phoneData[countryCode];
  }

  function defaultExtractor(value) {
    var regex = /\+(\d+)\((\d+)\) (\d+)-(\d+)/;
    return value.match(regex);
  }

  function defaultStringMaker(p) {
    if (!p || !p.number) return '';
    //let p = person.phone[0];
    var p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
    var p2 = p.number.length > 3 ? p.number.substr(3) : '';
    return "+" + p.country_code + "(" + p.area_code + ") " + p1 + "-" + p2;
  }

  function getCountryPhoneDigits(country) {
    return countryPhoneDigits[country] || 11;
  }

  var countryPhoneDigits = {
    'UZ': 12,
    'UA': 12
  };

  var phoneData = {
    'AM': {
      code: '374',
      mask: '+374(dd) dd-dd-dd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        return ['', '374', digits.substring(3, 5), digits.substring(5), ''];
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 2), digits.substring(2)];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p || !p.number) return '';
        var p1 = p.number.length > 3 ? p.number.substr(0, 2) : '';
        var p2 = p.number.length > 3 ? p.number.substr(2, 2) : '';
        var p3 = p.number.length > 3 ? p.number.substr(4, 2) : '';
        return "+" + p.country_code + "(" + p.area_code + ") " + p1 + "-" + p2 + "-" + p3;
      }
    },
    'GE': {
      code: '995',
      rules: {
        "9": null,
        "d": /\d/
      },
      mask: '+995 (ddd) ddd-ddd',
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 3), digits.substring(3)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length === 12) {
          return ['', '995', digits.substring(3, 6), digits.substring(6), ''];
        }
        return ['', '995', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p || !p.number) return '';
        var p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
        var p2 = p.number.length > 3 ? p.number.substr(3, 6) : '';
        return "+" + p.country_code + "(" + p.area_code + ") " + p1 + "-" + p2;
      }
    },
    'IL': {
      code: '972',
      mask: 'dddddddddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        if (value[0] === '0') {
          return [value.substring(1, 3), value.substring(3)];
        }
        return ['', ''];
      },
      phoneExtractor: function phoneExtractor(value) {
        if (value[0] === '0' && value.length === 10) {
          return ['', '972', value.substring(1, 3), value.substring(3), ''];
        }
        return ['', '972', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        var countryCode = (p.country_code || '').replace("+");
        if (countryCode === "972") {
          return p.number ? "0" + p.area_code + p.number : "";
        }
        return defaultStringMaker(p);
      }
    },
    'FR': {
      code: '33',
      mask: 'dddddddddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        if (value[0] === '0') {
          return [value.substring(1, 3), value.substring(3)];
        }
        return ['', ''];
      },
      phoneExtractor: function phoneExtractor(value) {
        if (value[0] === '0' && value.length === 10) {
          return ['', '33', value.substring(1, 3), value.substring(3), ''];
        }
        return ['', '33', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        var countryCode = (p.country_code || '').replace("+");
        if (countryCode === "33") {
          return p.number ? "0" + p.area_code + p.number : "";
        }
        return defaultStringMaker(p);
      }
    },
    'US': {
      code: '1',
      mask: '+1(ddd) ddd-dddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 3), digits.substring(3)];
      },
      phoneExtractor: defaultExtractor,
      phoneStringMaker: defaultStringMaker
    },
    'UA': {
      code: '380',
      mask: '+380(dd) ddd-dddd',
      rules: {
        "0": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 2), digits.substring(2)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 11) {
          return ['', '380', digits.substring(digits.length - 9, digits.length - 7), digits.substring(digits.length - 7), ''];
        }
      },
      phoneStringMaker: defaultStringMaker
    },
    'LV': {
      code: '371',
      mask: '+(371) dddddddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        return ['', value];
      },
      phoneExtractor: function phoneExtractor(value) {
        if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
        var regex = /\+?\((\d+)\)\s*(\d*)/;
        var m = value.match(regex);
        return m && m[2] ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        return "+(371) " + p.area_code + p.number;
      }
    },
    'LV_UNFILLED': {
      code: '371',
      mask: '+(371) 99999999',
      phoneExtractor: function phoneExtractor(value) {
        if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
        var regex = /\+?\((\d+)\)[\s_]*(\d*)/;
        var m = value.match(regex);
        return m && m[2] ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        return "+(371) " + p.area_code + p.number;
      }
    },
    'LV_DIRTY': {
      code: '371',
      mask: '+(371) 99999999',
      phoneExtractor: function phoneExtractor(value) {
        if (value.indexOf("371") === 0) value = '(371)' + value.substr(3);
        var regex = /\+?\((\d+)\)[\s_]*(\d*)/;
        var m = value.match(regex);
        return m && m[2] ? ['', '371', '', m[2], ''] : ['', '371', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        return "+(371) " + p.area_code + p.number;
      }
    },
    'RU_UNFILLED': {
      code: '7',
      mask: '+7(999) 999-9999',
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        return ['', '7', digits.substr(1, 3), digits.substr(4), ''];
      },
      phoneStringMaker: defaultStringMaker
    },
    'RU_DIRTY': {
      code: '7',
      mask: '+7(999) 999-9999',
      phoneExtractor: function phoneExtractor(value) {
        var normalized = value.replace('-', '');
        return (/(\+.)\((.{3})\)\s(.{7})/.exec(normalized)
        );
      },
      phoneStringMaker: defaultStringMaker
    },
    'RU': {
      code: '7',
      mask: '+7(ddd) ddd-dddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 3), digits.substring(3)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 10) {
          return ['', '7', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
        }
        return ['', '7', '', '', ''];
      },
      phoneStringMaker: defaultStringMaker
    },
    'UZ': {
      code: '998',
      mask: '+998dd ddd-dddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return ['', digits.substring(digits.length - 9)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 10) {
          return ['', '998', '', digits.substring(digits.length - 9), ''];
        }
        return ['', '998', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p || !p.number) return '';
        var p1 = p.number.length > 3 ? p.number.substr(0, 2) : '';
        var p2 = p.number.length > 3 ? p.number.substr(2, 3) : '';
        var p3 = p.number.length > 3 ? p.number.substr(5, 4) : '';
        var area_code = p.area_code.length ? "(" + p.area_code + ") " : "";
        return "+" + p.country_code + area_code + p1 + " " + p2 + "-" + p3;
      }
    },
    'BLR': {
      code: '7',
      mask: '+7(ddd) ddd-dddd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        return [digits.substring(0, 3), digits.substring(3)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 10) {
          return ['', '7', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
        }
        return ['', '7', '', '', ''];
      },
      phoneStringMaker: defaultStringMaker
    },
    'CH': {
      code: '86',
      mask: '+86 (ddd) ddd-dd-dd',
      rules: {
        "9": null,
        "d": /\d/
      },
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        return [value.substring(0, 3), value.substring(3)];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 10) {
          return ['', '86', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
        }
        return ['', '86', '', '', ''];
      },
      phoneStringMaker: defaultStringMaker
    },
    'DE': {
      code: '49',
      rules: {
        "9": null,
        "d": /\d/
      },
      mask: '+49 (dd dd) dd dd dd',
      phoneExtractorWidget: function phoneExtractorWidget(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length >= 8) {
          return [digits.substring(0, 3), digits.substring(3)];
        }
        return ['', ''];
      },
      phoneExtractor: function phoneExtractor(value) {
        var digits = value.replace(/\D/g, '');
        //console.log("digits",digits);
        if (digits.length >= 10) {
          console.log(digits.substring(digits.length - 10, digits.length - 6), digits.substring(digits.length - 6));
          return ['', '49', digits.substring(digits.length - 10, digits.length - 6), digits.substring(digits.length - 6), ''];
        }
        return ['', '49', '', '', ''];
      },
      phoneStringMaker: function phoneStringMaker(p) {
        if (!p) return '';
        if (p.area_code && p.area_code.length >= 4 && p.number && p.number.length >= 6) {
          return "+" + p.country_code + " (" + p.area_code.substr(0, 2) + " " + p.area_code.substr(2, 2) + ") " + p.number.substr(0, 2) + " " + p.number.substr(2, 2) + " " + p.number.substr(4, 2);
        }
        return "+" + p.country_code + " (" + p.area_code + ") " + p.number;
      }
    }
  };

var phoneUtils = Object.freeze({
    getPhoneSettings: getPhoneSettings,
    getCountryPhoneSettings: getCountryPhoneSettings,
    getPhoneString: getPhoneString,
    getPhoneSettingsPhone: getPhoneSettingsPhone,
    getPhone: getPhone,
    isValidPhone: isValidPhone,
    getPhoneData: getPhoneData,
    getCountryPhoneDigits: getCountryPhoneDigits
  });

  function getLangCode(lang) {
    return langCodes[lang] || 'ru-ru';
  };

  function getCountryLang(country) {
    return countryToLang[country] || countryToLang.EN;
  };

  var langCodes = {
    'ru_RU': 'ru-ru',
    'fr_FR': 'fr-fr',
    'en_US': 'en-us',
    'he_IL': 'he-il',
    'lv_LV': 'lv-lv',
    'lt_LT': 'lt-lt',
    'et_ET': 'et-et',
    'de_DE': 'de-de',
    'zh_CN': 'zh-cn',
    'fi_FI': 'fi-fi',
    'am_AM': 'am-am',
    'ge_GE': 'ge-ge'
  };

  var countryToLang = {
    'EN': 'en_US',
    'RU': 'ru_RU',
    'KZ': 'ru_RU',
    'FR': 'fr_FR',
    'UA': 'uk_UA',
    'HE': 'he_IL',
    'HU': 'hu_HU',
    'IL': 'he_IL',
    'LV': 'lv_LV',
    'LT': 'lt_LT',
    'ET': 'et_ET',
    'DE': 'de_DE',
    'CH': 'zh_CN',
    'AM': 'am_AM',
    'GE': 'ge_GE'
  };

var langUtils = Object.freeze({
    getLangCode: getLangCode,
    getCountryLang: getCountryLang
  });

  /**
   * Выбираем только тех работников, которые выполяют указанную услугу (услуги).
   *
   * @param businessData
   * @param {Array<String>} services
   * @param options
   * @returns {[]}
   */
  function filterWorkersByTaxonomies(businessData, services, options) {
    if (!(services && services.length)) {
      console.warn("Services not passed in worker filter!");
      return [];
    }

    options = options || {};
    var showInactiveWorkers = options.showInactiveWorkers || false;

    if (services.length > 1) {
      return businessData.business.resources.filter(function (resource) {
        // worker should execute all services
        var intersection = _$1.intersection(resource.taxonomies, services);
        return (showInactiveWorkers || resource.displayInWidget) && intersection && intersection.length === services.length;
      });
    }

    return businessData.business.resources.filter(function (resource) {
      return (showInactiveWorkers || resource.displayInWidget) && resource.taxonomies.indexOf('' + services[0]) !== -1;
    });
  }

  /**
   * Подготавливает список работников и кабинетов для их отображения на виджете.
   *
   * @param $scope
   * @param workers
   * @param cabinets
   * @param {Object} options
   * @param {Function} options.sortByFn
   * @param {Boolean} options.showInactiveWorkers
   * @param {Boolean} options.cabinetsEnabled
   */
  function prepareWorkers($scope, workers, cabinets, options) {
    options = options || {};
    options.sortByFn = options.sortByFn || null;
    options.showInactiveWorkers = options.showInactiveWorkers || false;
    options.cabinetsEnabled = options.cabinetsEnabled || false;

    var activeWorkers = options.showInactiveWorkers ? workers : _$1.filter(workers, { 'status': 'ACTIVE' });
    var hasOrder = _$1.all(activeWorkers, 'order');

    $scope.workers = _$1.sortBy(activeWorkers, options.sortByFn || (hasOrder ? 'order' : 'name'));
    for (var intIndex = 0; intIndex < $scope.workers.length; intIndex++) {
      $scope.workers[intIndex].showDescription = ($scope.workers[intIndex].description || '').substring(0, 70);
      $scope.workers[intIndex].isFullDescription = ($scope.workers[intIndex].description || '').length <= 70;
    }

    if (options.cabinetsEnabled) {
      var activeCabinets = _$1.filter(cabinets, function (cab) {
        return cab.active && !cab.isSpecial;
      });
      var tmp = _$1.sortBy(activeCabinets, 'name');
      var specCabinet = _$1.find(cabinets, function (cab) {
        return cab.isSpecial;
      });

      $scope.cabinets = specCabinet ? [specCabinet].concat(tmp) : tmp;
      if (specCabinet) {
        setTimeout(function () {
          $scope.selectCabinet(specCabinet);
        }, 0);
      }
    }
  }

var Resources = Object.freeze({
    filterWorkersByTaxonomies: filterWorkersByTaxonomies,
    prepareWorkers: prepareWorkers
  });

  /*
   В данном файле реализована стратегия показа списка работников "most_free".
   Следите, чтобы сигнатуры функций из этого файла совпадали с сигнатурами функций из resources.js и наоборот.
   */

  /**
   * 
   * @param {Object} workloadIndex
   * @param {Object} worker
   * @private
   */
  function _sortByWorkload(workloadIndex, worker) {
    return 10000000 - workloadIndex[worker.id].weight;
  }

  /**
   * Подготавливает список работников и кабинетов для их отображения на виджете.
   *
   * @param $scope
   * @param workers
   * @param cabinets
   * @param {Object} options
   * @param {Object} options.workloadIndex
   * @param {Function} options.sortByFn
   * @param {Boolean} options.showInactiveWorkers
   * @param {Boolean} options.cabinetsEnabled
   */
  function prepareWorkers$1($scope, workers, cabinets, options) {
    options = options || {};
    options.sortByFn = _sortByWorkload.bind(null, options.workloadIndex);
    return prepareWorkers($scope, workers, cabinets, options);
  }

var ResourcesMostFree = Object.freeze({
    _sortByWorkload: _sortByWorkload,
    prepareWorkers: prepareWorkers$1
  });

  var days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var weekDaysMap = {
    "sun": 0,
    "mon": 1,
    "tue": 2,
    "wed": 3,
    "thu": 4,
    "fri": 5,
    "sat": 6
  };

  function getServiceActiveDiscounts(service, startTime) {
    if (!service.discounts || !service.discounts.length) {
      return [];
    }
    startTime = moment.utc(startTime);
    return service.discounts.filter(function (d) {
      return d.active && moment.utc(d.start).isBefore(startTime) && moment.utc(d.start).startOf('w').add('w', d.weeklyRepeat).isAfter(startTime);
    });
  }

  function getServiceDiscount(service, time) {
    if (!service.discounts) {
      return [];
    }
    time = moment.utc(time);
    var activeDiscountsItems = service.discounts.filter(function (d) {
      return d.active && d.days.indexOf(days[time.day()]) !== -1 && moment.utc(d.start).isBefore(time) && moment.utc(d.start).startOf('w').add('w', d.weeklyRepeat).isAfter(time);
    });
    var discounts = activeDiscountsItems.map(function (d) {
      var slot = _$1.find(d.slots, function (slot) {
        var slotStart = moment(time).startOf('day').add('m', slot.time.start);
        var slotEnd = moment(time).startOf('day').add('m', slot.time.end - 1);
        return moment.range(slotStart, slotEnd).contains(time);
      });
      return slot ? slot.amount : undefined;
    }).filter(function (d) {
      return d;
    });
    return _$1.first(discounts);
  }

  //recursively checks for parent's (ancestor's) discounts
  function checkForParentDiscounts(businessData, taxonomyParentID, time) {
    var parentDiscount = {
      //discount: 0,
      //provider: 'LOCAL'
    };
    var timeInMinutes = time.hour() * 60 + time.minute();

    var t = businessData.business.taxonomies.filter(function (t) {
      return t.id === taxonomyParentID;
    });
    if (t && t[0]) {
      if (!parentDiscount.discount && typeof t[0].discounts.regular !== 'undefined') {
        t[0].discounts.regular.forEach(function (discount) {
          var end = moment(discount.start).add(discount.weeklyRepeat, 'weeks');
          if (discount.active && (discount.unlimWeeklyRepeat || time.isAfter(discount.start) && time.isBefore(end))) {
            for (var day in discount.week) {
              discount.week[day].forEach(function (slot) {
                if (time.day() === weekDaysMap[day] && timeInMinutes >= slot.start && timeInMinutes <= slot.end) {
                  parentDiscount = slot;
                }
              });
            }
          }
        });
      } else {
        if (!parentDiscount.discount && typeof t[0].taxonomyParentID !== "undefined" && t[0].taxonomyParentID) {
          parentDiscount = checkForParentDiscounts(businessData, t[0].taxonomyParentID, time);
        }
      }
    }

    return parentDiscount;
  }

  //recursively checks for parent's (ancestor's) discount exceptions
  function checkForParentDiscountExceptions(businessData, taxonomyParentID, time) {
    var parentDiscount = {
      //discount: 0,
      provider: 'LOCAL'
    };
    var timeInMinutes = time.hour() * 60 + time.minute();

    businessData.business.taxonomies.forEach(function (t) {
      if (t.id === taxonomyParentID && typeof t.discounts.exceptions !== 'undefined') {
        t.discounts.exceptions.forEach(function (exception) {
          var date = moment(exception.date);
          if (exception.active && time.format("YYYY-MM-DD") === date.format("YYYY-MM-DD")) {
            exception.slots.forEach(function (slot) {
              if (timeInMinutes >= slot.start && timeInMinutes <= slot.end) {
                parentDiscount = slot;
              }
            });
          }
        });

        //if no discount exception found, check for parent's discount exceptions recursively
        if ((typeof parentDiscount.discount === 'undefined' || parentDiscount.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
          parentDiscount = checkForParentDiscountExceptions(taxonomyParentID, time);
        }
        return;
      }
    });
    return parentDiscount;
  }

  function getServiceDiscountsAndExceptions(bData, service, time, campaignProvider) {
    if (!service || !service.discounts) {
      return 0;
    }

    var slot = {
      //discount: 0
    };

    var timeInMinutes = time.hour() * 60 + time.minute();

    //Checking for Exception Discounts, it has higher priority than Regular Discounts
    if (typeof service.discounts.exceptions !== 'undefined') {
      service.discounts.exceptions.forEach(function (exception) {
        var date = moment(exception.date);
        if (exception.active && time.format("YYYY-MM-DD") === date.format("YYYY-MM-DD")) {
          exception.slots.forEach(function (s) {
            if (timeInMinutes >= s.start && timeInMinutes <= s.end) {
              slot = s;
              slot.isException = true;
            }
          });
        }
      });
    }

    //Checking for Campaign & Regular Discounts, Regular Discounts has lower priority than Campaign Discounts
    if (!slot.discount && typeof service.discounts.regular !== 'undefined') {
      service.discounts.regular.forEach(function (discount) {
        var end = moment(discount.start).add(discount.weeklyRepeat, 'weeks');
        if (discount.active && (time.isAfter(discount.start) && time.isBefore(end) || discount.unlimWeeklyRepeat)) {
          for (var day in discount.week) {
            discount.week[day].forEach(function (s) {
              if (time.day() === weekDaysMap[day] && timeInMinutes >= s.start && timeInMinutes <= s.end) {
                //If Discount from Campagin is found, then overwrite even d. exceptions are set
                if (campaignProvider && s.provider === campaignProvider.toUpperCase()) {
                  slot = s;
                  return;
                }
                //set regular Discount, if Discount Exception is not found
                else if (!slot.discount && s.provider === "LOCAL") {
                    slot = s;
                  }
              }
            });
          }
        }
      });
    }

    //If no Discount Exception found, check for Parent's (Ancestor's) Discount Exceptions recursively
    if ((typeof slot.discount === 'undefined' || slot.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
      slot = checkForParentDiscountExceptions(bData, service.taxonomyParentID, time);
      slot.isException = true;
    }

    //If no Regular Discount found, check for Parent's (Ancestor's) Regular Discounts recursively
    if ((typeof slot.discount === 'undefined' || slot.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
      slot = checkForParentDiscounts(bData, service.taxonomyParentID, time);
    }

    return slot;
  }

var Discounts = Object.freeze({
    getServiceActiveDiscounts: getServiceActiveDiscounts,
    getServiceDiscount: getServiceDiscount,
    getServiceDiscountsAndExceptions: getServiceDiscountsAndExceptions
  });

  var SLOT_SIZE$2 = 5;
  var VECTOR_SIZE$2 = 24 * 60 / SLOT_SIZE$2;
  function getDayBoundsFromCracSlot$1(date, slot) {
    var allDayBounds = null;
    var bitmask = cracValueToBits(slot.bitset);
    var bitmaskTaxonomy = cracValueToBits(slot.taxonomyBitset || "");
    if (bitmaskTaxonomy.indexOf(0) > -1) {
      for (var i = 0; i < bitmask.length; i++) {
        bitmask[i] = bitmask[i] ? bitmask[i] && bitmaskTaxonomy[i] : bitmaskTaxonomy[i];
      }
    }
    var firstActiveBit = bitmask.length;
    var daySize = 24 * 60 / SLOT_SIZE$2;
    var lastActiveBit = bitmask.length - daySize;
    for (var ii = bitmask.length - 1; ii >= bitmask.length - 24 * 60 / SLOT_SIZE$2; ii--) {
      if (bitmask[ii] == 1 && firstActiveBit == bitmask.length) {
        firstActiveBit = ii;
      }
      if (bitmask[ii] == 1) {
        lastActiveBit = ii;
      }
    }
    if (firstActiveBit != bitmask.length - 1 || firstActiveBit == bitmask.length - 1 && lastActiveBit > 1) {
      allDayBounds = {};
      allDayBounds.start = (bitmask.length - 1 - firstActiveBit) * SLOT_SIZE$2;
      allDayBounds.start_time = moment(date).add(allDayBounds.start, 'minutes').toISOString();
      if (lastActiveBit == 1) {
        allDayBounds.end = bitmask.length * SLOT_SIZE$2;
      } else {
        allDayBounds.end = (bitmask.length - lastActiveBit) * SLOT_SIZE$2;
      }
      allDayBounds.end_time = moment(date).add(allDayBounds.end, 'minutes').toISOString();
    }
    return allDayBounds;
  }
  function cracValueToBits(value) {
    var bits = [];
    // Fastest way to parse stringifyed bitmask
    Array.prototype.forEach.call(value, function (sign) {
      if (sign === '0' || sign === '1') {
        bits.push(parseInt(sign));
      }
    });
    return bits;
  }

  // Generate crunch-capable data from CRAC.
  // Complexity: O(N), where N = 24hours / 5 minutes
  function getCrunchSlotsFromCrac(cracSlot, date, startMinutes, endMinutes, maxSlotSize) {
    var busySlots = [];
    var available = false;
    var start_time = void 0,
        end_time = void 0;

    var bitmask = cracValueToBits(cracSlot.bitset);
    var bitmaskTaxonomy = cracValueToBits(cracSlot.taxonomyBitset || "");
    if (bitmaskTaxonomy.indexOf(0) > -1) {
      for (var i = 0; i < bitmask.length; i++) {
        bitmask[i] = bitmask[i] ? bitmask[i] && bitmaskTaxonomy[i] : bitmaskTaxonomy[i];
      }
    }
    var reverseOffset = bitmask.length - 1;
    var startBitIndex = typeof startMinutes === 'undefined' ? 0 : Math.floor(startMinutes / SLOT_SIZE$2);
    var endBitIndex = typeof endMinutes === 'undefined' ? reverseOffset : Math.floor(endMinutes / SLOT_SIZE$2);
    var resultDate = moment.utc(date);

    var currentSlot = void 0;
    function commitSlot() {
      var startMinutes = currentSlot.start;
      var time = resultDate.clone().set({
        minutes: startMinutes % 60,
        hours: Math.floor(startMinutes / 60)
      });
      currentSlot.time = time.toISOString();
      currentSlot.startTS = time.unix();
      currentSlot.end = startMinutes + currentSlot.duration;
      busySlots.push(currentSlot);

      // console.info('commitSlot', currentSlot.time, currentSlot.start, currentSlot.end, currentSlot.duration);

      currentSlot = undefined;
    }

    function makeSlot(startMinutes) {
      // Make busy slot
      currentSlot = {
        space_left: 0,
        start: startMinutes,
        duration: SLOT_SIZE$2,
        partial_busy: null
      };

      // console.info('makeSlot', startMinutes);
    }

    // console.log(date, bitmask.slice(reverseOffset - endBitIndex + 1, reverseOffset - startBitIndex).join(''));

    // Walking through bitmaks in reverse direction.
    for (var ii = startBitIndex; ii < endBitIndex; ii++) {
      var bitIndex = reverseOffset - ii;
      var bit = bitmask[bitIndex];
      var minutes = ii * SLOT_SIZE$2;

      if (bit === 1) {
        available = true;
        if (currentSlot) {
          commitSlot();
        }
      } else if (bit === 0) {

        if (!currentSlot) {
          makeSlot(minutes);
        } else {
          currentSlot.duration += SLOT_SIZE$2;
          // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);

          if (currentSlot.duration >= maxSlotSize) {
            commitSlot();
            // console.info('separate by maxSlotSize', maxSlotSize);
            makeSlot(minutes);
          }
        }
      }
    }

    if (currentSlot) {
      // console.info('ensure last slot');
      commitSlot();
    }

    var busySlotsLength = busySlots.length;

    // Change start_time bounds according to near available time.
    if (bitmask[reverseOffset - startBitIndex] === 0) {
      var startSlot = busySlots[0];
      for (var _ii = 1; _ii < busySlotsLength; _ii++) {
        var slot = busySlots[_ii];
        if (startSlot.end === slot.start) {
          startSlot = slot;
        } else {
          break;
        }
      }

      if (startSlot) {
        start_time = moment.utc(date).startOf('day').add(startSlot.end, 'minutes').toISOString();
      }
    }

    // Change end_time bounds according to near available time.
    if (bitmask[reverseOffset - endBitIndex + 1] === 0) {
      var endSlot = busySlots[busySlotsLength - 1];
      for (var _ii2 = busySlotsLength - 2; _ii2 >= 0; _ii2--) {
        var _slot = busySlots[_ii2];
        if (endSlot.start === _slot.end) {
          endSlot = _slot;
        } else {
          break;
        }
      }

      if (endSlot) {
        end_time = endSlot.time;
      }
    }

    return {
      available: available,
      busy: busySlots,
      start_time: start_time,
      end_time: end_time
    };
  }

  // Special fix for `$scope.getEmptyDayLabel()` in `desktopwidget` app.
  function isoDateForDayOff$1(date) {
    return moment(date).toISOString().replace('.000Z', 'Z');
  }

  /**
     * return excution time of taxonomy by specific worker
     * @param {Object} businessWorker 
     * @param {Object} businessTaxonomy 
     */
  function resourceTaxonomyDuration(businessWorker, businessTaxonomy) {
    var duration = businessTaxonomy.duration;
    if (businessWorker.taxonomyLevels && businessWorker.taxonomyLevels.length > 0) {
      var taxonomyLevel = _$1.find(businessWorker.taxonomyLevels, { id: businessTaxonomy.id });
      if (taxonomyLevel) {
        var additionalDuration = _$1.find(businessTaxonomy.additionalDurations, { level: taxonomyLevel.level });
        if (additionalDuration && additionalDuration.duration) {
          duration = additionalDuration.duration;
        }
      }
    }
    return duration;
  }

  /**
   * return map of taxonomies, and foreach taxonomy map of resources and durations
   * @param {Array} businessResources 
   * @param {Array} businessTaxonomies 
   */
  function getServiceDurationByWorker$1(businessResources, businessTaxonomies) {
    var taxonomyDuration = {};
    businessTaxonomies.forEach(function (t) {
      taxonomyDuration[t.id] = {};
      businessResources.forEach(function (r) {
        taxonomyDuration[t.id][r.id] = resourceTaxonomyDuration(r, t);
      });
    });
    return taxonomyDuration;
  }

  /**
   * return map of resources each resource the total duaration to execute all taxonomies
   * @param {*} ServiceDurationByWorker 
   * @param {*} taxonomies 
   * @param {*} resources 
   */
  function getSlotDurationByWorker(ServiceDurationByWorker, taxonomies, resources) {
    var duration = {};
    resources.forEach(function (r) {
      duration[r] = 0;
      taxonomies.forEach(function (t) {
        duration[r] += ServiceDurationByWorker[t][r];
      });
    });
    return duration;
  }

  /**
   * excute the capacity of each taxonomy from request Crac.GetRoomsFromTaxonomies
   * @param {Object} taxonomyTreeCapacity 
   * @param {Object} taxonomiesRooms 
   */
  function getRoomCapacityByService$1(taxonomyTreeCapacity, taxonomiesRooms) {
    var capacity = {};
    taxonomiesRooms.forEach(function (t) {
      var treeCapacity = _$1.find(taxonomyTreeCapacity, { parent_id: t.room });
      var tCapacity = treeCapacity && treeCapacity.capacity ? treeCapacity.capacity : 0;
      capacity[t.taxonomy] = tCapacity;
    });
    return capacity;
  }

  /**
   * convert crac bitset response into bitset vectors
   * @param {Object} cracSlot 
   * @param {Object} roomCapacityByService 
   * @param {Array} taxonomies 
   * @param {Array} resources 
   * @param {Array} taxonomiesRooms 
   */
  function getBitSetsFromCracSlots$1(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms) {
    var bitSets = {};
    bitSets.resources = {};
    bitSets.rooms = {};
    resources.forEach(function (r) {
      var cracResource = _$1.find(cracSlot.resources, { resourceId: r });
      if (cracResource) {
        bitSets.resources[r] = cracValueToBits(cracResource.bitset).reverse();
      } else {
        bitSets.resources[r] = initBusyVector();
      }
    });

    taxonomies.forEach(function (tId) {
      var capacity = roomCapacityByService[tId];
      var room = _$1.find(taxonomiesRooms, { taxonomy: tId });
      if (room && !bitSets.rooms[room.room]) {
        var roomId = room.room;
        bitSets.rooms[roomId] = [];
        for (var i = 0; i < capacity; i++) {
          var cracRoom = _$1.find(cracSlot.rooms, { roomId: roomId + "_" + i });
          if (cracRoom) {
            bitSets.rooms[roomId][i] = cracValueToBits(cracRoom.bitset).reverse();
          } else {
            bitSets.rooms[roomId][i] = initFreeVector();
          }
        }
      }
    });
    return bitSets;
  }

  /**
   * return vector:true mean the resource is free for total duration of all taxonomies and rooms are available for these taxonomies
   * @param {Array} workerBitSets 
   * @param {string} workerId 
   * @param {Array} roomsBitSets 
   * @param {Int} totalDuration 
   * @param {Int} serviceDuration 
   * @param {String} resources 
   * @param {Array} taxonomies 
   */
  function getServiceRoomVector$1(workerBitSets, workerId, roomsBitSets, totalDuration, serviceDuration, resources, taxonomies) {
    var workerFree, roomFree;
    var finalVector = initBusyVector();
    for (var i = 0; i < workerBitSets.length; i++) {
      workerFree = checkFree(workerBitSets, i, totalDuration);
      if (workerFree == 1) {
        roomFree = true;
        if (roomsBitSets.length > 0) {
          roomFree = false;
        }
        for (var j = 0; j < roomsBitSets.length; j++) {
          roomFree = roomFree || checkFree(roomsBitSets[j], i, serviceDuration[workerId]);
        }
        finalVector[i] = roomFree;
      }
    }
    return finalVector;
  }

  /**
   * return all combination of setting elements in array 
   * example: taxonomyCombo(["a","b","c"]) return
   * [["a", "b", "c"],["a", "c", "b"],["b", "a", "c"],
   * ["b", "c", "a"],["c", "a", "b"],["c", "b", "a"]]
   * @param {Array} input 
   */
  function taxonomyCombo$1(input) {
    var permArr = [],
        usedChars = [];

    function permute(input) {
      var i, ch;
      for (i = 0; i < input.length; i++) {
        ch = input.splice(i, 1)[0];
        usedChars.push(ch);
        if (input.length == 0) {
          permArr.push(usedChars.slice());
        }
        permute(input);
        input.splice(i, 0, ch);
        usedChars.pop();
      }
      return permArr;
    };
    return permute(input);
  }

  /**
   * 
   * Check if serious of taxonomies can be executed by specific worker at specfic bit
   * 
   * @param {int} index 
   * @param {Object} serviceRoomVectors 
   * @param {Array} taxonomyCombo 
   * @param {String} resourceId 
   * @param {Object} serviceDurationByWorker 
   */
  function checkSlotTaxonomyCombo(index, serviceRoomVectors, taxonomyCombo, resourceId, serviceDurationByWorker) {
    var duration, vector;
    var bit = true;
    var calculatedIndex = index;

    duration = serviceDurationByWorker[taxonomyCombo[0]][resourceId];
    bit = bit && serviceRoomVectors[taxonomyCombo[0]][resourceId][calculatedIndex];

    for (var i = 1; i < taxonomyCombo.length; i++) {
      calculatedIndex = calculatedIndex + i * parseInt(duration / SLOT_SIZE$2);
      bit = bit && serviceRoomVectors[taxonomyCombo[i]][resourceId][calculatedIndex];
      duration = serviceDurationByWorker[taxonomyCombo[i]][resourceId];
    }
    return bit ? 1 : 0;
  }

  /**
   * 
   * return resource vector; bit true when atleast 1 combination of taxonomy can be done
   * for example: in case of padicure and manicure service in request, true grante that worker can execute the
   * services by doing padicure first or manicure first
   * 
   * @param {Object} serviceRoomVectors 
   * @param {String} resourceId 
   * @param {Object} serviceDurationByWorker 
   * @param {Array} taxonomies 
   * @param {Array} taxonomiesRooms 
   */
  function getWorkerVector(serviceRoomVectors, resourceId, serviceDurationByWorker, taxonomies, taxonomiesRooms) {
    var rooms = [];
    taxonomiesRooms.forEach(function (t) {
      if (rooms.indexOf(t.room) == -1) {
        rooms.push(t.room);
      }
    });

    var combinations = taxonomyCombo$1(taxonomies);
    var vector = initBusyVector();
    for (var j = 0; j < vector.length; j++) {
      for (var i = 0; i < combinations.length; i++) {
        vector[j] = vector[j] || checkSlotTaxonomyCombo(j, serviceRoomVectors, combinations[i], resourceId, serviceDurationByWorker);
        if (vector[j] == 1) {
          break;
        }
      }
    }
    return vector;
  }

  /**
   * create widget solts from bitset
   * @param {bitset} resourceVector 
   */
  function calcResourceSlots(resourceVector) {
    var resourceSlots = [];
    for (var i = 0; i < resourceVector.length; i++) {
      if (resourceVector[i]) {
        resourceSlots.push({ time: i * SLOT_SIZE$2, duration: SLOT_SIZE$2, space_left: 1, discount: 10 });
      }
    }
    return resourceSlots;
  }
  /**
   * return array of excluded resources 
   * retource excluded in case he dont have any free slot in request dates
   * @param {Array} resources 
   * @param {Object} slots 
   */
  function calExcludedResource(resources, excludedHash) {
    var excludedResources = [];
    resources.forEach(function (rId) {
      if (!excludedHash[rId]) {
        excludedResources.push(rId);
      }
    });
    return excludedResources;
  }

  /**
   * intialize bitset with 1 in all bits
   */
  function initFreeVector() {
    var set = [];
    for (var i = 0; i < VECTOR_SIZE$2; i++) {
      set[i] = 1;
    }
    return set;
  }

  /**
   * intialize bitset with 0 in all bits
   */
  function initBusyVector() {
    var set = [];
    for (var i = 0; i < VECTOR_SIZE$2; i++) {
      set[i] = 0;
    }
    return set;
  }

  /**
   * check of bitset has serious of true from index to fit duration 
   * @param {bitset} bistSet 
   * @param {int} index 
   * @param {int} duration 
   */
  function checkFree(bistSet, index, duration) {
    var bits = parseInt(duration / SLOT_SIZE$2);
    for (var i = index; i < index + bits; i++) {
      if (bistSet[i] == 0) {
        return 0;
      }
    }
    return 1;
  }

  /**
   * And operation by bit between 2 sets
   * 
   * @param {*bitset} setA 
   * @param {*bitset} setB 
   */
  function setAnd$1(setA, setB) {
    var unifiedSet = [];
    for (var i = 0; i < setA.length; i++) {
      unifiedSet[i] = setA[i] && setB[i];
    }
    return unifiedSet;
  }

  /**
   * OR operation by bit between 2 sets
   * 
   * @param {*bitset} setA 
   * @param {*bitset} setB 
   */
  function setUnion$1(setA, setB) {
    var unifiedSet = [];
    for (var i = 0; i < setA.length; i++) {
      unifiedSet[i] = setA[i] || setB[i];
    }
    return unifiedSet;
  }

  /**
   *  Return slots of each resource and the union slot for any available view
   * 
   * @param {Object} cracResult 
   * @param {Object} business 
   * @param {Array} taxonomies 
   * @param {Array} resources 
   * @param {Array} taxonomiesRooms 
   */
  function prepareSlots$1(cracResult, business, taxonomies, resources, taxonomiesRooms) {

    var excludedResource = [];
    var finalSlots = {};
    var businessData = business;

    finalSlots.days = [];
    finalSlots.excludedResource = [];

    var businessTaxonomies = _$1.filter(business.taxonomies, function (t) {
      return t.active && taxonomies.indexOf(t.id) > -1;
    });
    var businessWorkers = _$1.filter(business.resources, function (r) {
      return r.status == 'ACTIVE' && resources.indexOf(r.id) > -1;
    });

    var serviceDurationByWorker = getServiceDurationByWorker$1(businessWorkers, businessTaxonomies);
    var totalServicesDurationByWorker = getSlotDurationByWorker(serviceDurationByWorker, taxonomies, resources);
    var roomCapacityByService = getRoomCapacityByService$1(business.taxonomy_tree_capacity, taxonomiesRooms);
    var availableResoueceHash = {};
    cracResult.forEach(function (cracSlot) {
      var bitSets = getBitSetsFromCracSlots$1(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms);
      var daySlots = {};
      daySlots.date = moment(cracSlot.date).utc().startOf('day').toISOString();
      daySlots.resources = [];
      daySlots.slots = [];
      var serviceRoomVectors = {};
      var finalWorkersVector = {};

      taxonomies.forEach(function (tId) {
        serviceRoomVectors[tId] = {};
        var room = _$1.find(taxonomiesRooms, { taxonomy: tId });
        var roomBitSet = room ? bitSets.rooms[room.room] : [];
        resources.forEach(function (rId) {
          serviceRoomVectors[tId][rId] = getServiceRoomVector$1(bitSets.resources[rId], rId, roomBitSet, totalServicesDurationByWorker[rId], serviceDurationByWorker[tId], resources, taxonomies);
        });
      });

      var anyAvailableVector = initBusyVector();
      resources.forEach(function (rId) {
        finalWorkersVector[rId] = getWorkerVector(serviceRoomVectors, rId, serviceDurationByWorker, taxonomies, taxonomiesRooms);
        var resourceSlots = calcResourceSlots(finalWorkersVector[rId]);
        daySlots.resources.push({ id: rId, slots: resourceSlots });
        if (resourceSlots.length > 0) {
          availableResoueceHash[rId] = true;
        }
        anyAvailableVector = setUnion$1(anyAvailableVector, finalWorkersVector[rId]);
      });
      daySlots.slots = calcResourceSlots(anyAvailableVector);
      daySlots.available = daySlots.slots.length > 0;
      finalSlots.days.push(daySlots);
    });

    finalSlots.excludedResource = calExcludedResource(resources, availableResoueceHash);
    return finalSlots;
  }

  /**
   * Presense CRAC data type as Crunch' Busy Slots
   *
   * Its need for soft migration from Crunch to CRAC
   *
   * @param  {CracBusySlots|Array<Object>} cracSlots CRAC response format
   * @return {CrunBusySlot|Object}           Crunch response format
   */
  function toBusySlots$1(cracSlots, business, taxonomyIDs) {
    var resourceIds = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];

    var businessTimetable = business.general_info.timetable;
    var daysOff = [];
    var excludedResources = [];
    var excludedResourcesCountMap = {};
    var maxSlotDuration = -1;
    var resourceTimetables = [];
    var resourceEvenOddTimeTable = [];
    var timetableType = business.backoffice_configuration && business.backoffice_configuration.resourceTimetableType ? business.backoffice_configuration.resourceTimetableType : 'DEFAULT';
    business.resources.forEach(function (rr) {
      if (resourceIds.indexOf(rr.id) < 0) {
        return;
      }
      if (timetableType == 'EVENODD') {
        resourceEvenOddTimeTable.push(rr.evenOddTimetable);
      } else {
        resourceTimetables.push(rr.timetable && rr.timetable.active === true ? rr.timetable : businessTimetable);
      }
    });

    if (resourceTimetables.length < 1) {
      resourceTimetables.push(businessTimetable);
    }

    if (taxonomyIDs && taxonomyIDs.length) {
      var taxonomies = _$1.filter(business.taxonomies, function (tt) {
        return taxonomyIDs.indexOf(String(tt.id)) >= 0;
      });

      var maxTaxonomyDuration = _$1.max(taxonomies, 'duration');
      if (maxTaxonomyDuration) {
        maxSlotDuration = maxTaxonomyDuration.duration;
      }
    }

    // const now = moment();

    function excludedResource(resource_id, date) {
      excludedResourcesCountMap[resource_id] = (excludedResourcesCountMap[resource_id] || 0) + 1;
      daysOff.push({ date: date, resource_id: resource_id });
    }

    var busySlotsResponse = {
      taxonomyId: taxonomyIDs && taxonomyIDs[0],
      slots_size: maxSlotDuration > 0 ? maxSlotDuration : 0,
      maxSlotCapacity: 1,
      daysOff: daysOff,
      excludedResources: excludedResources,
      days: _$1.map(cracSlots, function (cracSlot) {
        var date = cracSlot.date;

        var dayBounds;
        //dayBounds = getDayBoundsFromAllTimetables(date, resourceTimetables,resourceEvenOddTimeTable,timetableType);
        dayBounds = getDayBoundsFromCracSlot$1(date, cracSlot);

        if (!dayBounds) {
          var dayOffDate = isoDateForDayOff$1(date);
          business.resources.forEach(function (rr) {
            return excludedResource(rr.id, dayOffDate);
          });

          return {
            date: date,
            slots: {
              busy: [],
              available: false
            }
          };
        } else {
          var dayStart = dayBounds.start;
          var startTime = dayBounds.start_time;
          var dayEnd = dayBounds.end;

          var slots = getCrunchSlotsFromCrac(cracSlot, date, dayStart, dayEnd, maxSlotDuration);

          if (cracSlot.excludedResources) {
            var _dayOffDate = isoDateForDayOff$1(date);
            cracSlot.excludedResources.forEach(function (rid) {
              return excludedResource(rid, _dayOffDate);
            });
          }

          return {
            date: date,
            start_time: slots.start_time || startTime,
            end_time: slots.end_time || dayBounds.end_time,
            slots: slots
          };
        }
      })
    };

    // Post processing of excludedResources
    var daysCount = busySlotsResponse.days.length;
    for (var resourceId in excludedResourcesCountMap) {
      if (Object.prototype.hasOwnProperty.call(excludedResourcesCountMap, resourceId)) {
        if (excludedResourcesCountMap[resourceId] >= daysCount) {
          excludedResources.push(resourceId);
        }
      }
    }

    return busySlotsResponse;
  }

  function setSlotSize$2(slotSize) {
    SLOT_SIZE$2 = slotSize;
  }

var Crac = Object.freeze({
    cracValueToBits: cracValueToBits,
    setAnd: setAnd$1,
    setUnion: setUnion$1,
    prepareSlots: prepareSlots$1,
    toBusySlots: toBusySlots$1,
    setSlotSize: setSlotSize$2
  });

  // Remove this function after migration
  function calcCRACSlotIntermediate$1(slot, vectorSlotSize) {
    return slot.resources.reduce(function (ret, res) {
      var bitset = res.taxonomyBitSet ? setAnd$1(cracValueToBits(res.bitset), cracValueToBits(res.taxonomyBitSet)) : cracValueToBits(res.bitset);
      return setUnion$1(ret, bitset);
    }, '0'.repeat(vectorSlotSize === 5 ? 288 : 1440).split('').map(function () {
      return 0;
    }));
  }



  var CracUtils = Object.freeze({
    calcCRACSlotIntermediate: calcCRACSlotIntermediate$1
  });

  var index = {
    DateTime: DateTime,
    BusySlots: BusySlots,
    Booking: Booking,
    Schedule: Schedule,
    roundNumberUsingRule: roundNumberUsingRule,
    phoneUtils: phoneUtils,
    langUtils: langUtils,
    taxonomies: taxonomies,
    Taxonomies: taxonomies,
    Resources: Resources,
    ResourcesMostFree: ResourcesMostFree,
    Discounts: Discounts,
    Crac: Crac,
    CracUtils: CracUtils
  };

  return index;

}));