// 대본 다양화 선택지 폴백 — 백엔드 /shorts/recipe-options 실패 시에만 쓴다.
//
// 왜 이 파일이 따로 있나: 이 목록이 VideoPresetPanel과 ShortsLab 두 곳에
// 복붙돼 있었다. 12개 프리셋으로 교체할 때 훅 2종(regret/greeting)을 한쪽만
// 고쳐 4개 프리셋의 훅이 UI에 안 뜨는 버그가 났고, 8종→12종/5종→7종 카운트도
// 갈라졌다. 단일 출처로 모으고 두 컴포넌트가 함께 import하게 한다.
//
// 진실은 백엔드다. 여기 나열한 값은 '백엔드가 죽었을 때의 최소 동작'일 뿐이며,
// 항목이 추가/변경되면 이 파일도 함께 고쳐야 한다. (list_recipe_options()가
// 반환하는 id/name/desc와 1:1로 맞출 것)

// 프리셋에만 축 값(hook/tone/structure/cta)이 붙는다. 'random' 항목에는 없다.
export type FallbackPresetOption = {
  id: string;
  name: string;
  desc: string;
  hook?: string;
  tone?: string;
  structure?: string;
  cta?: string;
};

export type FallbackFamilyVariant = {
  preset: string;
  name: string;
  desc: string;
  example: string[];
};

export type FallbackFamily = {
  id: string;
  name: string;
  desc: string;
  example: string[];
  variants: FallbackFamilyVariant[];
};

export type FallbackRecipeOptions = {
  presets: FallbackPresetOption[];
  families: FallbackFamily[];
  styles: { id: string; name: string; desc: string }[];
  platforms: { id: string; name: string; desc: string }[];
  hooks: { id: string; name: string; desc: string }[];
  tones: { id: string; name: string; desc: string }[];
  structures: { id: string; name: string; desc: string }[];
  ctas: { id: string; name: string; desc: string }[];
};

