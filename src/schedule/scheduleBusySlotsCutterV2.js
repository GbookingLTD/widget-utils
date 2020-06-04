"use strict";

import * as _ from 'lodash';
import moment from 'moment-timezone';
import {getServiceDiscountsAndExceptions} from "../discounts";
import {ScheduleBusySlotsCutter} from "./scheduleBusySlotsCutter";

export class ScheduleBusySlotsCutterV2 extends ScheduleBusySlotsCutter {
  constructor(businessData, busySlots, serviceId, worker, currentService, multiServices, logedInProfile, appointmentCount) {
    super();
    this.initialize(businessData, busySlots, serviceId, worker, currentService, multiServices, true);
    this.logedInProfile = logedInProfile;
    this.appointmentCount = appointmentCount;
  }

  cutSlots(busySlotsDay, now) {
    let slots = [];
    let self = this;
    var taxiParkUser = !_.isUndefined(self.logedInProfile) && !_.isUndefined(self.logedInProfile.yandexTaxiParkType);
    busySlotsDay.slots.forEach(function (slot) {
      if (!_.isUndefined(slot.busy) && slot.busy && (_.isUndefined(slot.space_left) || slot.space_left <= 0)) {
        return;
      }

      var slot_time = moment.utc(busySlotsDay.date).add(slot.time, 'm');
      var overQuota = false;
      if (taxiParkUser) {
        var slotAppointmentCount = slot_time.format("DD.MM.YYYY");
        if (!_.isUndefined(self.appointmentCount) && !_.isUndefined(self.appointmentCount[slotAppointmentCount]) && self.appointmentCount[slotAppointmentCount] >= self.logedInProfile.yandexTaxiParkDayLimitation) {
          overQuota = true;
        }
      }

      var workTime = moment(now);
      if (self.minTimeBooking && self.minTimeBooking > 0) {
        workTime.add(self.minTimeBooking, 'hour');
        self.alignMinTimeBooking && workTime.endOf('day');
      }

      var duration = slot.duration || self.slotSize;
      var spaceLeft;
      if (!_.isUndefined(slot.space_left)) {
        spaceLeft = slot.space_left;
        if (spaceLeft === 1 && self.maxSlotCapacity > 0) {
          spaceLeft = self.maxSlotCapacity;
        }
      } else {
        spaceLeft = self.maxSlotCapacity;
      }


      var actualSlot = moment(slot_time);
      var slotDiscount = getServiceDiscountsAndExceptions(self.businessData, self.taxonomy, actualSlot);
      slots.push({
        actualSlot: actualSlot,
        slotTime: slot_time.format('LT'),
        spaceLeft: spaceLeft,
        busy: workTime.isAfter(actualSlot) || spaceLeft === 0,
        overQuota: overQuota,
        multiService: (self.multiServices && self.multiServices.length),
        hasDiscount: !!slotDiscount.discount,
        discount: slotDiscount.discount,
        showPopup: !self.dontShowPopup
      });
      slot_time.add('minutes', self.forceSlotSize ? self.slotSize : duration);
    });

    return slots;
  }
}
