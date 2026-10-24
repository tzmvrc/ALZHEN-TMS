import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isApprovedDemoTrip as backendIdentity} from '../src/services/demo-trip-identity.ts';
import {isApprovedDemoTrip as frontendIdentity} from '../../frontend/src/services/demo-trip-identity.ts';
const manifest=JSON.parse(await readFile(new URL('../migrations/proposals/2026_10_24_demo30_manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.counts.trips,30);
assert.equal(manifest.counts.trip_truck_assignments,40);
assert.equal(manifest.counts.trip_stops,60);
assert.equal(manifest.counts.trip_line_items,120);
for(let n=1;n<=30;n++){
 const trip={id:`e6301024-${String(n).padStart(4,'0')}-4000-9000-000000000100`,dispatch_number:`DEMO30-20261024-${String(n).padStart(3,'0')}`,remarks:'[ALZHEN_DEMO30_V1]'};
 for(const identity of [backendIdentity,frontendIdentity]){
  assert(identity(trip));assert(!identity({...trip,remarks:'Demo'}));assert(!identity({...trip,dispatch_number:'unrelated'}));
  assert(!identity({...trip,id:trip.id.replace('000000000100','000000000200')}));
 }
}
assert(!backendIdentity({id:'e6301024-0031-4000-9000-000000000100',dispatch_number:'DEMO30-20261024-031',remarks:'[ALZHEN_DEMO30_V1]'}));
console.log('Demo30 manifest and frontend/backend simulation allowlists verified.');
