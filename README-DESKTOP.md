# YouGenerator Desktop (Tauri) Packaging

프론트(`frontend/`, Vite+React)와 백엔드(`backend/`, FastAPI)를
Tauri 데스크톱 앱 하나로 묶는 절차다.

## 0. 진행 상태 (2026-09-25 빌드 성공)

- [x] `src-tauri/` 스캐폴드 (`tauri.conf.json`, `Cargo.toml`, `main.rs` 사이드카 spawn/kill, capabilities)
- [x] 아이콘 풀세트 (`npx tauri icon` 생성済)
- [x] 프론트 API 주소 1곳 수렴 (`services/api.ts` + `VITE_API_BASE_URL`), `.env.production` 고정
- [x] 백엔드 frozen 대응 (`%LOCALAPPDATA%/YouGenerator`, 포트 환경변수, 콘솔 UTF-8)
- [x] `you-backend.spec` + 사이드카 빌드 성공 + 부팅·`/templates` 응답 확인
- [x] `tsc -b` + `npm run build` 통과
- [x] **MSVC 없이 풀 빌드 성공** (관리자 권한 불필요):
      Rust gnu 툴체인 + zig + llvm-mingw(binutils) + niXman libgcc_eh.a 조합.
      산출물: `bundle/msi/YouGenerator_0.1.0_x64_en-US.msi` (257MB),
      `bundle/nsis/YouGenerator_0.1.0_x64-setup.exe` (255MB).
      앱 실행·사이드카 spawn까지 스모크 테스트 완료.
- [ ] 선택: 정식 MSVC 환경에서는 `.cargo/config.toml`·래퍼 삭제 후
      `rustup default stable-x86_64-pc-windows-msvc`로 복귀.

## 1. 남은 단계 (관리자 PC에서)

```powershell
# 1. MSVC 설치 후
cd you-generator\frontend
npm run tauri build
```

산출물: `src-tauri/target/release/bundle/` (nsis/msi 등).

## 1. 백엔드 사이드카 빌드

```powershell
cd you-generator\backend
pip install pyinstaller
pyinstaller you-backend.spec
```

`dist/you-backend/` (one-dir) 산출물을 사이드카 이름으로 복사:

```powershell
# one-dir 권장
Copy-Item -Recurse dist\you-backend `
  ..\frontend\src-tauri\binaries\you-backend-x86_64-pc-windows-msvc\
```

macOS(Apple Silicon)는 타깃 triple에 맞게
`you-backend-aarch64-apple-darwin` 으로 복사한다.

주의:

- 첫 실행 시 `%LOCALAPPDATA%\YouGenerator\data\` 에 assets/exports가 생긴다.
  설치 폴더(Program Files)에 쓰지 않는다 (`core/config_utils.py`).
- API 키는 `%LOCALAPPDATA%\YouGenerator\config\settings.yaml`에 저장된다.
  번들에 실제 키를 넣지 말 것.
- 포트는 `YOU_BACKEND_PORT` 환경변수, 기본 8000. 프론트는 빌드 시
  `.env.production`의 `VITE_API_BASE_URL=http://127.0.0.1:8000` 로 고정된다.
- moviepy/imageio-ffmpeg는 최초 사용 시 ffmpeg 바이너리를 내려받는다.
  오프라인 PC용이면 미리 시드할 것.

## 2. 데스크톱 빌드

```powershell
cd you-generator\frontend
npm run tauri build
```

산출물: `src-tauri/target/release/bundle/` (nsis/msi 등).

개발 중 사이드카 없이 돌리려면:

```powershell
npm run tauri dev
```

(`devUrl` + 직접 띄운 백엔드 `python backend/main.py` 조합도 가능.)

## 3. 동작 구조

- 앱 시작 시 Rust(`src-tauri/src/main.rs`)가 사이드카를 spawn, 창 종료 시 kill.
- 프론트 수정 없이 동작: 모든 API 주소는 `services/api.ts`의
  `API_BASE_URL`/`assetUrl()` 1곳으로 수렴돼 있다.
- 로컬 개발(`npm run dev`, `python main.py`) 흐름은 그대로 유지된다.
