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
    function commitSlot(endMinutes) {
      var startMinues = currentSlot.start;
      var time = resultDate.clone().set({
        minutes: startMinues % 60,
        hours: Math.floor(startMinues / 60)
      });
      currentSlot.time = time.toISOString();
      currentSlot.startTS = time.unix();
      currentSlot.end = endMinutes;
      currentSlot.duration = endMinutes - startMinues;
      busySlots.push(currentSlot);
      currentSlot = undefined;
    }

    function makeSlot(startMinutes) {
      // Make busy slot
      currentSlot = {
        space_left: 0,
        start: startMinutes,
        partial_busy: null
      };
    }

    // console.log('bitmask:', bitmask.slice(reverseOffset - endBitIndex + 1, reverseOffset - startBitIndex).join(''), date);

    // Walking through bitmaks in reverse direction.
    for (var ii = startBitIndex; ii < endBitIndex; ii++) {
      var bitIndex = reverseOffset - ii;
      var bit = bitmask[bitIndex];
      var minutes = ii * SLOT_SIZE;

      if (bit === 0) {
        available = true;

        if (currentSlot) {
          commitSlot(minutes - SLOT_SIZE);
        }
      } else if (bit === 1) {
        if (!currentSlot) {
          makeSlot(minutes);
        } else if (maxSlotSize > 0) {
          var duration = minutes - currentSlot.start;
          if (duration > maxSlotSize) {
            commitSlot(minutes - SLOT_SIZE);
            makeSlot(minutes - SLOT_SIZE);
          }
        }
      }
    }

    if (currentSlot) {
      commitSlot((endBitIndex - 1) * SLOT_SIZE);
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

    return {
      taxonomyId: taxonomyIDs && taxonomyIDs[0],
      slots_size: maxSlotDuration > 0 ? maxSlotDuration : 0,
      maxSlotCapacity: 1,
      daysOff: daysOff,
      excludedResources: [],
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

        return {
          date: date,
          start_time: slots.start_time || dayBounds.start_time,
          end_time: slots.end_time || dayBounds.end_time,
          slots: slots
        };
      }))
    };
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

  var widgetUtils = {
    DateTime: DateTime,
    BusySlots: BusySlots,
    Booking: Booking,
    Crac: Crac,
    roundNumberUsingRule: roundNumberUsingRule
  };

  return widgetUtils;

}));