"use strict";

/**
 * "Нарезает" слоты из определённого промежуточного формата (busySlots, crac, любой другой) 
 * в формат представления их на UI.
 */
export class ScheduleSlotsCutter {
  cutSlots() {
    throw new Error('abstract method ScheduleSlotsCutter::cutSlots');
  }
}