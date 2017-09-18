import _ from 'lodash';
import moment from 'moment';
import { getDateLikeUTC, setBusinessDateTZ } from './dateTime';

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
export function calculateDaySlotsV1(day, taxonomy, slotSize, busySlots, businessData) {
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
    var space = dateCheck[0]
      , duration = dateCheck[1];
    var spaceLeft = space;
    var busy = false;
    if (spaceLeft === 1 && busySlots.maxSlotCapacity > 0) {
      spaceLeft = -busySlots.maxSlotCapacity;
    }

    if (spaceLeft === 0) {
      var currentSlotBackRange = moment.range(moment(slot_time).add('m', -(taxonomy.duration)), slot_time);
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

export function calculateDaySlotsV2(day, taxonomy, slotSize, busySlots){
  var slots = [];
  day.slots.forEach(function(slot){
    if (!_.isUndefined(slot.busy) && slot.busy && _.isUndefined(slot.space_left)){
      return;
    }
    var businessNow = moment.utc();
    var businessNowLikeUTC = getDateLikeUTC(businessNow);

    var slot_time = moment.utc(day.date).add(slot.time, 'm');
    var duration = slot.duration || slotSize;
    var spaceLeft;
    if(!_.isUndefined(slot.space_left)){
      spaceLeft = slot.space_left;
      if (spaceLeft === 1 && busySlots.maxSlotCapacity > 0) {
        spaceLeft = busySlots.maxSlotCapacity;
      }
    }else{
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

export function checkDate(slots, date, defaultStep) {
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

export function checkSlotInterval(dayBusySlots, date, defaultStep) {
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

export function isBusyDay(day, crunchv2, taxonomy, slotSize, busySlots, businessData) {
  var calculateDaySlots = crunchv2 ? calculateDaySlotsV2 : calculateDaySlotsV1;
  var slots = calculateDaySlots(day, taxonomy, slotSize, busySlots, businessData);
  var hasFreeSlot = _.find(slots, {busy: false});
  return !hasFreeSlot;
}

export function isDateForbidden(widgetConfiguration, date, ignoreStartDate) {
  if (ignoreStartDate === null || typeof ignoreStartDate == 'undefined') {
    ignoreStartDate = false;
  }

  if (widgetConfiguration && widgetConfiguration.bookableDateRanges &&  widgetConfiguration.bookableDateRanges.enabled) {
    var dateMoment = moment(date),
      dateAvailable = true,
      start = widgetConfiguration.bookableDateRanges.start,
      end = widgetConfiguration.bookableDateRanges.end;
    if (start && end && !ignoreStartDate) {
      dateAvailable = dateMoment.isAfter(moment(start).startOf('day')) && dateMoment.isBefore(moment(end).endOf('day'));
    }
    else if (start && !ignoreStartDate) {
      dateAvailable = dateMoment.isAfter(moment(start).startOf('day'));
    }
    else if (end) {
      dateAvailable = dateMoment.isBefore(moment(end).endOf('day'));
    }

    return !dateAvailable;
  }
  //bookable weeks calculation
  if (widgetConfiguration.bookableMonthsCount > 0 && widgetConfiguration.bookableMonthsCount < 1) {
    var weeks = Math.round(widgetConfiguration.bookableMonthsCount / 0.23);
    return moment().add(weeks, 'weeks').isBefore(date)
  }

  return !!(widgetConfiguration && widgetConfiguration.bookableMonthsCount > 0 && moment().add('M', widgetConfiguration.bookableMonthsCount - 1).endOf('M').isBefore(date));
}
