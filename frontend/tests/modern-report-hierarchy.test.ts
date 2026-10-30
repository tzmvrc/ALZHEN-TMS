import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportRowGroups} from '../src/services/modern-report-hierarchy.ts';

test('dispatch reports share parents across lines without merging stops',()=>{
  const row={dispatch_number:'D1',trip_id:'T1',trip_stop_id:'S1',dr_number:'DR1'};
  assert.deepEqual(reportRowGroups(row,'line1','dispatch'),reportRowGroups(row,'line2','dispatch'));
  assert.notEqual(reportRowGroups(row,'line1','dispatch').at(-1)?.id,reportRowGroups({...row,trip_stop_id:'S2'},'line2','dispatch').at(-1)?.id);
});
test('store and transmittal records group under delivery stops',()=>{
  for(const report of ['store-calling','transmittal-tracker']){
    const groups=reportRowGroups({dispatch_number:'D1',trip_id:'T1',trip_stop_id:'S1',delivered_to:'Same store'},'record',report);
    assert.deepEqual(groups.map(group=>group.kind),['dispatch','stop']);
    assert.equal(groups[1].label,'Same store');
    assert.notEqual(groups[1].id,reportRowGroups({trip_id:'T1',trip_stop_id:'S2',delivered_to:'Same store'},'record2',report)[1].id);
  }
});
test('missing relationship IDs cannot merge unrelated records',()=>{
  assert.notEqual(reportRowGroups({},'row1','dispatch')[0].id,reportRowGroups({},'row2','dispatch')[0].id);
  assert.notEqual(reportRowGroups({trip_id:'T1'},'row1','store-calling')[1].id,reportRowGroups({trip_id:'T1'},'row2','store-calling')[1].id);
});
test('legacy identity fields retain the same hierarchy',()=>{
  assert.deepEqual(reportRowGroups({_trip_id:'T1',_trip_stop_id:'S1'},'row','dispatch'),reportRowGroups({trip_id:'T1',trip_stop_id:'S1'},'row','dispatch'));
});
