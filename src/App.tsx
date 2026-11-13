import React, { useState, useRef, useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  Sparkles,
  Volume2,
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
import './mobile-base.css';

const DEFAULT_SERVER_URL = 'https://cleaner.donagy.pro';

export function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null);
  const [cleanVideoUrl, setCleanVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCleanMode, setIsCleanMode] = useState<boolean>(false);

  // 처리 상태
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [hasProcessed, setHasProcessed] = useState<boolean>(false);

  // 모달
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  // 미세 튜닝 옵션
  const [vocalSuppression, setVocalSuppression] = useState<number>(1.0);
  const [foleyBoost, setFoleyBoost] = useState<number>(1.3);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 안드로이드 하드웨어 뒤로가기 버튼
  useEffect(() => {
    let handler: { remove: () => Promise<void> } | null = null;
    try {
      CapApp.addListener('backButton', () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (showInfo) {
          setShowInfo(false);
        } else if (videoFile) {
          handleReset();
        }
      }).then((h) => { handler = h; }).catch(() => {});
    } catch {
      // ignore
    }

    return () => {
      if (handler && typeof handler.remove === 'function') {
        handler.remove().catch(() => {});
      }
    };
  }, [showSettings, showInfo, videoFile]);

  // 비디오 첫 프레임 강제 디코딩
  const handleLoadedData = () => {
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = 0.001;
      } catch {
        // ignore
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (rawVideoUrl) URL.revokeObjectURL(rawVideoUrl);
    if (cleanVideoUrl) URL.revokeObjectURL(cleanVideoUrl);

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setRawVideoUrl(url);
    setCleanVideoUrl(null);
    setHasProcessed(false);
    setIsCleanMode(false);
    setIsPlaying(false);
  };

  // AI 노이즈 & 노래 제거 요청
  const handleStartAiClean = async () => {
    if (!videoFile) return;

    try {
      setIsProcessing(true);
      setProcessStatus('동영상 서버로 전송 중...');

      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('vocal_suppression', vocalSuppression.toString());
      formData.append('foley_boost', foleyBoost.toString());

      setProcessStatus('사람 목소리와 배경 음악을 분리하고 있습니다...');

      const response = await fetch(`${DEFAULT_SERVER_URL}/api/clean`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '서버 처리 실패');
      }

      setProcessStatus('클린 동영상 다운로드 중...');
      const blob = await response.blob();
      const newCleanUrl = URL.createObjectURL(blob);

      setCleanVideoUrl(newCleanUrl);
      setHasProcessed(true);
      setIsCleanMode(true);
      setIsProcessing(false);
      setProcessStatus('');

      // 요구사항 4: 수신 시 첫 프레임 띄우고 재생 버튼(정지) 상태로 대기
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.src = newCleanUrl;
        videoRef.current.load();
        videoRef.current.currentTime = 0.001;
      }
    } catch (err: unknown) {
      console.error('AI Clean Error:', err);
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`노이즈 제거에 실패했습니다.\n사유: ${msg}\n\n서버 상태를 확인해주세요.`);
    }
  };

  // 요구사항 5: A/B 모드 전환 시 비디오와 버튼 재생 상태 완벽 동기화
  const handleSwitchMode = async (targetClean: boolean) => {
    if (!videoRef.current) return;
    const curTime = videoRef.current.currentTime;
    const wasPlaying = !videoRef.current.paused;

    setIsCleanMode(targetClean);
    const targetUrl = targetClean ? cleanVideoUrl : rawVideoUrl;
    if (targetUrl) {
      videoRef.current.src = targetUrl;
      videoRef.current.currentTime = curTime;
      if (wasPlaying) {
        try {
          await videoRef.current.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const handleDownloadClean = () => {
    if (!cleanVideoUrl) return;
    const a = document.createElement('a');
    const baseName = videoFile ? videoFile.name.replace(/\.[^/.]+$/, '') : 'clean_video';
    a.href = cleanVideoUrl;
    a.download = `${baseName}_clean.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    if (rawVideoUrl) URL.revokeObjectURL(rawVideoUrl);
    if (cleanVideoUrl) URL.revokeObjectURL(cleanVideoUrl);
    setVideoFile(null);
    setRawVideoUrl(null);
    setCleanVideoUrl(null);
    setHasProcessed(false);
    setIsCleanMode(false);
    setIsPlaying(false);
  };

  return (
    <div className="safe-container">
      {/* 헤더 */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '34px', height: '34px', minWidth: '34px', minHeight: '34px', borderRadius: '10px', backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '20px' }}>🐱</span>
          </div>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>CatCleaner</h1>
            <p style={{ fontSize: '11px', margin: 0, color: '#94a3b8' }}>고양이 소리 보존 & 말소리·노래 제거</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}
          >
            <Sliders size={18} />
          </button>
          <button
            onClick={() => setShowInfo(true)}
            style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="scroll-content">
        {!videoFile ? (
          <div style={{ height: '100%', minHeight: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #334155', borderRadius: '16px', padding: '24px', textAlign: 'center', backgroundColor: 'rgba(30, 41, 59, 0.4)' }}>
            <div style={{ width: '68px', height: '68px', minWidth: '68px', minHeight: '68px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#f59e0b' }}>
              <Upload size={34} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>고양이 동영상 선택</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', lineHeight: 1.5, marginBottom: '24px' }}>
              배경에 TV 말소리나 노래 소리가 섞인 동영상을 선택하세요. AI가 사람 소리와 음악을 깨끗이 지워드립니다.
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
              style={{ padding: '14px 28px', borderRadius: '14px', backgroundColor: '#f59e0b', color: '#000', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)' }}
            >
              <Upload size={20} />
              동영상 파일 열기
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 비디오 플레이어 */}
            <div style={{ position: 'relative', width: '100%', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#000', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', aspectRatio: '9/16', maxHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video
                ref={videoRef}
                src={(isCleanMode ? cleanVideoUrl : rawVideoUrl) || undefined}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                playsInline
                preload="auto"
                loop
                onLoadedData={handleLoadedData}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />

              {/* 상태 뱃지 */}
              <div style={{ position: 'absolute', top: '12px', left: '12px', padding: '6px 12px', borderRadius: '20px', backgroundColor: isCleanMode ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)', color: '#fff', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)' }}>
                {isCleanMode ? <Sparkles size={14} /> : <Volume2 size={14} />}
                {isCleanMode ? '✨ 클린 모드 (TV·음악 제거됨)' : '🔊 원본 동영상'}
              </div>

              {/* 재생/일시정지 버튼 */}
              <button
                onClick={togglePlay}
                style={{ position: 'absolute', width: '56px', height: '56px', minWidth: '56px', minHeight: '56px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
              </button>
            </div>

            {/* A/B 비교 토글 버튼 */}
            {hasProcessed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px' }}>
                <button
                  onClick={() => handleSwitchMode(true)}
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
                    transition: 'all 0.2s',
                  }}
                >
                  <Sparkles size={16} />
                  클린 고양이 소리
                </button>
                <button
                  onClick={() => handleSwitchMode(false)}
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
                    transition: 'all 0.2s',
                  }}
                >
                  <Volume2 size={16} />
                  원본 소리 비교
                </button>
              </div>
            )}

            {/* 버튼 그룹 */}
            {!hasProcessed ? (
              <button
                onClick={handleStartAiClean}
                disabled={isProcessing}
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  backgroundColor: '#f59e0b',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
                }}
              >
                <Sparkles size={20} />
                AI 노이즈 & 노래 제거 시작
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleDownloadClean}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Download size={20} />
                  클린 동영상 저장 (MP4)
                </button>

                <button
                  onClick={handleReset}
                  style={{
                    padding: '12px',
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
            )}
          </div>
        )}
      </div>

      {/* 요구사항 3: 체다캠 등 불필요 문구 완전 삭제된 심플 로딩창 */}
      {isProcessing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#1e293b', padding: '26px 20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#f59e0b' }}>
              <Sparkles size={28} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>AI 노이즈 제거 진행 중</h3>
            <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>{processStatus}</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>잠시만 기다려 주세요 (약 15~20초 소요)</p>
          </div>
        </div>
      )}

      {/* 요구사항 6: 실제 사용자용 음향 설정만 남긴 깔끔한 설정 모달 */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 90 }}>
          <div style={{ backgroundColor: '#1e293b', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>음향 필터 세부 설정</h3>
              <button onClick={() => setShowSettings(false)} style={{ color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            {/* 사람 목소리 & 노래 제거 강도 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>사람 목소리 & 노래 제거율</span>
                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{Math.round(vocalSuppression * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={vocalSuppression}
                onChange={(e) => setVocalSuppression(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
              <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>100% 설정 시 TV 대사 및 배경음악 멜로디가 완전 소거됩니다.</p>
            </div>

            {/* 고양이 발소리 부스트 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>고양이 움직임/발소리 부스트</span>
                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{foleyBoost.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="2.0"
                step="0.1"
                value={foleyBoost}
                onChange={(e) => setFoleyBoost(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
              <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>상자 긁는 소리와 바스락거림을 선명하게 키웁니다.</p>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#f59e0b', color: '#000', fontWeight: 'bold', fontSize: '14px', marginTop: '6px' }}
            >
              설정 완료
            </button>
          </div>
        </div>
      )}

      {/* 정보 모달 */}
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
                <strong>🐾 고양이 전용 AI 음향 복원 엔진</strong><br />
                최신 딥러닝 신경망을 통해 TV 대사와 배경음악은 완벽히 제거하고, 고양이의 발소리·상자 긁는 소리·바스락거림만 생생하게 살려냅니다.
              </p>
              <p style={{ margin: 0 }}>
                <strong>🔒 안전한 개인 홈서버 처리</strong><br />
                외부 타사 클라우드로 전송되지 않으며, 변환 직후 서버의 임시 파일은 즉시 영구 삭제됩니다.
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
