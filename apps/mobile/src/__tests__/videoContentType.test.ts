import { videoContentTypeFromUri } from '../features/behavior/videoContentType';

describe('behavior video content type', () => {
  it('recognizes native iPhone MOV recordings', () => {
    expect(
      videoContentTypeFromUri(
        'file:///var/mobile/Containers/Data/clip.MOV?cache=1',
      ),
    ).toBe('video/quicktime');
  });

  it('recognizes browser WebM recordings from their Blob type', () => {
    expect(
      videoContentTypeFromUri(
        'blob:https://dogly.app/recording',
        'video/webm;codecs=vp8,opus',
      ),
    ).toBe('video/webm');
  });

  it('defaults Android recordings to MP4', () => {
    expect(videoContentTypeFromUri('file:///data/user/0/dogly/clip.mp4')).toBe(
      'video/mp4',
    );
  });
});
