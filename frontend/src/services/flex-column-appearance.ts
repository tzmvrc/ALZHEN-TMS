/** Flex definitions already have versioned settings and manage authorization. */
export function flexColumnAppearance(settings:Record<string,unknown>){
 const raw=settings.appearance;
 const value=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 return {color:typeof value.color==="string"&&/^#[0-9a-f]{6}$/i.test(value.color)?value.color:undefined,pin:value.pin==="left"||value.pin==="right"?value.pin:undefined};
}
export function patchFlexColumnAppearance(settings:Record<string,unknown>,patch:{color?:string|null;pin?:"left"|"right"|null}){
 const raw=settings.appearance;
 return {...settings,appearance:{...(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{}),...patch}};
}
