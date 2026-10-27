/** Shared display order and progress units. Keep the persisted event names compatible. */
export const DELIVERY_STOP_STEPS = [
 {type:'ARRIVED',title:'Arrived at Delivery Stop',field:'arrival_time'},
 {type:'POD_SUBMITTED',title:'Upload POD',field:'pod_submitted_at'},
 {type:'UNLOADING_STARTED',title:'Started Unloading',field:'start_unloading_time'},
 {type:'UNLOADING_FINISHED',title:'Finished Unloading',field:'finish_unloading_time'},
 {type:'STOP_DEPARTURE',title:'Complete Delivery',field:'departure_time'},
] as const;
