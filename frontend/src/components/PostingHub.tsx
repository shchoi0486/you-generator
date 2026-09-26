import React from 'react';
import { Globe, Save, PenLine } from 'lucide-react';
import type { AppConfig } from '../services/api';

interface PostingHubProps {
  config: AppConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig | null>>;
  handleSaveConfig: () => void;
}

const PostingHub: React.FC<PostingHubProps> = ({ config, setConfig, handleSaveConfig }) => {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl w-full mx-auto py-8 px-2 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">AI 포스팅</h2>
          <p className="text-gray-500 font-medium text-sm">블로그 글을 자동으로 만들고, 연동해두면 바로 발행합니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WordPress 연결 */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Globe size={16} />
              </div>
              <p className="text-sm font-extrabold text-gray-900">WordPress 연동</p>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={(config?.wordpress_url as string) ?? ''}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, wordpress_url: e.target.value } : prev))}
                placeholder="https://내도메인.com"
                title="WordPress 주소"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={(config?.wordpress_user as string) ?? ''}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, wordpress_user: e.target.value } : prev))}
                placeholder="사용자 ID"
                title="WordPress 사용자 ID"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-emerald-400"
              />
              <input
                type="password"
                value={(config?.wordpress_app_password as string) ?? ''}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, wordpress_app_password: e.target.value } : prev))}
                placeholder="애플리케이션 비밀번호"
                title="WordPress 애플리케이션 비밀번호"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <button
              onClick={handleSaveConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all"
            >
              <Save size={13} />
              연결 저장
            </button>
          </div>

          {/* Naver 연결 */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <PenLine size={16} />
              </div>
              <p className="text-sm font-extrabold text-gray-900">Naver 연동</p>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={(config?.naver_client_id as string) ?? ''}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, naver_client_id: e.target.value } : prev))}
                placeholder="Naver Client ID"
                title="Naver Client ID"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-emerald-400"
              />
              <input
                type="password"
                value={(config?.naver_client_secret as string) ?? ''}
                onChange={(e) => setConfig((prev) => (prev ? { ...prev, naver_client_secret: e.target.value } : prev))}
                placeholder="Naver Client Secret"
                title="Naver Client Secret"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <button
              onClick={handleSaveConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all"
            >
              <Save size={13} />
              연결 저장
            </button>
            <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
              네이버 직접 발행은 API 심사가 필요합니다. 심사 전에는 HTML 내보내기로 붙여넣으세요.
            </p>
          </div>
        </div>

        {/* 작성 */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-extrabold text-gray-900">글 작성</p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            title="글 제목"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-400"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문 (AI 자동 작성 기능 준비중 — 직접 입력 가능)"
            title="글 본문"
            className="w-full h-40 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400 resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={() => alert('자동 발행 기능은 준비 중입니다.')}
              disabled={!title.trim()}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 transition-all"
            >
              발행하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PostingHub);
