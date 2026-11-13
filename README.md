# 🐾 CatCleaner (클린캣)

> **서버 없이 스마트폰에서 100% 자체 구동되는 고양이 동영상 보컬 & TV 소리 제거 앱**

귀여운 고양이의 모습을 촬영했을 때 배경에 섞인 **TV 사람 말소리, 대사 및 방송 음향을 깨끗하게 제거**하고, 고양이의 발소리·상자 긁는 소리·바스락거리는 움직임 소리는 생생하게 살려 새로운 동영상(MP4)으로 저장해주는 모바일 애플리케이션입니다.

---

## ✨ 핵심 기능

1. **🔒 100% 오프라인 온디바이스 처리 (Zero Server, Zero Network)**
   - 외부 서버나 클라우드로 영상을 업로드하지 않습니다.
   - 모든 음향 분석, 노이즈 억제 및 동영상 합성이 기기 내부에서 안전하게 실행됩니다.
   - 인터넷 권한(`android.permission.INTERNET`)이 완전 삭제된 제로 트러스트 보안 구조입니다.

2. **🐱 고양이 특화 과도응답 & 주파수 복원 엔진**
   - **Mid-Side Center Vocal Attenuation**: TV 대사가 위치하는 200Hz ~ 3,400Hz 대역의 중앙 위상 성분을 정밀 억제합니다.
   - **Transient Detector**: 고양이가 상자를 긁거나 솜방망이 발을 딛는 급격한 과도 충격음(Transients)을 실시간 감지하여 100% 원형 그대로 보존합니다.
   - **High-Band Air Boost**: 3,500Hz 이상의 바스락거림과 움직임 소리를 또렷하게 부스트합니다.

3. **🎧 실시간 A/B 비교 청취**
   - 동영상을 재생하면서 **[클린 고양이 소리]**와 **[원본 소리]**를 탭 한 번으로 실시간 전환하여 노이즈 제거 효과를 즉각 체감할 수 있습니다.

4. **🎬 원본 화질 100% 무손실 동영상(MP4) 저장**
   - 비디오 스트림과 정제된 오디오 스트림을 고속 합성하여 새로운 동영상 파일로 저장합니다.

---

## 🛠️ 기술 스택

- **Frontend**: Vite, React 18, TypeScript, Lucide React
- **Mobile Engine**: Capacitor 8 (Android)
- **Audio Processing**: Web Audio API (IIR Bandpass, Mid-Side M/S Matrix, Transient Envelope Follower)
- **Video Muxing**: MediaStream & MediaRecorder Client-side Muxer
- **CI/CD**: GitHub Actions, Android SDK / apksigner (v1 + v2)
