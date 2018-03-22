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
    var startTime = moment.utc(slotDay.start_time);
    var endTime = moment.utc(slotDay.end_time);

    var now = moment.utc();
    var businessOffset = moment.tz(now, businessData.business.general_info.timezone);
    var businessNow = moment.utc().add(businessOffset._offset,'m');

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

