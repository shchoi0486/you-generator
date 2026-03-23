// 예상 시간 계산 함수 (한글 4.2자/초, 영어 15자/초 기준)
export const calculateDuration = (text: string) => {
  if (!text) return 0;
  
  // 한글과 영어를 구분하여 글자당 소요 시간 계산
  // 한국어: 초당 약 3.5~4글자 (차분한 뉴스 톤)
  // 영어: 초당 약 13~15글자 (단어 기반이 아닌 글자 기반일 때)
  
  const cleanText = text.replace(/[\s\n\r]/g, ''); // 공백 제외 실질 글자수
  if (cleanText.length === 0) return 0;

  const koreanChars = (cleanText.match(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g) || []).length;
  const otherChars = cleanText.length - koreanChars;
  
  // 한국어는 글자당 0.28초, 영어/숫자/기호는 글자당 0.08초 정도로 계산
  // (한국어 1초에 3.57자, 영어 1초에 12.5자 기준)
  const duration = (koreanChars * 0.28) + (otherChars * 0.08);
  
  // 문장 부호(., !, ?)에 따른 짧은 휴지기 추가 (약 0.2초)
  const pauseCount = (text.match(/[.!?]/g) || []).length;
  const totalDuration = duration + (pauseCount * 0.2);

  // 최소 1.2초 보장
  return Math.max(1.2, Math.round(totalDuration * 10) / 10);
};
