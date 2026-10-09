/** Generic paginated response used by the tracks endpoint, powered by mongoose-aggregate-paginate-v2. */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  docs?: T[];
  totalDocs?: number;
  totalPages?: number;
  hasPrevPage?: boolean;
  hasNextPage?: boolean;
  prevPage?: number | null;
  nextPage?: number | null;
  pagingCounter?: number;
}

