export interface LookupQueryParams {
  q?: string;
  sort_by?: string;
  sort_order?: string;
  status?: string;
  role?: string;
  region?: string;
  customer_id?: string;
  store_id?: string;
  [key: string]: string | undefined;
}

export interface TripTypeOption {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  active: boolean | null;
}

export interface WarehouseOption {
  id: string;
  code: string | null;
  name: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  warehouse_type: string | null;
  status: string | null;
}

export interface CustomerOption {
  id: string;
  code: string | null;
  name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  status: string | null;
}

export interface StoreOption {
  id: string;
  customer_id: string | null;
  code: string | null;
  name: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  status: string | null;
}

export interface ProductOption {
  id: string;
  sku: string | null;
  model_code: string | null;
  name: string | null;
  category: string | null;
  unit_cbm: number | null;
  status: string | null;
}

export interface DriverOption {
  id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  status: string | null;
  trucking_company_id: string | null;
  trucking_company_name: string | null;
}

export interface TruckOption {
  id: string;
  plate_number: string | null;
  truck_type: string | null;
  capacity_cbm: number | null;
  status: string | null;
  trucking_company_id: string | null;
  trucking_company_name: string | null;
}

export interface TruckingCompanyOption {
  id: string;
  code: string | null;
  name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  status: string | null;
}

export interface ProfileOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  role: string | null;
  is_admin: boolean | null;
  profile_picture_url?: string | null;
}

export interface StoreContactOption {
  id: string;
  store_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  is_primary: boolean | null;
}

export interface IncidentReasonOption {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  active: boolean | null;
}
