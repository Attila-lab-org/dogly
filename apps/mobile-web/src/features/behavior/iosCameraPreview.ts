/**
 * Su iPhone Safari la CameraView di expo-camera resta nera anche con
 * lo stream vivo: il <video> non ha webkit-playsinline e play() non
 * viene chiamato dopo srcObject. Expo inoltre accende onCameraReady
 * prima di attaccare lo stream.
 */
let cssReady = false;

function ensurePreviewCss() {
  if (typeof document === 'undefined' || cssReady) return;
  if (document.getElementById('dogly-ios-camera-preview')) {
    cssReady = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'dogly-ios-camera-preview';
  style.textContent = `
    video {
      object-fit: cover !important;
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
    }
  `;
  document.head.appendChild(style);
  cssReady = true;
}

export function wakeIosCameraPreview(): void {
  if (typeof document === 'undefined') return;
  ensurePreviewCss();
  for (const node of Array.from(document.querySelectorAll('video'))) {
    const video = node as HTMLVideoElement;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    const play = () => {
      const result = video.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => undefined);
      }
    };
    if (video.srcObject) play();
    else video.addEventListener('loadedmetadata', play, { once: true });
  }
}
