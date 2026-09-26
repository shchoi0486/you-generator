export const customStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @keyframes loading {
    0% { transform: translateX(-100%); width: 30%; }
    50% { transform: translateX(0%); width: 60%; }
    100% { transform: translateX(100%); width: 30%; }
  }
  @keyframes subFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes subSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes subTyping {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes subPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
`;

export const subtitlePresets = {
  // 상단 자막(CAPTION_PRESETS)의 '기본'과 동일한 스타일 — 하단 초기값을 상단에 맞춘다.
  default: { label: '기본', font_size: 20, color: '#FFD76A', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(0,0,0,0.45)' },
  youtube: { label: '유튜브', font_size: 20, color: 'white', stroke_color: 'black', stroke_width: 2.0, bg_color: 'transparent' },
  shorts_bold: { label: '숏츠볼드', font_size: 26, color: '#FFFFFF', stroke_color: '#000000', stroke_width: 3.0, bg_color: 'transparent' },
  impact: { label: '임팩트', font_size: 24, color: '#FDE047', stroke_color: 'black', stroke_width: 2.5, bg_color: 'transparent' },
  news: { label: '뉴스', font_size: 16, color: 'white', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(0,0,0,0.7)' },
  lowerthird: { label: '로워서드', font_size: 15, color: '#FFFFFF', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(0,0,0,0.65)' },
  highlight: { label: '하이라이트', font_size: 18, color: '#111111', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(253,224,71,0.92)' },
  paper: { label: '페이퍼', font_size: 17, color: '#18181B', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(255,255,255,0.95)' },
  keyword: { label: '키워드', font_size: 20, color: '#FDE047', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(0,0,0,0.8)' },
  neon: { label: '네온', font_size: 22, color: '#00FFFF', stroke_color: '#FF00FF', stroke_width: 3.0, bg_color: 'transparent' },
  ice: { label: '아이스', font_size: 18, color: '#BAE6FD', stroke_color: '#0C4A6E', stroke_width: 1.5, bg_color: 'rgba(12,74,110,0.75)' },
  cinematic: { label: '시네마', font_size: 15, color: '#F5F0E6', stroke_color: 'transparent', stroke_width: 0, bg_color: 'transparent', font: 'Garamond' },
  mono: { label: '타이핑', font_size: 17, color: '#E7E5E4', stroke_color: 'transparent', stroke_width: 0, bg_color: 'rgba(0,0,0,0.55)', animation: 'typing' },
  retro: { label: '레트로', font_size: 18, color: '#FFE8C2', stroke_color: '#7C2D12', stroke_width: 1.5, bg_color: 'transparent' },
  minimal: { label: '미니멀', font_size: 16, color: 'white', stroke_color: 'transparent', stroke_width: 0, bg_color: 'transparent' }
};

export const bgmLibrary = [
  { name: '감성적인 배경음', path: 'assets/bgm/emotional.mp3' },
  { name: '신나는 팝', path: 'assets/bgm/happy_pop.mp3' },
  { name: '긴장감 있는 스릴러', path: 'assets/bgm/tension.mp3' },
  { name: '웅장한 에픽', path: 'assets/bgm/epic.mp3' }
];

export const sfxLibrary = [
  { name: '띵 (알림음)', path: 'assets/sfx/ding.mp3' },
  { name: '슈욱 (전환음)', path: 'assets/sfx/whoosh.mp3' },
  { name: '박수 소리', path: 'assets/sfx/applause.mp3' },
  { name: '웃음 소리', path: 'assets/sfx/laugh.mp3' }
];

export const languages = [
  { label: '한국어', value: 'ko' },
  { label: '영어', value: 'en' },
];

export const voiceOptions = {
  openai: [
    { label: '앨로이 (중성, OpenAI)', value: 'alloy', lang: 'en' },
    { label: '에코 (남성, OpenAI)', value: 'echo', lang: 'en' },
    { label: '페이블 (영국식, OpenAI)', value: 'fable', lang: 'en' },
    { label: '오닉스 (남성/중후함, OpenAI)', value: 'onyx', lang: 'en' },
    { label: '노바 (여성/밝음, OpenAI)', value: 'nova', lang: 'en' },
    { label: '쉬머 (여성/부드러움, OpenAI)', value: 'shimmer', lang: 'en' },
  ],
  azure: [
    { label: '인준 (남성 - 하이텐션, Azure)', value: 'ko-KR-InJoonNeural', lang: 'ko' },
    { label: '선히 (여성 - 차분함, Azure)', value: 'ko-KR-SunHiNeural', lang: 'ko' },
    { label: '봉진 (남성 - 중후함, Azure)', value: 'ko-KR-BongJinNeural', lang: 'ko' },
    { label: '국민 (남성 - 뉴스/신뢰, Azure)', value: 'ko-KR-GookMinNeural', lang: 'ko' },
    { label: '지민 (여성 - 발랄함, Azure)', value: 'ko-KR-JiMinNeural', lang: 'ko' },
    { label: '서현 (여성 - 부드러움, Azure)', value: 'ko-KR-SeoHyeonNeural', lang: 'ko' },
    { label: '유진 (여성 - 뉴스/신뢰, Azure)', value: 'ko-KR-YuJinNeural', lang: 'ko' },
    { label: '현수 (남성 - 다국어, Azure)', value: 'ko-KR-HyunsuNeural', lang: 'ko' },
    { label: '기웅 (남성 - 부드러움, Azure)', value: 'ko-KR-KiWoongNeural', lang: 'ko' },
    { label: '태희 (여성 - 성숙함, Azure)', value: 'ko-KR-TaeHeeNeural', lang: 'ko' },
    { label: '혜진 (여성 - 뉴스/신뢰, Azure)', value: 'ko-KR-HyejinNeural', lang: 'ko' },
    { label: '지윤 (여성 - 부드러움, Azure)', value: 'ko-KR-JiyoonNeural', lang: 'ko' },
    { label: '서윤 (여성 - 발랄함, Azure)', value: 'ko-KR-SeoyunNeural', lang: 'ko' },
    { label: '진우 (남성 - 신뢰, Azure)', value: 'ko-KR-JinwooNeural', lang: 'ko' },
  ],
  edge: [
    { label: '인준 (남성 - 하이텐션, Edge)', value: 'ko-KR-InJoonNeural', lang: 'ko' },
    { label: '선히 (여성 - 차분함, Edge)', value: 'ko-KR-SunHiNeural', lang: 'ko' },
    { label: '현수 (남성 - 중후함, Edge)', value: 'ko-KR-HyunsuMultilingualNeural', lang: 'ko' },
  ],
  minimax: [
    { label: '청서 (남성, MiniMax)', value: 'male-qn-qingse', lang: 'ko' },
    { label: '소녀 (여성, MiniMax)', value: 'female-shaonv', lang: 'ko' },
    { label: '천미 (여성, MiniMax)', value: 'female-tianmei', lang: 'ko' },
    { label: '징서 (남성, MiniMax)', value: 'male-qn-jingse', lang: 'ko' },
    { label: '치우린 (여성, MiniMax)', value: 'female-qn-qiulin', lang: 'ko' },
  ],
  elevenlabs: [
    { label: 'Rachel (여성, ElevenLabs)', value: '21m00Tcm4TlvDq8ikWAM', lang: 'ko' },
    { label: 'Sarah (여성, ElevenLabs)', value: 'EXAVITQu4vr4xnSDxMaL', lang: 'ko' },
    { label: 'Adam (남성, ElevenLabs)', value: 'pNInz6obpgDQGcFmaJgB', lang: 'ko' },
    { label: 'Antoni (남성, ElevenLabs)', value: 'ErXwobaYiN019PkySvjV', lang: 'ko' },
    { label: 'Elli (여성, ElevenLabs)', value: 'MF3mGyEYCl7XYWbNljVVD', lang: 'ko' },
    { label: 'Domi (여성, ElevenLabs)', value: 'AZnzlk1XvdvUeBnXmlld', lang: 'ko' },
  ],
  typecast: [
  ],
  qwen: [
    { label: '소희 (여성, 따뜻함 - Qwen 추천)', value: 'sohee', lang: 'ko' },
    { label: '민수 (남성, 활기참 - Qwen 추천)', value: 'ryan', lang: 'ko' },
    { label: '지우 (여성, 발랄함 - Qwen)', value: 'ana', lang: 'ko' },
    { label: '서연 (여성, 부드러움 - Qwen)', value: 'serena', lang: 'ko' },
    { label: '수현 (여성, 밝음 - Qwen)', value: 'vivian', lang: 'ko' },
    { label: '푸 아저씨 (남성, 중후함 - Qwen)', value: 'uncle_fu', lang: 'ko' },
    { label: '도윤 (남성, 밝음 - Qwen)', value: 'aiden', lang: 'ko' },
    { label: '하은 (여성, 명쾌함 - Qwen)', value: 'lily', lang: 'ko' },
    { label: '준서 (남성, 차분함 - Qwen)', value: 'mason', lang: 'ko' },
    { label: '장난끼 넘치는 소희 (Qwen)', value: 'sohee|playful', lang: 'ko' },
    { label: '인자한 할머니 소희 (Qwen)', value: 'sohee|grandmother', lang: 'ko' },
    { label: '엄격한 아줌마 소희 (Qwen)', value: 'sohee|aunt', lang: 'ko' },
    { label: '푸근한 푸 아저씨 (Qwen)', value: 'uncle_fu|friendly', lang: 'ko' },
  ]
};

export const steps = [
  { id: 1, label: '주제/입력' },
  { id: 2, label: '내용 구성' },
  { id: 3, label: '목소리 선택' },
  { id: 4, label: '이미지 선택' },
  { id: 5, label: '타임라인 편집' },
  { id: 6, label: '최종 확인' }
];
