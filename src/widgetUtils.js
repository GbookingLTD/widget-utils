"use strict";

var setBusinessDateTZ = function(businessData, date) {
  var timeOffset = businessData.business.general_info.timezone ?
    parseInt(businessData.business.general_info.timezone, 10) : utcOffset(moment());

  if (isNaN(timeOffset)) {
    date.tz(businessData.business.general_info.timezone);
  } else {
    date.zone(-timeOffset);
  }

  return date;
};

var utcOffset = function(date) {
  return date.utcOffset ? date.utcOffset() : -date.zone();
};

var businessTimezoneUtcOffset = function(businessData) {
  var curDate = setBusinessDateTZ(businessData, moment.utc());
  return utcOffset(curDate);
};

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
var startBusinessTZDay = function(businessData, utcDate) {
  var originalDateUnits = _.reduce(['year', 'month', 'date'], function(ret, unit) {
    ret[unit] = utcDate.get(unit);
    return ret;
  }, {});

  setBusinessDateTZ(businessData, utcDate);

  _.each(originalDateUnits, function(value, unit) {
    utcDate.set(unit, value);
  });

  // If timezone is greater than zero,
  // then add this offset to the time zone's business day was the same
  utcDate.startOf('day');
  var businessUtcOffset = businessTimezoneUtcOffset(businessData);
  if (businessUtcOffset > 0) {
    utcDate.add(businessUtcOffset, 'minute');
  }
};

var getDateLikeUTC = function(date) {
  return moment.utc(date).add(utcOffset(date), 'minute');
};

var busySlotsDate = function(date) {
  return getDateLikeUTC(date).startOf('day').toISOString();
};

var busySlotsInterval = function(date, businessData, daysToFetch) {
  if (!date) {
    date = moment.utc();
  }

  setBusinessDateTZ(businessData, date);

  var minBookingTime = moment.utc();
  businessData.business.general_info.min_booking_time &&
    minBookingTime.add('hours', businessData.business.general_info.min_booking_time);

  if (date < minBookingTime) {
    date = minBookingTime;
  }

  var then = moment(date).add('days', daysToFetch);
  return {
    startDate: busySlotsDate(date),
    endDate: busySlotsDate(then)
  };
};

var WidgetUtils = {
  setBusinessDateTZ: setBusinessDateTZ,
  businessTimezoneUtcOffset: businessTimezoneUtcOffset,
  startBusinessTZDay: startBusinessTZDay,
  getDateLikeUTC: getDateLikeUTC,
  busySlotsInterval: busySlotsInterval

};