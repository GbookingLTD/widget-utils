"use strict";

import moment from 'moment-timezone';
import { ScheduleBusySlotsCutter } from './scheduleBusySlotsCutter';
import { setBusinessDateTZ, getDateLikeUTC } from '../dateTime';
import { checkSlotInterval, alignmentBusySlotsByTaxonomyDuration } from '../busySlots';
import { getServiceDiscountsAndExceptions } from '../discounts';
import { getServiceDuration } from '../taxonomies';

/**
 * Ожидается набор слотов в формате busySlots.
 * Используется для "нарезания" busySlots слотов в режиме single booking.
 */
export class ScheduleBusySlotsCutterV1 extends ScheduleBusySlotsCutter {
  constructor(businessData, busySlots, serviceId, worker, currentService, multiServices) {
    super();
    this.initialize(businessData, busySlots, serviceId, worker, currentService, multiServices, false);
  }

  cutSlots(busySlotsDay, now) {
    return this._cutSlots(busySlotsDay, now, this.nextDay, this.multiServices, this.worker, this.taxonomy);
  }

  _cutSlots(busySlotsDay, now, nextDay, multiServices, worker, taxonomy) {
    const self = this;
    let slots = [];
    if (self.alignmentTaxonomySlots) {
      alignmentBusySlotsByTaxonomyDuration(busySlotsDay.start_time, self.taxDuration, self.slotSize, busySlotsDay.slots.busy);
    }

    var finish = moment.utc(busySlotsDay.end_time);
    var exceptionFound = false;
    var consequentDays = moment.utc(busySlotsDay.start_time).add(1, 'day').isSame(finish, 'day') &&
      nextDay && nextDay.start_time && nextDay.start_time.indexOf("T00:00:00") > -1;
    (busySlotsDay.slots.busy || []).forEach(function (slot) {
      slot.startTS = moment.utc(slot.time).unix();
    });

    for (var slot_time = moment.utc(busySlotsDay.start_time); slot_time.isBefore(finish);) {
      var dateCheck = checkSlotInterval(busySlotsDay.slots, slot_time.toDate(), self.taxDuration);
      var space = dateCheck[0]
        , duration = dateCheck[1]
        , busyStart = dateCheck[2];
      var spaceLeft = space;
      var forceDurationByBusyStart = 0;
      var startTimeChanged = false;
      if (busyStart) {
        var endBusySlot = moment.utc(busyStart).add('m', duration);
        forceDurationByBusyStart = endBusySlot.diff(slot_time, 'minute');
      }
      var slotTimeFinish = moment(slot_time).add('minutes', self.taxDuration);
      if (consequentDays && slotTimeFinish.isAfter(finish)) {
        var slotEndMinute = slotTimeFinish.hour() * 60 + slotTimeFinish.minute();
        if (nextDay && nextDay.slots && nextDay.slots.busy && nextDay.slots.busy.length > 0) {
          nextDay.slots.busy.forEach(function (nextDaySlot) {
            if (nextDaySlot.space_left === 0 && nextDaySlot.start < slotEndMinute) {
              spaceLeft = 0;
            }
          })
        }
      } else {
        if (slotTimeFinish.isAfter(finish)) {
          spaceLeft = 0;
        }
      }

      var busy = false;
      if (spaceLeft === 1 && self.maxSlotCapacity > 0) {
        spaceLeft = -self.maxSlotCapacity;
      }

      // backward lookup
      var bs = null;
      if (spaceLeft === 0) {
        // intersection of current slot with some busy slot
        const st = slot_time.unix();
        const slot_end = st + self.slotSize * 60;
        bs = (busySlotsDay.slots.busy || []).find(function (busySlot) {
          var busySlotDuration = busySlot.duration || self.slotSize;
          var busySlotEndTS = busySlot.startTS + busySlotDuration * 60;
          return st <= busySlot.startTS && slot_end > busySlot.startTS || st >= busySlot.startTS && st < busySlotEndTS;
        });

        if (bs) {
          self.totalDuration = self.slotSize;
          if (this.multiServices && this.multiServices.length > 0) {
            self.totalDuration = 0;
            this.multiServices.forEach(function (t) {
              self.totalDuration += getServiceDuration(t, worker);
            })
          }
          var currentSlotBackRange = moment.range(moment(bs.time).add('m', -self.totalDuration), moment(bs.time));
          /* jshint loopfunc:true */
          slots.forEach(function (s) {
            if (!s.busy) {
              s.busy = s.actualSlot.within(currentSlotBackRange) && !currentSlotBackRange.start.isSame(s.actualSlot);
            }
          });
        }
      }

      if (!consequentDays && moment(slot_time).add('m', self.slotSize).isAfter(finish)) {
        space = 0;
      }

      var actualSlot = moment(slot_time);

      var slot = {
        provider: 'LOCAL'
      };

      var additionalTaxonomyDiscounts = [];

      var socialSharing = self.businessData.business.widget_configuration.socialSharing;
      var campaign = self.businessData.business.widget_configuration.campaign;
      // ignore regular discounts & discount exceptions & campaigns, if social token is enabled
      if (self.businessData.business.socialTokenEnabled && socialSharing.discountEnabled) {
        slot.discount = 0;
      }
      else if (campaign && campaign.valid && campaign.provider) {
        if (self.multiServices && self.multiServices.length) {
          let tempSlot;
          self.multiServices.forEach(function (service) {
            var foundService = _(self.businessData.business.taxonomies).find({id: '' + service.id});
            tempSlot = getServiceDiscountsAndExceptions(self.businessData, foundService, actualSlot);
            if (!tempSlot || (!slot.discount && tempSlot.discount) || (tempSlot.discount && slot.discount && tempSlot.discount > slot.discount)) {
              slot = tempSlot;
            }
          });
        }
        else {
          slot = getServiceDiscountsAndExceptions(self.businessData, taxonomy, actualSlot, campaign.provider);
        }
        if (slot.provider === 'LOCAL' && campaign.externalDiscountsOnly) {
          slot.discount = 0;
          busy = true;
        }
        else if (slot.provider !== 'LOCAL' && slot.provider !== campaign.provider) {
          slot.discount = 0;
        }
      }
      else {
        if (multiServices && multiServices.length) {
          let tempSlot;
          multiServices.forEach(function (service) {
            var foundService = _(self.businessData.business.taxonomies).find({id: '' + service.id});
            tempSlot = getServiceDiscountsAndExceptions(self.businessData, foundService, actualSlot);
            if (!tempSlot || (!slot.discount && tempSlot.discount) || (tempSlot.discount && slot.discount && tempSlot.discount > slot.discount)) {
              slot = tempSlot;
            }
            if (tempSlot.discount) {
              additionalTaxonomyDiscounts.push({
                taxonomyID: service.id,
                discount: tempSlot.discount,
                discountType: tempSlot.type ? tempSlot.type : 'PERCENT'
              });
            }
          });
        }
        else {
          slot = getServiceDiscountsAndExceptions(self.businessData, taxonomy, actualSlot);
        }
        if (slot.isException) {
          exceptionFound = true;
        }
        if (slot.provider && slot.provider !== 'LOCAL') {
          slot.discount = 0;
        }
      }

      var businessNow = moment.utc();
      setBusinessDateTZ(self.businessData, businessNow);
      var businessNowLikeUTC = getDateLikeUTC(businessNow);
      if (!busy) {
        if (self.minTimeBooking && self.minTimeBooking > 0) {
          businessNowLikeUTC.add(self.minTimeBooking, 'hour');
        }
        busy = businessNowLikeUTC.isAfter(actualSlot) || space === 0 || busySlotsDay.forceAllSlotsBusy;
      }

      if (!busy && spaceLeft === 0 && bs && moment.utc(slot_time).add(-self.totalDuration, 'minutes').isBefore(moment.utc(bs.time).add(bs.duration, 'minutes'))) {
        slot_time = moment.utc(bs.time).add(bs.duration, 'minutes');
      }

      slots.push({
        actualSlot: actualSlot,
        slotTime: slot_time.format('LT'),
        spaceLeft: -spaceLeft,
        busy: busy,
        multiService: (multiServices && multiServices.length),
        hasDiscount: !!slot.discount,
        discount: slot.discount,
        additionalTaxonomyDiscounts: additionalTaxonomyDiscounts,
        isException: !!slot.isException,
        provider: slot.provider,
        showPopup: !self.dontShowPopup,
        slotSize: this.slotSize
      });

      if (busyStart) {
        if (
          moment.utc(busyStart).isAfter(slot_time) ||
          (moment.utc(busyStart).isBefore(slot_time) && moment.utc(busyStart).diff(slot_time, 'minute') === -1) //fix for crac 1 minute
        ) {
          slot_time = moment.utc(busyStart);
          startTimeChanged = true;
        }
      }
      // if we catch busy slot we should start from his end
      if (!startTimeChanged && forceDurationByBusyStart > 1 && forceDurationByBusyStart < duration) {
        duration = forceDurationByBusyStart;
      }
      slot_time.add('minutes', self.forceSlotSize ? this.slotSize : duration);
    }

    //disregards regular discounts if discount exception is found for this day
    if (exceptionFound) {
      slots.forEach(function (s) {
        if (!s.isException && (!s.provider || s.provider === 'LOCAL')) {
          s.hasDiscount = false;
          s.discount = 0;
        }
      });
    }

    let lastNotBusy;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (!slots[i].busy) {
        break;
      } else {
        lastNotBusy = i;
      }
    }

    if (lastNotBusy) {
      slots.splice(lastNotBusy);
    }

    return slots;
  }
}
