// Isolated tests inject password success; real endpoints always use the production guard.
import {createOperationsReportDeleter} from "../../src/services/operations-report.service.js";
import {ApiError} from "../../src/utils/api-response.js";
export async function mockDeleteOperationsReport(actor:{profileId:string;role:string},source_type:unknown,record_id:unknown){
 const batch=createOperationsReportDeleter(async(_actor,_credentials,commit)=>commit());
 const {outcomes}=await batch(actor,[{source_type,record_id}],{password:"fixture",accessToken:"fixture",appSessionId:null});
 const outcome=outcomes[0];if(!outcome.success)throw new ApiError(outcome.message,409,outcome.code);return outcome.result;
}
