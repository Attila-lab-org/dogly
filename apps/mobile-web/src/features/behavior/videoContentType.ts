export type VideoContentType =
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm';

export function videoContentTypeFromUri(
  localUri: string,
  reportedType?: string | null,
): VideoContentType {
  const normalizedType = reportedType?.split(';', 1)[0].toLowerCase();
  if (
    normalizedType === 'video/webm' ||
    normalizedType === 'video/quicktime' ||
    normalizedType === 'video/mp4'
  ) {
    return normalizedType;
  }
  const path = localUri.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith('.mov') || path.endsWith('.qt')) return 'video/quicktime';
  if (path.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}
