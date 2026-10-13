import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceAmount} from '../src/ui-format.js';

test('resource balances keep early economy exact and bound late-game display width',()=>{
  assert.equal(resourceAmount(550.95),'550');assert.equal(resourceAmount(9999),'9999');assert.equal(resourceAmount(10000),'10K');assert.equal(resourceAmount(1234567),'1.23M');assert.equal(resourceAmount(987654321),'988M');assert.equal(resourceAmount(1234567890123),'1.23T');
});
test('resource display does not conceal negative or invalid balances',()=>{
  assert.equal(resourceAmount(-12),'-12');assert.equal(resourceAmount(-10000),'-10K');for(const value of [NaN,Infinity,-Infinity])assert.equal(resourceAmount(value),'—');
});
