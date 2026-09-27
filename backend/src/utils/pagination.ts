export function normalizePagination(
  query: { page?: string; limit?: string },
  maxLimit = 200,
) {
  const rawPage = Number(query.page ?? "1");
  const rawLimit = Number(query.limit ?? "50");

  const page =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : 50;

  return {
    page,
    limit,
    from: (page - 1) * limit,
  };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
) {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
  };
}
