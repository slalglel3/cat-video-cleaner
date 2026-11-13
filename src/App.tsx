import React, { useState, useRef, useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  Play,
  Pause,
  Download,
  Sliders,
  RotateCcw,
  Info,
  HelpCircle,
  X
} from 'lucide-react';
import { processAudioBuffer, audioBufferToWav, DEFAULT_OPTIONS, ProcessOptions } from './utils/audioProcessor';
import { exportCleanVideo } from './utils/videoMuxer';
import './mobile-base.css';

export function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCleanMode, setIsCleanMode] = useState<boolean>(true); // true = 클린 소리, false = 원본 소리

  // 오디오 버퍼 및 상태
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [cleanAudioBuffer, setCleanAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processPercent, setProcessPercent] = useState<number>(0);

  // 미세 조정 옵션
  const [options, setOptions] = useState<ProcessOptions>(DEFAULT_OPTIONS);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  // 내보내기 상태
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string>('');
  const [exportPercent, setExportPercent] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. 안드로이드 하드웨어 뒤로가기 버튼 연동 (Capacitor 표준)
  useEffect(() => {
    let handler: { remove: () => Promise<void> } | null = null;
    try {
      CapApp.addListener('backButton', () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (showInfo) {
          setShowInfo(false);
        } else if (videoFile) {
          // 영상 닫기
          handleClearVideo();
        }
      }).then((h) => { handler = h; }).catch(() => {});
    } catch {
      // 웹 브라우저 환경 무시
    }

    return () => {
      if (handler && typeof handler.remove === 'function') {
        handler.remove().catch(() => {});
      }
    };
  }, [showSettings, showInfo, videoFile]);

  // 2. 파일 선택 처리
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setIsPlaying(false);
    setIsCleanMode(true);

    // 오디오 디코딩 및 자동 클린 처리
    await decodeAndProcessAudio(file, options);
  };

  // 3. 오디오 디코딩 & 클린 필터링 실행
  const decodeAndProcessAudio = async (file: File, curOptions: ProcessOptions) => {
    try {
      setIsProcessing(true);
      setProcessPercent(10);

      const arrayBuffer = await file.arrayBuffer();
      setProcessPercent(30);

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      setRawAudioBuffer(decodedBuffer);
      setProcessPercent(50);

      // 클린 필터링 실행
      const processed = await processAudioBuffer(decodedBuffer, curOptions, (pct) => {
        setProcessPercent(50 + Math.round(pct * 0.5));
      });

      setCleanAudioBuffer(processed);
      setProcessPercent(100);
      setIsProcessing(false);
    } catch (err) {
      console.error('오디오 디코딩 또는 처리 실패:', err);
      setIsProcessing(false);
      alert('동영상에서 오디오를 추출하거나 처리하는데 실패했습니다. 다른 영상을 선택해주세요.');
    }
  };

  // 4. 설정 변경 시 재처리
  const handleApplySettings = async () => {
    if (!rawAudioBuffer) return;
    setIsProcessing(true);
    const processed = await processAudioBuffer(rawAudioBuffer, options, (pct) => {
      setProcessPercent(pct);
    });
    setCleanAudioBuffer(processed);
    setIsProcessing(false);
    setShowSettings(false);
  };

  // 5. 비디오 및 오디오 동기 재생/일시정지 제어
  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      stopCleanAudio();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      if (isCleanMode && cleanAudioBuffer) {
        startCleanAudio(videoRef.current.currentTime);
      }
      setIsPlaying(true);
    }
  };

  // Web Audio로 클린 사운드 재생
  const startCleanAudio = (offset: number) => {
    stopCleanAudio();
    if (!cleanAudioBuffer) return;

    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const src = ctx.createBufferSource();
    src.buffer = cleanAudioBuffer;
    src.connect(ctx.destination);
    src.start(0, offset);
    sourceNodeRef.current = src;

    // 비디오 자체 사운드는 음소거
    if (videoRef.current) {
      videoRef.current.muted = true;
    }
  };

  const stopCleanAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 중지된 경우
      }
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  // A/B 모드 전환 (클린 사운드 vs 원본 사운드)
  const toggleCleanMode = () => {
    const nextMode = !isCleanMode;
    setIsCleanMode(nextMode);

    if (!videoRef.current) return;

    if (nextMode) {
      // 클린 모드 활성화: 비디오 음소거, Web Audio 클린 트랙 재생
      videoRef.current.muted = true;
      if (isPlaying) {
        startCleanAudio(videoRef.current.currentTime);
      }
    } else {
      // 원본 모드 활성화: 클린 트랙 중지, 비디오 원본 음향 켜기
      stopCleanAudio();
      videoRef.current.muted = false;
    }
  };

  // 비디오 탐색/루프 시 동기화
  const handleSeeked = () => {
    if (isPlaying && isCleanMode && videoRef.current) {
      startCleanAudio(videoRef.current.currentTime);
    }
  };

  // 6. 클린 동영상 내보내기 (MP4/WebM)
  const handleExportVideo = async () => {
    if (!videoRef.current || !cleanAudioBuffer) return;

    try {
      setIsExporting(true);
      setExportPercent(0);
      setExportMessage('동영상 합성 시작...');

      const blob = await exportCleanVideo(videoRef.current, cleanAudioBuffer, (p) => {
        setExportPercent(p.percent);
        setExportMessage(p.message);
      });

      // 다운로드 트리거
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = videoFile ? videoFile.name.replace(/\.[^/.]+$/, '') : 'clean_video';
      a.href = url;
      a.download = `${baseName}_clean.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      alert('클린 동영상이 성공적으로 저장되었습니다!');
    } catch (err) {
      console.error('동영상 내보내기 실패:', err);
      setIsExporting(false);
      alert('동영상 합성에 실패했습니다. 대신 [클린 오디오(WAV) 저장]을 이용해보세요.');
    }
  };

  // 7. 클린 오디오만 WAV로 내보내기
  const handleExportWav = () => {
    if (!cleanAudioBuffer) return;
    const wavBlob = audioBufferToWav(cleanAudioBuffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    const baseName = videoFile ? videoFile.name.replace(/\.[^/.]+$/, '') : 'clean_audio';
    a.href = url;
    a.download = `${baseName}_clean.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearVideo = () => {
    stopCleanAudio();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setRawAudioBuffer(null);
    setCleanAudioBuffer(null);
    setIsPlaying(false);
  };

  return (
    <div className="safe-container">
      {/* 1. 상단 앱 헤더 */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', borderRadius: '8px', backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '18px' }}>🐱</span>
          </div>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>CatCleaner</h1>
            <p style={{ fontSize: '11px', margin: 0, color: '#94a3b8' }}>100% 오프라인 온디바이스 노이즈 제거</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {videoFile && (
            <button
              onClick={() => setShowSettings(true)}
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}
              title="필터 설정"
            >
              <Sliders size={18} />
            </button>
          )}
          <button
            onClick={() => setShowInfo(true)}
            style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}
            title="앱 정보"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="scroll-content">
        {!videoFile ? (
          /* 동영상 업로드 대기 화면 */
          <div style={{ height: '100%', minHeight: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #334155', borderRadius: '16px', padding: '24px', textAlign: 'center', backgroundColor: 'rgba(30, 41, 59, 0.4)' }}>
            <div style={{ width: '64px', height: '64px', minWidth: '64px', minHeight: '64px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#f59e0b' }}>
              <Upload size={32} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>고양이 동영상 선택</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', lineHeight: 1.5, marginBottom: '24px' }}>
              배경에 TV 말소리나 방송 음향이 섞인 동영상을 선택하세요. 서버 전송 없이 폰 안에서 즉시 지워드립니다.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept="video/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '12px 24px', borderRadius: '12px', backgroundColor: '#f59e0b', color: '#000', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)' }}
            >
              <Upload size={18} />
              동영상 파일 열기
            </button>
          </div>
        ) : (
          /* 동영상 로드 및 플레이어 화면 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 비디오 뷰어 */}
            <div style={{ position: 'relative', width: '100%', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#000', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', aspectRatio: '9/16', maxHeight: '52vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                playsInline
                loop
                onSeeked={handleSeeked}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* A/B 모드 뱃지 */}
              <div style={{ position: 'absolute', top: '12px', left: '12px', padding: '6px 12px', borderRadius: '20px', backgroundColor: isCleanMode ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)', color: '#fff', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)' }}>
                {isCleanMode ? <Sparkles size={14} /> : <Volume2 size={14} />}
                {isCleanMode ? '클린 모드 (TV 제거)' : '원본 소리'}
              </div>

              {/* 재생/일시정지 오버레이 버튼 */}
              <button
                onClick={togglePlay}
                style={{ position: 'absolute', width: '56px', height: '56px', minWidth: '56px', minHeight: '56px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
              </button>
            </div>

            {/* A/B 비교 토글 버튼 (가장 핵심적인 UX) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px' }}>
              <button
                onClick={toggleCleanMode}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: isCleanMode ? '#10b981' : 'transparent',
                  color: isCleanMode ? '#ffffff' : '#94a3b8',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Sparkles size={16} />
                클린 고양이 소리
              </button>
              <button
                onClick={toggleCleanMode}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: !isCleanMode ? '#475569' : 'transparent',
                  color: !isCleanMode ? '#ffffff' : '#94a3b8',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Volume2 size={16} />
                원본 소리 비교
              </button>
            </div>

            {/* 오디오 처리 중 상태 표시 */}
            {isProcessing && (
              <div style={{ backgroundColor: '#1e293b', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f59e0b', fontWeight: 'bold' }}>
                  <span>고양이 소리 정제 중...</span>
                  <span>{processPercent}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${processPercent}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.2s ease' }} />
                </div>
              </div>
            )}

            {/* 내보내기 버튼 그룹 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={handleExportVideo}
                disabled={isProcessing || isExporting}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: '#f59e0b',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: isProcessing || isExporting ? 0.6 : 1,
                }}
              >
                <Download size={18} />
                클린 동영상 저장 (MP4)
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={handleExportWav}
                  disabled={isProcessing || isExporting}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <VolumeX size={15} />
                  오디오만 (WAV)
                </button>
                <button
                  onClick={handleClearVideo}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <RotateCcw size={15} />
                  다른 영상 선택
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 내보내기 진행 팝업 */}
      {isExporting && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>동영상 생성 중</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>{exportMessage}</p>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${exportPercent}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.2s ease' }} />
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>영상이 재생되며 클린 오디오와 합성됩니다.</p>
          </div>
        </div>
      )}

      {/* 4. 필터 상세 설정 모달 */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 90 }}>
          <div style={{ backgroundColor: '#1e293b', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>노이즈 제거 세부 조절</h3>
              <button onClick={() => setShowSettings(false)} style={{ color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            {/* 프리셋 버튼들 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setOptions({ vocalSuppression: 0.85, foleyBoost: 1.5, noiseGateThreshold: 0.015, preserveBass: true })}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', backgroundColor: '#334155', fontSize: '12px', fontWeight: 'bold' }}
              >
                🐱 고양이 모드 (기본)
              </button>
              <button
                onClick={() => setOptions({ vocalSuppression: 0.98, foleyBoost: 1.2, noiseGateThreshold: 0.025, preserveBass: false })}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', backgroundColor: '#334155', fontSize: '12px', fontWeight: 'bold' }}
              >
                🔇 보컬 완전 소거
              </button>
            </div>

            {/* 슬라이더 1: 음성 제거 강도 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>사람 목소리(TV) 제거 강도</span>
                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{Math.round(options.vocalSuppression * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={options.vocalSuppression}
                onChange={(e) => setOptions({ ...options, vocalSuppression: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
            </div>

            {/* 슬라이더 2: 고양이 발소리/바스락 부스트 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>고양이 움직임/발소리 부스트</span>
                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{options.foleyBoost.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="2.5"
                step="0.1"
                value={options.foleyBoost}
                onChange={(e) => setOptions({ ...options, foleyBoost: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
            </div>

            {/* 적용 버튼 */}
            <button
              onClick={handleApplySettings}
              style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', fontSize: '15px' }}
            >
              설정 적용하기
            </button>
          </div>
        </div>
      )}

      {/* 5. 앱 정보 모달 */}
      {showInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '20px', maxWidth: '340px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={18} style={{ color: '#f59e0b' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>CatCleaner 소개</h3>
              </div>
              <button onClick={() => setShowInfo(false)} style={{ color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: 0 }}>
                <strong>🔒 100% 온디바이스 독립 구동</strong><br />
                서버나 외부 클라우드로 영상을 전송하지 않습니다. 모든 노이즈 제거와 동영상 합성은 사용자의 스마트폰 내부에서 안전하게 실행됩니다.
              </p>
              <p style={{ margin: 0 }}>
                <strong>🐾 고양이 특화 음향 복원 알고리즘</strong><br />
                TV 대사 대역(200~3,400Hz)의 중앙 성분만 선택적으로 감쇄하고, 고양이의 발소리·상자 긁는 소리·바스락거리는 과도 충격음(Transients)은 선명하게 살려냅니다.
              </p>
            </div>
            <button
              onClick={() => setShowInfo(false)}
              style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#334155', color: '#fff', fontWeight: 'bold', fontSize: '13px' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
