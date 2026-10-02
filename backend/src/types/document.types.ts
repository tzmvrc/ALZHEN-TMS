export type DocumentRecord = {
  id: string;
  trip_id: string;
  trip_stop_id: string | null;
  document_type: string | null;
  document_number: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  status: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  ocr_status: string | null;
  ocr_text: string | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DocumentQueryParams = {
  page?: string;
  limit?: string;
  search?: string;
  trip_id?: string;
  trip_stop_id?: string;
  document_type?: string;
  status?: string;
  ocr_status?: string;
  sort_by?: string;
  sort_order?: string;
};

export type DocumentCreateInput = {
  trip_id?: string;
  trip_stop_id?: string | null;
  document_type?: string;
  document_number?: string;
  file_path?: string;
  file_name?: string;
  mime_type?: string;
  status?: string;
  ocr_status?: string;
  ocr_text?: string | null;
  remarks?: string | null;
};

export type DocumentUpdateInput = Partial<{
  document_number: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  status: string;
  ocr_status: string;
  ocr_text: string | null;
  remarks: string | null;
}>;

export type DocumentListResponse = {
  rows: DocumentRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
