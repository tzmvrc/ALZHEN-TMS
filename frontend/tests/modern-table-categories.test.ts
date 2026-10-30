import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modernColumnCategory,modernColumnHeaderStyle,modernCategoryColumns} from '../src/services/modern-table-categories.ts';
test('report categories use field meaning before generic trip prefixes',()=>{
  for(const [key,title,expected] of [['trip_total_cbm','Total CBM','cargo'],['trip_loading_date','Loading date','warehouse'],['store_contact','Store contact','calling'],['pod_status','POD status','transmittal'],['dispatch_number','Dispatch number','booking'],['assigned_plate','Plate no.','transport']]){
    assert.equal(modernColumnCategory(key,title).key,expected);
  }
});
test('headers and legends share category colors',()=>{
  const category=modernColumnCategory('quantity','Quantity');
  const header=modernColumnHeaderStyle('quantity','Quantity');
  assert.equal(header.color,"#5b6b85");
  assert.equal(header.borderTop,`3px solid ${category.color}`);
  assert.equal(header.backgroundColor,"#ffffff");
});

test('category filters preserve column order and recover when a category is hidden',()=>{
 const columns=[{key:'qty',title:'Quantity'},{key:'loading_date',title:'Loading date'},{key:'cbm',title:'CBM'}];
 assert.deepEqual(modernCategoryColumns(columns,'cargo').map(column=>column.key),['qty','cbm']);
 assert.equal(modernCategoryColumns(columns,'all'),columns);
 assert.equal(modernCategoryColumns(columns,'calling'),columns);
});
