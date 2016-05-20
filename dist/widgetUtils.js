(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('lodash'), require('moment')) : typeof define === 'function' && define.amd ? define(['lodash', 'moment'], factory) : global.WidgetUtils = factory(global._, global.moment);
})(this, function (_, moment) {
  'use strict';

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

  var utcOffset = function (date) {
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

  var busySlotsDate = function (date) {
    return getDateLikeUTC(date).startOf('day').toISOString();
  };

  /**
   * Convert date to business timezone like it UTC
   *
   * @param date
   * @param businessData
   */
  var getBusinessDateLikeUTC = function (date, businessData) {
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

  var DateTime = Object.freeze({
    setBusinessDateTZ: setBusinessDateTZ,
    businessTimezoneUtcOffset: businessTimezoneUtcOffset,
    startBusinessTZDay: startBusinessTZDay,
    getDateLikeUTC: getDateLikeUTC,
    busySlotsInterval: busySlotsInterval
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
    return !!(widgetConfiguration && widgetConfiguration.bookableMonthsCount > 0 && moment().add('M', widgetConfiguration.bookableMonthsCount - 1).endOf('M').isBefore(date));
  }

  var BusySlots = Object.freeze({
    calculateDaySlotsV1: calculateDaySlotsV1,
    calculateDaySlotsV2: calculateDaySlotsV2,
    checkDate: checkDate,
    isBusyDay: isBusyDay,
    isDateForbidden: isDateForbidden
  });

  var widgetUtils = {
    DateTime: DateTime,
    BusySlots: BusySlots
  };

  return widgetUtils;
});