/**
 * Mobile-compatible Video + Clean Audio Export Engine
 * 100% Client-side Muxing using MediaStream & MediaRecorder
 */

export interface ExportProgress {
  percent: number;
  message: string;
}

/**
 * 원본 비디오 스트림과 클린 오디오를 결합하여 새 MP4/WebM 동영상 Blob을 생성
 */
export async function exportCleanVideo(
  videoElement: HTMLVideoElement,
  cleanAudioBuffer: AudioBuffer,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const duration = videoElement.duration || cleanAudioBuffer.duration;
  
  if (onProgress) onProgress({ percent: 10, message: '오디오 트랙 준비 중...' });

  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
    sampleRate: cleanAudioBuffer.sampleRate,
  });

  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = cleanAudioBuffer;

  const audioDest = audioCtx.createMediaStreamDestination();
  audioSource.connect(audioDest);

  // 비디오 스트림 캡처 (30fps)
  if (onProgress) onProgress({ percent: 20, message: '비디오 스트림 동기화 중...' });

  let videoStream: MediaStream;
  if ('captureStream' in videoElement) {
    videoStream = (videoElement as unknown as { captureStream: () => MediaStream }).captureStream();
  } else if ('mozCaptureStream' in videoElement) {
    videoStream = (videoElement as unknown as { mozCaptureStream: () => MediaStream }).mozCaptureStream();
  } else {
    throw new Error('이 기기의 브라우저는 비디오 스트림 캡처를 지원하지 않습니다.');
  }

  // 비디오 비디오 트랙 + 클린 오디오 트랙 결합
  const combinedStream = new MediaStream();
  videoStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));
  audioDest.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));

  // 안드로이드 및 모바일 웹뷰에서 가장 안정적인 MIME 타입 선택
  const mimeTypes = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  let chosenMime = '';
  for (const mime of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mime)) {
      chosenMime = mime;
      break;
    }
  }

  if (!chosenMime) {
    chosenMime = 'video/webm'; // 기본 폴백
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType: chosenMime,
    videoBitsPerSecond: 3500000, // 고화질 3.5Mbps
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      audioCtx.close().catch(() => {});
      const finalBlob = new Blob(chunks, { type: chosenMime });
      if (onProgress) onProgress({ percent: 100, message: '완료!' });
      resolve(finalBlob);
    };

    recorder.onerror = (e) => {
      audioCtx.close().catch(() => {});
      reject(e);
    };

    // 영상 처음부터 동기 재생 시작
    videoElement.currentTime = 0;
    videoElement.muted = true; // 녹화 중 시스템 스피커 하울링 방지

    const timeUpdateHandler = () => {
      const current = videoElement.currentTime;
      const progress = Math.min(95, Math.round(20 + (current / duration) * 75));
      if (onProgress) {
        onProgress({
          percent: progress,
          message: `동영상 합성 중... (${Math.round(current)}s / ${Math.round(duration)}s)`,
        });
      }
    };

    videoElement.addEventListener('timeupdate', timeUpdateHandler);

    videoElement.onended = () => {
      videoElement.removeEventListener('timeupdate', timeUpdateHandler);
      try {
        audioSource.stop();
        recorder.stop();
      } catch {
        // 이미 중지된 경우 무시
      }
    };

    // 녹화 시작
    recorder.start(100);
    audioSource.start(0);
    videoElement.play().catch((err) => {
      reject(new Error('비디오 재생 시작 실패: ' + err.message));
    });
  });
}
