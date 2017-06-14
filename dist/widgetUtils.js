(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('lodash'), require('moment')) :
  typeof define === 'function' && define.amd ? define(['lodash', 'moment'], factory) :
  (global.WidgetUtils = factory(global._,global.moment));
}(this, function (_,moment) { 'use strict';

  _ = 'default' in _ ? _['default'] : _;
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
    var originalDateUnits = _.reduce(['year', 'month', 'date'], function (ret, unit) {
      ret[unit] = utcDate.get(unit);
      return ret;
    }, {});

    setBusinessDateTZ(businessData, utcDate);

    _.each(originalDateUnits, function (value, unit) {
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
    if (quantum === 0 || 60 % quantum !== 0) throw new Error('invalid time quantum');
    return Math.ceil(minutes / quantum) * quantum;
  }

  function alignSlotTime(startTime, slotSize, m) {
    var diff = m.diff(startTime, 'minute');
    var alignedDiff = alignTimeByQuantum(diff, slotSize);
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

  function calculateDaySlotsV2(day, taxonomy, slotSize, busySlots) {
    var slots = [];
    day.slots.forEach(function (slot) {
      if (!_.isUndefined(slot.busy) && slot.busy && _.isUndefined(slot.space_left)) {
        return;
      }

      var slot_time = moment.utc(day.date).add(slot.time, 'm');
      var duration = slot.duration || slotSize;
      var spaceLeft;
      if (!_.isUndefined(slot.space_left)) {
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
        busy: now.isAfter(actualSlot) || spaceLeft === 0
      });
      slot_time.add('minutes', slotSize);
    });

    return slots;
  }

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

  function isBusyDay(day, crunchv2, taxonomy, slotSize, busySlots, businessData) {
    var calculateDaySlots = crunchv2 ? calculateDaySlotsV2 : calculateDaySlotsV1;
    var slots = calculateDaySlots(day, taxonomy, slotSize, busySlots, businessData);
    var hasFreeSlot = _.find(slots, { busy: false });
    return !hasFreeSlot;
  }

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
  function calendarBookingTime(businessData, busySlots, slotSize, day) {
    var widgetConfiguration = businessData.business.widget_configuration;
    if (isDateForbidden(widgetConfiguration, day.date)) {
      return;
    }
    var slotDay = _(busySlots.days).find(function (d) {
      return moment(d.date).isSame(day.date, 'day');
    });
    if (slotDay) {
      var startTime = new Date(slotDay.start_time);
      var endTime = new Date(slotDay.end_time);

      var businessNow = moment.utc();
      setBusinessDateTZ(businessData, businessNow);
      var businessNowLikeUTC = getDateLikeUTC(businessNow);

      businessData.business.general_info.min_booking_time && businessNowLikeUTC.add('hours', businessData.business.general_info.min_booking_time);

      if (businessNowLikeUTC.isSame(moment.utc(startTime), 'day') && moment.utc(startTime) < businessNowLikeUTC) {
        startTime = alignSlotTime(moment.utc(startTime), slotSize, businessNowLikeUTC);
      }

      while (startTime.getTime() < endTime.getTime()) {
        var dateCheck = checkDate(slotDay.slots, startTime);
        if (dateCheck[0] !== 0) {
          return moment.utc(startTime);
        }
        startTime.setUTCMinutes(startTime.getMinutes() + dateCheck[1]);
      }
    }
  }

var Booking = Object.freeze({
    calendarBookingTime: calendarBookingTime
  });

  var SLOT_SIZE = 5;

  // Compute start_time/end_time according to given day schedule.
  function getDayBoundsFromShedule(daySchedule, date) {
    return {
      start_time: moment(date).startOf('day').add(daySchedule.start, 'minutes').utc().toDate().toString(),
      start: daySchedule.start,

      end_time: moment(date).startOf('day').add(daySchedule.end, 'minutes').utc().toDate().toString(),
      end: daySchedule.end
    };
  }

  // Return day bounds for day from timetable using cache.
  function getDayBoundsFromTimetable(date, timetable) {
    var timetableCache = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    if (timetable.active !== true) {
      return null;
    }

    var weekday = moment(date).weekday();

    if (timetableCache[weekday]) {
      return timetableCache[weekday];
    }

    var dayScheduleArray = void 0;
    switch (weekday) {
      case 0:
      case 7:
        dayScheduleArray = timetable.week.sun;break;
      case 1:
        dayScheduleArray = timetable.week.mon;break;
      case 2:
        dayScheduleArray = timetable.week.tue;break;
      case 3:
        dayScheduleArray = timetable.week.wed;break;
      case 4:
        dayScheduleArray = timetable.week.thu;break;
      case 5:
        dayScheduleArray = timetable.week.fri;break;
      case 6:
        dayScheduleArray = timetable.week.sat;break;
      default:
        return null;
    }

    var daySchedule = dayScheduleArray && dayScheduleArray[0];
    if (daySchedule) {
      var dayBounds = getDayBoundsFromShedule(daySchedule, date);
      timetableCache[weekday] = dayBounds;
      return dayBounds;
    }

    return null;
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
    var reverseOffset = bitmask.length - 1;
    var startBitIndex = typeof startMinutes === 'undefined' ? 0 : Math.floor(startMinutes / SLOT_SIZE);
    var endBitIndex = typeof endMinutes === 'undefined' ? reverseOffset : Math.floor(endMinutes / SLOT_SIZE);
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
        duration: SLOT_SIZE,
        partial_busy: null
      };

      // console.info('makeSlot', startMinutes);
    }

    // console.log(date, bitmask.slice(reverseOffset - endBitIndex + 1, reverseOffset - startBitIndex).join(''));

    // Walking through bitmaks in reverse direction.
    for (var ii = startBitIndex; ii < endBitIndex; ii++) {
      var bitIndex = reverseOffset - ii;
      var bit = bitmask[bitIndex];
      var minutes = ii * SLOT_SIZE;

      // console.log('--> ', ii, bit, minutes);

      if (bit === 1) {
        if (!currentSlot) {
          // console.info('switched to `1` bit', minutes);
          makeSlot(minutes);
          // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);
        } else {
          currentSlot.duration += SLOT_SIZE;
          // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);

          if (currentSlot.duration >= maxSlotSize) {
            commitSlot();
            // console.info('separate by maxSlotSize', maxSlotSize);
            makeSlot(minutes);
          }
        }
      } else if (bit === 0) {
        available = true;
        if (currentSlot) {
          // console.info('switched to `0` bit', minutes);
          commitSlot();
        }
      }
    }

    if (currentSlot) {
      // console.info('ensure last slot');
      commitSlot();
    }

    var busySlotsLength = busySlots.length;

    // Change start_time bounds according to near available time.
    if (bitmask[reverseOffset - startBitIndex] === 1) {
      var startSlot = busySlots[0];
      for (var _ii = 1; _ii < busySlotsLength; _ii++) {
        var slot = busySlots[_ii];
        if (startSlot.end === slot.start) {
          startSlot = slot;
        } else {
          break;
        }
      }

      start_time = moment.utc(date).startOf('day').add(startSlot.end, 'minutes').toISOString();
    }

    // Change end_time bounds according to near available time.
    if (bitmask[reverseOffset - endBitIndex + 1] === 1) {
      var endSlot = busySlots[busySlotsLength - 1];
      for (var _ii2 = busySlotsLength - 2; _ii2 >= 0; _ii2--) {
        var _slot = busySlots[_ii2];
        if (endSlot.start === _slot.end) {
          endSlot = _slot;
        } else {
          break;
        }
      }

      end_time = endSlot.time;
    }

    return {
      available: available,
      busy: busySlots,
      start_time: start_time,
      end_time: end_time
    };
  }

  /**
   * Presense CRAC data type as Crunch' Busy Slots
   *
   * Its need for soft migration from Crunch to CRAC
   *
   * @param  {CracBusySlots|Array<Object>} cracSlots CRAC response format
   * @return {CrunBusySlot|Object}           Crunch response format
   */
  function toBusySlots(cracSlots, business, taxonomyIDs) {
    var businessTimetable = business.general_info.timetable;
    var businessTimetableCache = {};
    var daysOff = [];
    var excludedResources = [];
    var excludedResourcesCountMap = {};
    var visitedDaysCount = 0;
    var maxSlotDuration = -1;

    // TODO: compute daysOff when all day of resource is not available.

    if (taxonomyIDs && taxonomyIDs.length) {
      var taxonomies = _.filter(business.taxonomies, function (tt) {
        return taxonomyIDs.indexOf(String(tt.id)) >= 0;
      });

      var maxTaxonomyDuration = _.max(taxonomies, 'duration');
      if (maxTaxonomyDuration) {
        maxSlotDuration = maxTaxonomyDuration.duration;
      }
    }

    var busySlotsResponse = {
      taxonomyId: taxonomyIDs && taxonomyIDs[0],
      slots_size: maxSlotDuration > 0 ? maxSlotDuration : 0,
      maxSlotCapacity: 1,
      daysOff: daysOff,
      excludedResources: excludedResources,
      days: _.filter(_.map(cracSlots, function (cracSlot) {
        var date = cracSlot.date;


        var dayBounds = getDayBoundsFromTimetable(date, businessTimetable, businessTimetableCache);
        if (!dayBounds) {
          cracSlot.resources.forEach(function (resourceId) {
            daysOff.push({
              date: date,
              resource_id: resourceId
            });
          });
          return null;
        }

        var slots = getCrunchSlotsFromCrac(cracSlot, date, dayBounds.start, dayBounds.end, maxSlotDuration);

        if (cracSlot.excludedResources) {
          cracSlot.excludedResources.forEach(function (resourceId) {
            return excludedResourcesCountMap[resourceId] = (excludedResourcesCountMap[resourceId] || 0) + 1;
          });
        }

        visitedDaysCount++;

        return {
          date: date,
          start_time: slots.start_time || dayBounds.start_time,
          end_time: slots.end_time || dayBounds.end_time,
          slots: slots
        };
      }))
    };

    // Post processing of excludedResources
    for (var resourceId in excludedResourcesCountMap) {
      if (Object.prototype.hasOwnProperty.call(excludedResourcesCountMap, resourceId)) {
        if (excludedResourcesCountMap[resourceId] >= visitedDaysCount) {
          excludedResources.push(resourceId);
        }
      }
    }

    return busySlotsResponse;
  }

var Crac = Object.freeze({
    toBusySlots: toBusySlots
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

  var asyncGenerator = function () {
    function AwaitValue(value) {
      this.value = value;
    }

    function AsyncGenerator(gen) {
      var front, back;

      function send(key, arg) {
        return new Promise(function (resolve, reject) {
          var request = {
            key: key,
            arg: arg,
            resolve: resolve,
            reject: reject,
            next: null
          };

          if (back) {
            back = back.next = request;
          } else {
            front = back = request;
            resume(key, arg);
          }
        });
      }

      function resume(key, arg) {
        try {
          var result = gen[key](arg);
          var value = result.value;

          if (value instanceof AwaitValue) {
            Promise.resolve(value.value).then(function (arg) {
              resume("next", arg);
            }, function (arg) {
              resume("throw", arg);
            });
          } else {
            settle(result.done ? "return" : "normal", result.value);
          }
        } catch (err) {
          settle("throw", err);
        }
      }

      function settle(type, value) {
        switch (type) {
          case "return":
            front.resolve({
              value: value,
              done: true
            });
            break;

          case "throw":
            front.reject(value);
            break;

          default:
            front.resolve({
              value: value,
              done: false
            });
            break;
        }

        front = front.next;

        if (front) {
          resume(front.key, front.arg);
        } else {
          back = null;
        }
      }

      this._invoke = send;

      if (typeof gen.return !== "function") {
        this.return = undefined;
      }
    }

    if (typeof Symbol === "function" && Symbol.asyncIterator) {
      AsyncGenerator.prototype[Symbol.asyncIterator] = function () {
        return this;
      };
    }

    AsyncGenerator.prototype.next = function (arg) {
      return this._invoke("next", arg);
    };

    AsyncGenerator.prototype.throw = function (arg) {
      return this._invoke("throw", arg);
    };

    AsyncGenerator.prototype.return = function (arg) {
      return this._invoke("return", arg);
    };

    return {
      wrap: function (fn) {
        return function () {
          return new AsyncGenerator(fn.apply(this, arguments));
        };
      },
      await: function (value) {
        return new AwaitValue(value);
      }
    };
  }();

  var classCallCheck = function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };

  var createClass = function () {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  }();

  var phoneUtils = function () {
    function phoneUtils() {
      classCallCheck(this, phoneUtils);
    }

    createClass(phoneUtils, [{
      key: "getPhoneSettings",
      value: function getPhoneSettings(business, options) {
        options = options || {};
        var country = business.general_info.address.length ? business.general_info.address[0].country : "RU";
        country = country || "RU";
        if (options.unfilled && ["RU", "LV"].indexOf(country) >= 0) {
          country += "_UNFILLED";
        }
        if (options.dirty && ["RU", "LV"].indexOf(country) >= 0) {
          country += '_DIRTY';
        }
        return phoneUtils.phoneData[country] || phoneUtils.phoneData["RU"];
      }
    }, {
      key: "getCountryPhoneSettings",
      value: function getCountryPhoneSettings(countryCode) {
        return phoneUtils.phoneData[countryCode] || phoneUtils.phoneData["RU"];
      }
    }, {
      key: "getPhoneString",
      value: function getPhoneString(business, obj) {
        if (obj && obj.phone && obj.phone.length > 0) {
          var phone = this.getPhoneSettings(business).phoneStringMaker(obj.phone[0]);
          return phone.replace("++", "+");
        }
        return "";
      }
    }, {
      key: "getPhoneSettingsPhone",
      value: function getPhoneSettingsPhone(phoneSettings, phoneString) {
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
    }, {
      key: "getPhone",
      value: function getPhone(business, phoneString) {
        return this.getPhoneSettingsPhone(this.getPhoneSettings(business), phoneString);
      }
    }, {
      key: "isValidPhone",
      value: function isValidPhone(parsedPhone) {
        return parsedPhone && parsedPhone.country_code && typeof parsedPhone.area_code === "string" && typeof parsedPhone.number === "string" && (parsedPhone.area_code + parsedPhone.number).length >= 6;
      }
    }], [{
      key: "defaultExtractor",
      value: function defaultExtractor(value) {
        var regex = /\+(\d+)\((\d+)\) (\d+)-(\d+)/;
        return value.match(regex);
      }
    }, {
      key: "defaultStringMaker",
      value: function defaultStringMaker(p) {
        if (!p || !p.number) return '';
        //let p = person.phone[0];
        var p1 = p.number.length > 3 ? p.number.substr(0, 3) : '';
        var p2 = p.number.length > 3 ? p.number.substr(3) : '';
        return "+" + p.country_code + "(" + p.area_code + ") " + p1 + "-" + p2;
      }
    }, {
      key: "langCodes",
      get: function get() {
        return {
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
      }
    }, {
      key: "countryToLang",
      get: function get() {
        return {
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
      }
    }, {
      key: "phoneData",
      get: function get() {
        return {
          'AM': {
            code: '374',
            mask: '+374(99) 99-99-99',
            phoneExtractor: function phoneExtractor(value) {
              var digits = value.replace(/\D/g, '');
              return ['', '374', digits.substring(3, 5), digits.substring(5), ''];
            },
            phoneStringMaker: function phoneStringMaker(p) {
              if (!p || !p.number) return '';
              var p1 = p.number.length > 3 ? p.number.substr(0, 2) : '';
              var p2 = p.number.length > 3 ? p.number.substr(2, 2) : '';
              var p3 = p.number.length > 3 ? p.number.substr(4, 2) : '';
              return "+" + p.country_code + "(" + p.area_code + ") " + p1 + "-" + p2 + "-" + p3;
            }
          },
          'IL': {
            code: '972',
            mask: '9999999999',
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
              return phoneUtils.defaultStringMaker(p);
            }
          },
          'FR': {
            code: '33',
            mask: '9999999999',
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
              return phoneUtils.defaultStringMaker(p);
            }
          },
          'US': {
            code: '1',
            mask: '+1(999) 999-9999',
            phoneExtractor: phoneUtils.defaultExtractor,
            phoneStringMaker: phoneUtils.defaultStringMaker
          },
          'UA': {
            code: '380',
            mask: '+380(99) 999-9999',
            phoneExtractor: phoneUtils.defaultExtractor,
            phoneStringMaker: phoneUtils.defaultStringMaker
          },
          'LV': {
            code: '371',
            mask: '+(371) 99999999',
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
            phoneStringMaker: phoneUtils.defaultStringMaker
          },
          'RU_DIRTY': {
            code: '7',
            mask: '+7(999) 999-9999',
            phoneExtractor: function phoneExtractor(value) {
              var normalized = value.replace('-', '');
              return (/(\+.)\((.{3})\)\s(.{7})/.exec(normalized)
              );
            },
            phoneStringMaker: phoneUtils.defaultStringMaker
          },
          'RU': {
            code: '7',
            mask: '+7(999) 999-9999',
            phoneExtractor: function phoneExtractor(value) {
              var digits = value.replace(/\D/g, '');
              if (digits.length >= 10) {
                return ['', '7', digits.substring(digits.length - 10, digits.length - 7), digits.substring(digits.length - 7), ''];
              }
              return ['', '7', '', '', ''];
            },
            phoneStringMaker: phoneUtils.defaultStringMaker
          },
          'DE': {
            code: '49',
            rules: {
              "9": null,
              "d": /\d/
            },
            mask: '+49 (dd dd) dd dd dd',
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
      }
    }]);
    return phoneUtils;
  }();

  var widgetUtils = {
    DateTime: DateTime,
    BusySlots: BusySlots,
    Booking: Booking,
    Crac: Crac,
    roundNumberUsingRule: roundNumberUsingRule,
    phoneUtils: phoneUtils
  };

  return widgetUtils;

}));