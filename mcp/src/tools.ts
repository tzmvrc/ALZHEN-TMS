import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { backendHeaders, ensureBackendToken, type BackendIdentity } from './auth.js';

type Row = Record<string, any>;
const maxPage = Math.min(50, Math.max(1, Number(process.env.MCP_MAX_PAGE_SIZE) || 20));
const maxDetail = Math.min(100, Math.max(1, Number(process.env.MCP_MAX_DETAIL_ITEMS) || 50));
const backendUrl = (process.env.MCP_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const uuid = z.uuid();
const pageSchema = z.number().int().min(1).max(1000).default(1);
const limitSchema = z.number().int().min(1).max(maxPage).default(Math.min(10, maxPage));
const detailLimitSchema = z.number().int().min(1).max(maxDetail).default(Math.min(20, maxDetail));
const text = (value: unknown) => value == null ? null : String(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(x => x && typeof x === 'object') : [];
const pick = (value: Row, names: string[]) => Object.fromEntries(names.map(name => [name, value?.[name] ?? null]));
const pageOf = (items: Row[], page: number, limit: number) => {
  const offset = (page - 1) * limit;
  return { rows: items.slice(offset, offset + limit), total: items.length, page, limit, next_page: offset + limit < items.length ? page + 1 : null };
};

class BackendError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function api(identity: BackendIdentity, path: string): Promise<any> {
  await ensureBackendToken(identity);
  const response = await fetch(`${backendUrl}${path}`, {
    headers: backendHeaders(identity), signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  if (Number(response.headers.get('content-length') || 0) > 3_000_000) throw new BackendError(503, 'The requested detail is too large. Narrow the request.');
  const reader = response.body?.getReader();
  let received = 0; const chunks: Uint8Array[] = [];
  if (reader) while (true) {
    const { done, value } = await reader.read(); if (done) break;
    received += value.length;
    if (received > 3_000_000) { await reader.cancel(); throw new BackendError(503, 'The requested detail is too large. Narrow the request.'); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(received); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  const payload = JSON.parse(new TextDecoder().decode(buffer));
  if (!response.ok || payload?.success === false) throw new BackendError(response.status, response.status === 401 || response.status === 403
    ? 'Your ALZHEN session is no longer authorized. Reconnect the MCP app.'
    : response.status === 404 ? 'The requested record was not found.'
    : 'The ALZHEN backend could not complete this read. Retry shortly.');
  return payload.data;
}

function result(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }; }
function failed(error: unknown) {
  const message = error instanceof BackendError ? error.message
    : error instanceof Error && /fetch failed|timeout|abort/i.test(error.message) ? 'The ALZHEN backend is unavailable. Start it and retry.'
    : 'The requested data could not be loaded.';
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
function summary(value: Row) {
  return {
    dispatch_number: text(value.dispatch_number),
    loading_date: text(value.loading_date), trip_count: Array.isArray(value.trip_ids) ? value.trip_ids.length : null,
    delivery_status: value.values?.delivery_status?.value ?? null,
  };
}

export function registerTools(server: McpServer, identity: BackendIdentity) {
  server.registerTool('list_dispatches', {
    title: 'List dispatches', description: 'List active dispatches in small pages, optionally filtered by dispatch number.',
    inputSchema: z.object({ page: pageSchema, limit: limitSchema, search: z.string().trim().max(100).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ page, limit, search }) => {
    try {
      const first = (page - 1) * limit, sourcePage = Math.floor(first / 50) + 1, start = first % 50;
      const query = (number: number) => `/api/trips/master-list/dispatches?page=${number}&group=booking${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const one = await api(identity, query(sourcePage));
      const list = rows(one?.rows).slice(start, start + limit);
      if (list.length < limit && first + list.length < Number(one?.total || 0)) {
        const two = await api(identity, query(sourcePage + 1));
        list.push(...rows(two?.rows).slice(0, limit - list.length));
      }
      return result({ dispatches: list.map(summary), total: Number(one?.total || 0), page, limit,
        next_page: first + list.length < Number(one?.total || 0) ? page + 1 : null });
    } catch (error) { return failed(error); }
  });

  server.registerTool('get_dispatch_details', {
    title: 'Get dispatch details', description: 'Show trips under one dispatch, with their assigned trucks and delivery-record summaries.',
    inputSchema: z.object({ dispatch_number: z.string().trim().min(1).max(100), page: pageSchema, limit: detailLimitSchema }),
    annotations: { readOnlyHint: true },
  }, async ({ dispatch_number, page, limit }) => {
    try {
      const data = rows(await api(identity, `/api/trips/master-list/dispatches/${encodeURIComponent(dispatch_number)}/children?group=all`));
      const segment = pageOf(data, page, limit);
      return result({ dispatch_number, trips: segment.rows.map(trip => ({
        trip_id: trip.trip_id, trip_number: trip.trip_number, convoy: Boolean(trip.convoy),
        trucks: rows(trip.assignments).slice(0, maxDetail).map(a => ({ assignment_id: a.id, plate_number: a.plate_number,
          trucking_company: a.trucking_company, drs: rows(a.drs).slice(0, maxDetail).map(dr => ({ dr_number: dr.dr_number, stop_id: dr.stop_id, stop_sequence: dr.stop_sequence })) })),
        drs: rows(trip.flat_drs || trip.drs).slice(0, maxDetail).map(dr => ({ dr_number: dr.dr_number,
          stop_id: dr.stop_id, stop_sequence: dr.stop_sequence, delivery_status: dr.values?.delivery_status?.value ?? null })),
        drs_truncated: rows(trip.flat_drs || trip.drs).length > maxDetail,
      })), total_trips: segment.total, page, limit, next_page: segment.next_page });
    } catch (error) { return failed(error); }
  });

  server.registerTool('get_trip_details', {
    title: 'Get trip details', description: 'Read a physical trip, its trucks, allocated cargo/DRs, and delivery stops. Use page for long stop lists.',
    inputSchema: z.object({ trip_id: uuid, page: pageSchema, limit: detailLimitSchema }),
    annotations: { readOnlyHint: true },
  }, async ({ trip_id, page, limit }) => {
    try {
      const [detail, convoy] = await Promise.all([
        api(identity, `/api/trips/${trip_id}`), api(identity, `/api/trips/${trip_id}/convoy`),
      ]);
      const trip = detail?.trip || {}, stops = rows(convoy?.stops), cargo = rows(convoy?.cargo), allocations = rows(convoy?.allocations);
      const assignments = rows(convoy?.assignments).filter(a => !a.unassigned_at);
      const responsibilities = rows(convoy?.responsibilities);
      const pagedStops = pageOf(stops, page, limit);
      const stopById = new Map(stops.map(stop => [stop.id, stop]));
      const cargoById = new Map(cargo.map(line => [line.id, line]));
      return result({ trip: pick(trip, ['id', 'dispatch_number', 'trip_reference', 'trip_number', 'loading_date', 'estimated_delivery_date', 'status']),
        warehouse: detail?.warehouse?.name ?? null, trip_type: detail?.trip_type?.name ?? null,
        trucks: assignments.slice(0, maxDetail).map(assignment => {
          const own = allocations.filter(a => a.assignment_id === assignment.id);
          const assignedStops = assignment.stop_scope === 'ALL' ? stops : stops.filter(stop => responsibilities.some(r => r.assignment_id === assignment.id && r.trip_stop_id === stop.id));
          const drs = [...new Map(own.map(a => {
            const line = cargoById.get(a.trip_line_item_id), stop = stopById.get(line?.trip_stop_id);
            const dr = line?.dr_number || stop?.dr_number || null;
            return stop ? [`${stop.id}:${dr || ''}`, { stop_id: stop.id, dr_number: dr }] : null;
          }).filter(Boolean) as [string, Row][]).values()];
          return { assignment_id: assignment.id, plate_number: assignment.truck?.plate_number ?? null,
            trucking_company: assignment.trucking_company?.name ?? null, stop_scope: assignment.stop_scope,
            stop_ids: assignedStops.slice(0, maxDetail).map(s => s.id),
            allocated_drs: drs.slice(0, maxDetail),
            cargo_allocations: own.slice(0, maxDetail).map(a => ({ line_item_id: a.trip_line_item_id,
              dr_number: cargoById.get(a.trip_line_item_id)?.dr_number ?? null,
              quantity: a.quantity, cbm: a.allocated_cbm })),
            truncated: own.length > maxDetail || assignedStops.length > maxDetail || drs.length > maxDetail };
        }), trucks_truncated: assignments.length > maxDetail,
        stops: pagedStops.rows.map(stop => pick(stop, ['id', 'stop_sequence', 'dr_number', 'delivery_status', 'store_id', 'customer_id', 'finish_unloading_time'])),
        total_stops: pagedStops.total, page, limit, next_page: pagedStops.next_page });
    } catch (error) { return failed(error); }
  });

  server.registerTool('list_trucks', {
    title: 'List trucks', description: 'Search the authorized truck lookup. Pages are limited to the backend lookup window.',
    inputSchema: z.object({ search: z.string().trim().max(100).optional(), page: pageSchema, limit: limitSchema }),
    annotations: { readOnlyHint: true },
  }, async ({ search, page, limit }) => {
    try {
      const data = rows(await api(identity, `/api/lookups/trucks${search ? `?q=${encodeURIComponent(search)}` : ''}`));
      const paged = pageOf(data, page, limit);
      return result({ trucks: paged.rows.map(truck => pick(truck, ['id', 'plate_number', 'truck_type', 'capacity_cbm', 'status', 'trucking_company_name'])),
        page, limit, next_page: paged.next_page, lookup_window_total: paged.total });
    } catch (error) { return failed(error); }
  });

  server.registerTool('get_delivery_status', {
    title: 'Get delivery status', description: 'List delivery stop and DR status for one trip, with pagination.',
    inputSchema: z.object({ trip_id: uuid, page: pageSchema, limit: detailLimitSchema }),
    annotations: { readOnlyHint: true },
  }, async ({ trip_id, page, limit }) => {
    try {
      const data = rows(await api(identity, `/api/trips/${trip_id}/stops`));
      const paged = pageOf(data, page, limit);
      const lines = paged.rows.some(stop => !stop.dr_number) ? rows(await api(identity, `/api/trips/${trip_id}/line-items`)) : [];
      return result({ trip_id, stops: paged.rows.map(stop => ({
        ...pick(stop, ['id', 'stop_sequence', 'delivery_status', 'finish_unloading_time']),
        dr_numbers: [...new Set([stop.dr_number, ...lines.filter(line => line.trip_stop_id === stop.id).map(line => line.dr_number)].filter(Boolean))].slice(0, maxDetail),
      })),
        total_stops: paged.total, page, limit, next_page: paged.next_page });
    } catch (error) { return failed(error); }
  });
}
