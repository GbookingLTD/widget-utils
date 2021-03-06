"use strict";

const should = require('should');
const {Schedule} = require('../../dist/index');
const {busyBitSets, newBusyBitset, prepareBitset} =
  require('crac-utils/dist/cjs/vector');
const {mask_left1} =
  require('crac-utils/dist/cjs/utils');

const cracVectorOrder = 'reverse';

function reverseString(str) {
    var newString = "";
    for (var i = str.length - 1; i >= 0; i--) {
        newString += str[i];
    }
    return newString;
}

function stringCracVector(str, cracVectorSize) {
  cracVectorSize = cracVectorSize || 288;
  // string alignment
  if (str.length < cracVectorSize) {
    str += '0'.repeat(cracVectorSize - str.length);
  }
  if (cracVectorOrder === 'reverse') {
    str = reverseString(str);
  }
  return str;
}
describe('CRACResourcesAndRoomsSlot', function() {
  it('', function() {
    
  });
});
describe('ScheduleCracSlotsIterator (with cutSlotsWithoutBusyBounds)', function() {
  it('empty bitset', function() {
    const iterator = new Schedule.ScheduleCracSlotsIterator(busyBitSets[5], 5, 30, 30);
    should(iterator.nextSlot()).be.equal(null);
  });
  it('first 6 bits should return 1 slot', function() {
    let bitset = newBusyBitset(5);
    bitset[0] = (bitset[0] | mask_left1[6]) >>> 0;
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 30, 30);
    iterator.nextSlot().should.have.properties({
      start: 0,
      end: 30,
      available: true
    });
    should(iterator.nextSlot()).be.equal(null);
  });
  it('find start end bounds of day by 1 bit', function() {
    let str = stringCracVector('01' + '0'.repeat(284) + '10');
    let bitset = prepareBitset(str, 5);
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 30, 30);
    iterator.dayBounds.start.should.be.equal(5);
    iterator.dayBounds.end.should.be.equal(1435);
  });
  it('2 slots starts from 600 minutes', function() {
    let str = stringCracVector('0'.repeat(120) + '1'.repeat(7));
    let bitset = prepareBitset(str, 5);
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 30, 5);
    iterator.nextSlot().should.have.properties({
      start: 600,
      end: 630,
      available: true
    });
    iterator.nextSlot().should.have.properties({
      start: 605,
      end: 635,
      available: true
    });
    should(iterator.nextSlot()).be.equal(null);
  });
  it('2 slots with break between it', function() {
    let str = stringCracVector('1'.repeat(6) + '0'.repeat(6) + '1'.repeat(6));
    let bitset = prepareBitset(str, 5);
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 30, 30);
    iterator.nextSlot().should.have.properties({
      start: 0,
      end: 30,
      available: true
    });
    iterator.nextSlot().should.have.properties({
      start: 30,
      end: 60,
      available: false
    });
    iterator.nextSlot().should.have.properties({
      start: 60,
      end: 90,
      available: true
    });
    should(iterator.nextSlot()).be.equal(null);
  });
  it('2 active slots 1 busy 5 active starts with 10:00 (1 min cracSlotSize)', function() {
    let str = stringCracVector('0'.repeat(600) + '1'.repeat(60) + '0'.repeat(25) + '1'.repeat(150), 1440);
    let bitset = prepareBitset(str, 1);
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 1, 30, 30);
    iterator.nextSlot().should.have.properties({
      start: 600,
      end: 630,
      available: true
    });
    iterator.nextSlot().should.have.properties({
      start: 630,
      end: 660,
      available: true
    });
    for (let i = 0; i < 5; ++i) {
      iterator.nextSlot().should.have.properties({
        start: 685 + i * 30,
        end: 685 + (i + 1) * 30,
        available: true
      });
    }
    should(iterator.nextSlot()).be.equal(null);
  });
  it('(optimisation) find available slot start from tail of current', function() {
    let str = stringCracVector('100' + '1'.repeat(6));
    let bitset = prepareBitset(str, 5);
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 30, 10);
    iterator.nextSlot().should.have.properties({
      start: 0,
      end: 30,
      available: false
    });
    iterator.nextSlot().should.have.properties({
      start: 15,
      end: 45,
      available: true
    });
    should(iterator.nextSlot()).be.equal(null);
  });
  it('should strict slot cut', function() {
    // 111 100 000 011 111
    const str = stringCracVector('1'.repeat(4) + '0'.repeat(6) + '1'.repeat(5));
    const bitset = prepareBitset(str, 5);
    const options = {strictSlotCutting: true};
    const iterator = new Schedule.ScheduleCracSlotsIterator(bitset, 5, 15, 15, options);
    iterator.nextSlot().should.have.properties({
      start: 0,
      end: 15,
      available: true
    });
    iterator.nextSlot().should.have.properties({
      start: 15,
      end: 30,
      available: false
    });
    iterator.nextSlot().should.have.properties({
      start: 30,
      end: 45,
      available: false
    });
    iterator.nextSlot().should.have.properties({
      start: 45,
      end: 60,
      available: false
    });
    iterator.nextSlot().should.have.properties({
      start: 60,
      end: 75,
      available: true
    });
    should(iterator.nextSlot()).be.equal(null);
  });
});
