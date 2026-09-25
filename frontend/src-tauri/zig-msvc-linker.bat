@echo off
REM MSVC 링커(link.exe) 대체: zig cc를 링커로 사용.
REM cargo-zigbuild 없이 순수 cargo로 빌드하기 위한 래퍼.
REM 요구: zig가 PATH에 있을 것. MSVC 설치 후에는 이 파일과 .cargo/config.toml을 삭제.
REM 디버그: ZIGLINK_LOG env가 있으면 zig stdout/stderr를 파일에 기록.
if defined ZIGLINK_LOG (
  zig cc -target x86_64-windows-msvc %* > "%ZIGLINK_LOG%.out" 2> "%ZIGLINK_LOG%.err"
) else (
  zig cc -target x86_64-windows-msvc %*
)