export const FALLBACK_RECIPE_OPTIONS: FallbackRecipeOptions = {
  styles: [
    { id: 'realistic', name: '현실적인 요리', desc: '한국 가정식 기본값' },
    { id: 'jasuisaeng', name: '자취생', desc: '원룸 주방 · 단순 · 빠른 컷' },
    { id: 'asmr', name: 'ASMR', desc: '음식 소리 중심' },
    { id: 'cinematic', name: '시네마틱', desc: '영화적인 고급 음식 영상' },
  ],
  platforms: [
    { id: 'youtube', name: 'YouTube', desc: '제목·설명·해시태그' },
    { id: 'instagram', name: 'Instagram', desc: '짧은 캡션·해시태그' },
    { id: 'tiktok', name: 'TikTok', desc: '짧은 후킹 캡션' },
  ],
  hooks: [
    { id: 'random', name: '매번 변경', desc: '생성할 때마다 7종 중 무작위로 시작' },
    { id: 'question', name: '질문형', desc: '시청자에게 던지는 짧은 질문으로 시작' },
    { id: 'provoke', name: '도발형', desc: '상식을 뒤집는 단언으로 시작' },
    { id: 'empathy', name: '공감형', desc: '실패 경험에 공감하며 시작' },
    { id: 'number', name: '숫자형', desc: '시간·금액·개수 숫자로 시작' },
    { id: 'twist', name: '반전형', desc: '예상 밖 결과 선언으로 시작' },
    { id: 'regret', name: '후회형', desc: "'왜 이제 먹었을까' 식의 후회로 시작" },
    { id: 'greeting', name: '인사형', desc: '짧은 인사 한 줄로 시작하고 바로 메뉴로' },
  ],
  presets: [
    { id: 'random', name: '매번 변경', desc: '생성할 때마다 12종 중 무작위 세트' },
    { id: 'read_aloud', name: '읽어주기 낭독', desc: "'왜 이제 먹었지' 한마디로 열고, 조리 과정은 빠짐없이 읽어주듯 말함", hook: 'regret', tone: 'casual_first', structure: 'silent_list', cta: 'emotion' },
    { id: 'read_aloud_problem', name: '안 되지? 낭독', desc: "'왜 안 되지?' 증상으로 열고, 원인을 짚은 뒤 낭독 톤으로 해결", hook: 'empathy', tone: 'casual_first', structure: 'problem_cause_fix', cta: 'emotion' },
    { id: 'childhood_noodle', name: '어릴 때 그 국수', desc: "옛날 기억으로 시작해 '이거 되려나?' 걱정 없이 따라 하는 느낌", hook: 'empathy', tone: 'warm_recall', structure: 'silent_list', cta: 'emotion' },
    { id: 'childhood_question', name: '기억나는 그 맛', desc: "'어릴 때 왜 이 맛이었을까?' 물음으로 열고, 추억으로 답을 찾음", hook: 'question', tone: 'warm_recall', structure: 'problem_cause_fix', cta: 'emotion' },
    { id: 'chef_manuals', name: '손따라 하기', desc: '손질부터 불 세기까지, 단계 빠짐없이 따라만 하면 되는 안내', hook: 'greeting', tone: 'instruction_mix', structure: 'silent_list', cta: 'emotion' },
    { id: 'chef_manuals_provoke', name: '손따라 하기 반전', desc: "손따라 하기 톤은 그대로 두고, 첫마디만 '이거 사먹지 마세요'로 뒤집음", hook: 'provoke', tone: 'instruction_mix', structure: 'conclusion_first', cta: 'emotion' },
    { id: 'moony_bracket', name: '브금 개그 리듬', desc: "'안녕하세요'로 시작해 조리 사이사이에 짧은 속삭임이 끼어드는 리듬", hook: 'greeting', tone: 'bracket_quirk', structure: 'silent_list', cta: 'emotion' },
    { id: 'moony_bracket_provoke', name: '브금 개그 결론 먼저', desc: '개그 리듬은 그대로 두고, 결과부터 던져서 시청을 붙들어 둠', hook: 'twist', tone: 'bracket_quirk', structure: 'conclusion_first', cta: 'emotion' },
    { id: 'shinzo_blunt', name: '한 입 대본', desc: '사다 쓰듯 말없이 딱딱 끊어내는 초압축 나레이션', hook: 'provoke', tone: 'mz_blunt', structure: 'silent_list', cta: 'ask_viewer' },
    { id: 'shinzo_blunt_provoke', name: '한 입 대본 반박형', desc: "한 입 대본의 속도를 유지한 채, '이거 틀렸어요' 질문으로 반박부터 시작", hook: 'question', tone: 'mz_blunt', structure: 'problem_cause_fix', cta: 'ask_viewer' },
    { id: 'ttukddik_banter', name: '친근하게 툭', desc: "'최소는 형이 먹으세요' 같은 한마디를 조리 사이에 툭 던지는 반말", hook: 'provoke', tone: 'self_deprecating', structure: 'silent_list', cta: 'emotion' },
    { id: 'ttukddik_banter_provoke', name: '친근하게 툭 실패론', desc: '친근한 반말로 먼저 망한 이야기를 꺼내고, 그다음 해결로 넘어감', hook: 'empathy', tone: 'self_deprecating', structure: 'fail_try', cta: 'emotion' },
  ],
  // 위 presets 13장을 '톤 6 × 변형 2' 로 접은 화면용 묶음.
  // 1:1 로 맞추야 한다 — id 와 variant.preset 이 어긋나면 사용자가 고른 톤과
  // 실제 생성되는 프리셋이 달라진다(백엔드 recipe_prompts.PRESET_FAMILIES 참조).
  families: [
    {
      id: 'casual_first', name: '담백 낭독',
      desc: '조리 과정을 빠짐없이 읽어주듯. 조용하고 편안하게.',
      example: ['아, 이거 왜 이제야.', '근데 진짜 10분이면 돼.'],
      variants: [
        { preset: 'read_aloud', name: '그냥 진행', desc: '재료 → 손질 → 조리 → 완성', example: ['아, 이거 왜 이제야.', '닭갈비 하나 하면 저녁 끝.'] },
        { preset: 'read_aloud_problem', name: '왜 안 되지?', desc: '안 되는 증상 → 원인 → 해결', example: ['닭이 질겨? 그건 양념이 먼저야.', '꿀 먼저 넣고, 그 다음에 간장.'] },
      ],
    },
    {
      id: 'warm_recall', name: '옛날 기억',
      desc: '다 먹어본 그 맛으로. 따뜻하고 천천히.',
      example: ['옛날에 아빠가 하던 그거, 기억나?', '그때는 이거 안 사도 돼.'],
      variants: [
        { preset: 'childhood_noodle', name: '그냥 진행', desc: '재료 → 조리 → 완성', example: ['옛날에 아빠가 하던 그거, 기억나?', '면은 두 손으로 쳐넣었지.'] },
        { preset: 'childhood_question', name: '왜 그 맛?', desc: '물음으로 열고 → 추억으로 답', example: ['왜 그때는 이 맛이었을까?', '장 오래 끓였기 때문이야.'] },
      ],
    },
    {
      id: 'instruction_mix', name: '따라만 하기',
      desc: '단계 안내형. 뭐를 해야 하는지 또렷하게.',
      example: ['오늘 저녁은 이거면 끝.', '근육 먼저 넣고, 그 다음 양념.'],
      variants: [
        { preset: 'chef_manuals', name: '순서대로', desc: '손질부터 불 세기까지 순서대로', example: ['오늘 저녁은 이거면 끝.', '근육 먼저 넣고, 그 다음 양념.'] },
        { preset: 'chef_manuals_provoke', name: '결과부터', desc: '완성물 보여준 뒤 → 레시피로', example: ['이거 사먹지 마세요.', '10분이면 됩니다.'] },
      ],
    },
    {
      id: 'bracket_quirk', name: '브금 개그',
      desc: '재미 먼저. 조리 사이사이에 한마디씩 툭.',
      example: ['[자막] 근데 이거 왜 이렇게 맛있지?'],
      variants: [
        { preset: 'moony_bracket', name: '순서대로', desc: '인사 → 조리 → 자막 툭툭', example: ['안녕하세요, 오늘의 요리는.', '[자막] 근데 이거 왜 이렇게 맛있지?'] },
        { preset: 'moony_bracket_provoke', name: '결과부터', desc: '완성부터 보여주고 → 만드는 법', example: ['[자막] 이거 완성물입니다.', '[자막] 만드는 건 10분.'] },
      ],
    },
    {
      id: 'mz_blunt', name: '한 입 대본',
      desc: '사다 쓰듯. 짧고 강한 단문.',
      example: ['면 넣었다. 끓었다. 끝.'],
      variants: [
        { preset: 'shinzo_blunt', name: '순서대로', desc: '동작만 나열, 설명 없음', example: ['닭 넣었다.', '양념 넣었다.', '끓었다. 끝.'] },
        { preset: 'shinzo_blunt_provoke', name: '반박', desc: "'그게 틀렸다' 는 반박부터", example: ['닭갈비가 어렵다고?', '양념이 먼저야. 그게 다야.'] },
      ],
    },
    {
      id: 'self_deprecating', name: '친근하게 툭',
      desc: '아저씨 반말. 조리 사이에 툭 던지는 말.',
      example: ['최소는 형이 먹으세요.'],
      variants: [
        { preset: 'ttukddik_banter', name: '순서대로', desc: '반말 한마디씩, 조리 사이사이에', example: ['최소는 형이 먹으세요.', '근데 이건 진짜 쉬워.'] },
        { preset: 'ttukddik_banter_provoke', name: '실패담', desc: '망한 이야기 먼저 → 해결로', example: ['내가 맨날 망쳤거든.', '근데 이건 되더라.'] },
      ],
    },
  ],
  tones: [
    { id: 'casual_first', name: '담백 1인칭', desc: '반말체, 담담한 1인칭' },
    { id: 'mz_blunt', name: 'MZ 직설', desc: '짧고 강한 단문 위주 쿨한 반말' },
    { id: 'sensory', name: '감각 묘사', desc: '오감 묘사 우선, 설명 최소화' },
    { id: 'retro', name: '실패 회고', desc: '1인칭 과거형 회고, 후회 뉘앙스' },
    { id: 'authority', name: '전문가 단언', desc: '전문가 관점의 여유롭고 단정적인 문장' },
    { id: 'self_deprecating', name: '자조 개그 반말', desc: '자기 비하·친근한 농담이 섞인 반말' },
    { id: 'polite_guide', name: '낭독 존댓말', desc: '~습니다와 ~요가 섞인 읽어주기 톤' },
    { id: 'warm_recall', name: '추억 회상', desc: '~거든요·~죠 반말이 섞인 친근한 요리' },
    { id: 'instruction_mix', name: '지시 혼용 조리', desc: '~해 줍니다와 ~입니다를 섞어 도구·시간 서술' },
    { id: 'bracket_quirk', name: '브금 개그', desc: '짧은 구어체 + 대괄호 독백으로 ASMR 분위기' },
  ],
  structures: [
    { id: 'fail_try', name: '실패 → 시도 → 결과', desc: '망한 경험 → 바꿔본 것 → 결과' },
    { id: 'conclusion_first', name: '결론 먼저 → 근거', desc: '역순 서술, 첫 문장에 결과/핵심' },
    { id: 'silent_list', name: '무언 나열', desc: '이야기 없이 재료 → 동작 → 완성' },
    { id: 'problem_cause_fix', name: '문제 → 원인 → 해결', desc: '잘 안 되는 증상 → 진단 → 해결 조각' },
  ],
  ctas: [
    { id: 'save', name: '저장 유도', desc: "'나중에 해먹으려면 저장' + 이유 한 줄" },
    { id: 'comment', name: '댓글 유도', desc: '질문형으로 끝내고 다음 편 연결' },
    { id: 'subscribe', name: '구독 유도', desc: '다음 편 예고로 구독 유도' },
    { id: 'follow', name: '팔로우 유도', desc: '정서적 약속으로 팔로우 유도' },
    { id: 'emotion', name: '감정 유도', desc: "'많이 먹어' '어때?' 같은 친근한 반응" },
    { id: 'ask_viewer', name: '시청자 질문', desc: '마지막에 질문으로 시청자를 부르기' },
  ],
};

/** 제작 설정의 길이 버튼. 프론트와 백엔드 포맷 5단계를 맞춘다. */
export const DURATION_PRESETS = [30, 60, 180, 300, 600];

/**
 * 대본 다양화 선택 상태. VideoPresetPanel / ShortsLab / App 이 이 타입을 공유한다.
 * (3곳에 인라인으로 복붙돼 있어 12종 프리셋 교체 때 3군데를 다 고쳐야 했다)
 *
 * 축 값은 모두 필수 문자열이며 '미지정'은 빈 문자열이다. optional 로 두면
 * undefined 와 '' 가 섞여 어느 쪽인지 따로 분기해야 한다.
 */
export type RecipePresetState = {
  format: string;
  style: string;
  platform: string;
  hook: string;
  preset: string;
  tone: string;
  structure: string;
  cta: string;
};

export const EMPTY_RECIPE_PRESET: RecipePresetState = {
  format: 'auto',
  style: 'realistic',
  platform: 'youtube',
  hook: 'random',
  preset: 'random',
  tone: '',
  structure: '',
  cta: '',
};
