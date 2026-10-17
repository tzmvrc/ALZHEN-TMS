import test from "node:test";
import assert from "node:assert/strict";
import {flexColumnAppearance,patchFlexColumnAppearance} from "../src/services/flex-column-appearance";
test("native flex appearance preserves existing settings and accepts only safe colors and left/right pins",()=>{
 const settings={formula:"preserve",appearance:{fontSize:14,color:"#bfdbfe",pin:"left"}};
 assert.deepEqual(flexColumnAppearance(settings),{color:"#bfdbfe",pin:"left"});
 const updated=patchFlexColumnAppearance(settings,{pin:"right",color:null});
 assert.equal(updated.formula,"preserve");assert.deepEqual(updated.appearance,{fontSize:14,color:null,pin:"right"});
 assert.deepEqual(flexColumnAppearance({appearance:{color:"url(secret)",pin:"absolute"}}),{color:undefined,pin:undefined});
 assert.deepEqual(settings.appearance,{fontSize:14,color:"#bfdbfe",pin:"left"});
});
