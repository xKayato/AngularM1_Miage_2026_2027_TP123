/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  hasCover?: boolean;
  coverUrl?: string | null;
  createdAt: string;
}
