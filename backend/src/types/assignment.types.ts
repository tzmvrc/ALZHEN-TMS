export type AssignmentTypeValue = string | null;

export interface TripAssignmentRecord {
  stop_scope?:"ALL"|"SELECTED";
  collaboration_version?:number;
  id: string;
  trip_id: string;
  truck_id: string | null;
  driver_id: string | null;
  trucking_company_id: string | null;
  assignment_type: AssignmentTypeValue;
  assigned_at: string | null;
  unassigned_at: string | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AssignmentDriverSummary {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
  status: string | null;
  profile_id: string | null;
  trucking_company_id: string | null;
}

export interface AssignmentTruckSummary {
  id: string | null;
  plate_number: string | null;
  truck_type: string | null;
  capacity_cbm: number | null;
  status: string | null;
  trucking_company_id: string | null;
}

export interface AssignmentCompanySummary {
  id: string | null;
  name: string | null;
  code: string | null;
  status: string | null;
}

export interface TripAssignmentWithRelations extends TripAssignmentRecord {
  driver: AssignmentDriverSummary | null;
  truck: AssignmentTruckSummary | null;
  trucking_company: AssignmentCompanySummary | null;
}
