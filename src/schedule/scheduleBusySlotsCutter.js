"use strict";

import {ScheduleSlotsCutter} from "./scheduleSlotsCutter";
import {getServiceDuration} from "../taxonomies";

export class ScheduleBusySlotsCutter extends ScheduleSlotsCutter {
  initialize(businessData, busySlots, serviceId, worker, currentService, multiServices, isGT) {
    this.businessData = businessData;
    this.alignmentTaxonomySlots = businessData.business.widget_configuration.alignmentTaxonomySlots;

    let taxonomy;
    if (serviceId.toLowerCase() === 'multiservicebooking') {
      taxonomy = multiServices[0];
    }
    else {
      taxonomy = _.find(businessData.business.taxonomies, {id: ''+serviceId});
    }
    
    this.taxDuration = getServiceDuration(taxonomy, worker);
    
    this.totalDuration = 0;
    if (multiServices && multiServices.length) {
      taxonomy = multiServices[0];
      const self = this;
      multiServices.forEach(function(service) {
        self.totalDuration += getServiceDuration(service, worker);
      });
      this.taxDuration = this.totalDuration;
    }
    else {
      this.totalDuration = taxonomy.duration;
    }
    
    this.taxonomy = taxonomy;
    this.worker = worker;
    this.multiServices = multiServices;
    
    const widgetConfiguration = businessData.business.widget_configuration;
    this.forceSlotSize = widgetConfiguration && widgetConfiguration.displaySlotSize && 
      widgetConfiguration.displaySlotSize < this.taxDuration;
    const displaySlotSize = widgetConfiguration.displaySlotSize;
    this.slotSize = this.forceSlotSize ? widgetConfiguration.displaySlotSize : (busySlots.slot_size || this.taxDuration);
    this.maxSlotCapacity = busySlots.maxSlotCapacity;
    this.minTimeBooking = businessData.business.general_info.min_booking_time;
    this.alignMinTimeBooking = businessData.business.general_info.align_min_booking_time;
    // https://app.asana.com/0/search/364482197206303/141502515363228
    // this fix is for decreasing affected clients
    if (businessData.business.backofficeType === 'MB' && !_.isUndefined(displaySlotSize) && displaySlotSize !== this.taxDuration){
      this.minTimeBooking += 2;
    }
    
    this.dontShowPopup = (!currentService || !currentService.capacity) && (worker && worker.capacity === 1);
    if(!worker) {
      this.dontShowPopup = true; //FIXME: hide capacity popup if all workers selected while crunch bug not fixed
    }
    if (isGT) {
      this.dontShowPopup = false;
    }
  }
}
