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
  X,
  Server,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import './mobile-base.css';

export function App() {
  const [serverUrl, setServerUrl] = useState<string>('https://cleaner.donagy.pro');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null);
  const [cleanVideoUrl, setCleanVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCleanMode, setIsCleanMode] = useState<boolean>(false); // 변환 전에는 원본, 변환 후에는 클린이 기본

  // 처리 상태
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [hasProcessed, setHasProcessed] = useState<boolean>(false);

  // 모달
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'ok' | 'error'>('unchecked');

  // 미세 튜닝 옵션
  const [vocalSuppression, setVocalSuppression] = useState<number>(1.0);
  const [foleyBoost, setFoleyBoost] = useState<number>(1.3);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 하드웨어 뒤로가기 버튼 연동
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

  // 서버 연결 확인
  const checkServerHealth = async (urlToCheck: string) => {
    try {
      setServerStatus('unchecked');
      const cleanUrl = urlToCheck.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/health`, { method: 'GET' });
      if (res.ok) {
        setServerStatus('ok');
      } else {
        setServerStatus('error');
      }
    } catch {
      setServerStatus('error');
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

  // AI 노이즈 제거 요청 (서버 Demucs 파이프라인)
  const handleStartAiClean = async () => {
    if (!videoFile) return;

    try {
      setIsProcessing(true);
      setProcessStatus('동영상 서버로 전송 중...');

      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('vocal_suppression', vocalSuppression.toString());
      formData.append('foley_boost', foleyBoost.toString());

      setProcessStatus('Demucs AI로 사람 목소리 및 TV 소리 분리 중... (약 15~20초)');

      const cleanUrl = serverUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/clean`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '서버 처리 실패');
      }

      setProcessStatus('클린 동영상 수신 중...');
      const blob = await response.blob();
      const newCleanUrl = URL.createObjectURL(blob);

      setCleanVideoUrl(newCleanUrl);
      setHasProcessed(true);
      setIsCleanMode(true);
      setIsProcessing(false);
      setProcessStatus('');

      // 비디오 엘리먼트 즉시 새 클린 영상으로 교체
      if (videoRef.current) {
        videoRef.current.src = newCleanUrl;
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } catch (err: unknown) {
      console.error('AI Clean Error:', err);
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`노이즈 제거에 실패했습니다.\n사유: ${msg}\n\n서버(${serverUrl}) 연결 상태와 Cloudflare 설정을 확인해주세요.`);
    }
  };

  // A/B 모드 전환 (클린 영상 vs 원본 영상)
  const handleSwitchMode = (targetClean: boolean) => {
    if (!videoRef.current) return;
    const curTime = videoRef.current.currentTime;
    const wasPlaying = !videoRef.current.paused;

    setIsCleanMode(targetClean);
    const targetUrl = targetClean ? cleanVideoUrl : rawVideoUrl;
    if (targetUrl) {
      videoRef.current.src = targetUrl;
      videoRef.current.currentTime = curTime;
      if (wasPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // 클린 동영상 폰 저장
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
            <p style={{ fontSize: '11px', margin: 0, color: '#94a3b8' }}>Demucs AI 고양이 소리 보존 & TV 음성 제거</p>
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
              배경에 TV 말소리나 방송 음향이 들리는 동영상을 선택하세요. AI가 사람 소리만 깨끗이 지워드립니다.
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
                loop
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* 상태 뱃지 */}
              <div style={{ position: 'absolute', top: '12px', left: '12px', padding: '6px 12px', borderRadius: '20px', backgroundColor: isCleanMode ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)', color: '#fff', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)' }}>
                {isCleanMode ? <Sparkles size={14} /> : <Volume2 size={14} />}
                {isCleanMode ? '✨ 클린 모드 (TV 제거됨)' : '🔊 원본 동영상'}
              </div>

              {/* 재생/일시정지 버튼 */}
              <button
                onClick={togglePlay}
                style={{ position: 'absolute', width: '56px', height: '56px', minWidth: '56px', minHeight: '56px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
              </button>
            </div>

            {/* 변환 완료 후 A/B 토글 스위치 */}
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

            {/* 처리 전: AI 변환 시작 버튼 */}
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
                AI 노이즈 제거 시작 (Demucs)
              </button>
            ) : (
              /* 처리 후: 클린 동영상 저장 버튼 */
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

      {/* 처리 중 오버레이 */}
      {isProcessing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#1e293b', padding: '24px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#f59e0b' }}>
              <Sparkles size={28} className="animate-spin" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>AI 노이즈 제거 진행 중</h3>
            <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>{processStatus}</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
              체다캠에 영향이 없도록 CPU 2코어로 안전하게 격리 연산됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 설정 모달 */}
      {showSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 90 }}>
          <div style={{ backgroundColor: '#1e293b', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0 }}>서버 및 음향 설정</h3>
              <button onClick={() => setShowSettings(false)} style={{ color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            {/* 서버 주소 입력 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={14} />
                  AI 백엔드 서버 주소
                </label>
                {serverStatus === 'ok' && <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px' }}><CheckCircle2 size={12} /> 연결됨</span>}
                {serverStatus === 'error' && <span style={{ fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertCircle size={12} /> 미연결</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => { setServerUrl(e.target.value); setServerStatus('unchecked'); }}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '13px' }}
                />
                <button
                  onClick={() => checkServerHealth(serverUrl)}
                  style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: '#334155', color: '#cbd5e1', fontSize: '12px', fontWeight: 'bold' }}
                >
                  연결 확인
                </button>
              </div>
            </div>

            {/* 사람 목소리 제거 강도 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>사람 목소리(TV) 제거율</span>
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
            </div>

            <button
              onClick={() => setShowSettings(false)}
              style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#f59e0b', color: '#000', fontWeight: 'bold', fontSize: '14px' }}
            >
              설정 저장
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
                <strong>🐾 개인 홈서버 연동 AI 엔진</strong><br />
                외부 유료 클라우드가 아닌, 개인 홈서버(`cleaner.donagy.pro`)에 탑재된 최신 Meta Demucs v4 음원 분리 AI를 사용합니다.
              </p>
              <p style={{ margin: 0 }}>
                <strong>🔒 완벽한 사생활 보호 & 격리 연산</strong><br />
                영상은 AI 연산 직후 서버에서 즉시 영구 삭제되며, 홈캠(체다캠) 스트리밍에 영향이 없도록 CPU 2코어로 격리 연산됩니다.
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
