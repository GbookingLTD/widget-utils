import _ from 'lodash';
import moment from 'moment';
import { alignSlotTime, getDateLikeUTC, setBusinessDateTZ } from './dateTime';
import { isDateForbidden, checkDate } from './busySlots';

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
export function calendarBookingTime(businessData, busySlots, slotSize, day, isGT) {
  var widgetConfiguration = businessData.business.widget_configuration;
  if (isDateForbidden(widgetConfiguration, day.date)) {
    return;
  }
  if(isGT){
    return calendarBookingTimeGT(businessData, busySlots, slotSize, day);
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

    businessData.business.general_info.min_booking_time &&
      businessNowLikeUTC.add('hours', businessData.business.general_info.min_booking_time);

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

function calendarBookingTimeGT(businessData, slots, slotSize, day) {

  var slotDay = _(slots.days).find(function (d) {
    return moment(d.date).isSame(day.date, 'day');
  });
  var selectedSlot = undefined;
  if (slotDay && slotDay.slots && slotDay.slots.length > 0) {
    for (var i = 0; i < slotDay.slots.length; i++) {
      if (slotDay.slots[i].space_left > 0) {
        var checkSlot = moment.utc(slotDay.date).add(slotDay.slots[i].time, 'm');
        if(checkSlot > moment.utc()){
          selectedSlot = checkSlot;
          break;
        }
      }
    }
    return selectedSlot;
  }
}

