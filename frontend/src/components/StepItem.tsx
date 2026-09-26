import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface StepItemProps {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
  onClick: () => void;
  compact?: boolean;
}

const StepItem = React.memo(({ number, label, active, completed, onClick, compact = false }: StepItemProps) => (
  <button
    onClick={onClick}
    title={`${number}. ${label} (클릭해서 이동)`}
    className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-2'} w-full relative group cursor-pointer focus:outline-none`}
  >
    <div className={`
      ${compact ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-full flex items-center justify-center font-bold z-10 transition-all
      ${completed ? 'bg-green-500 text-white group-hover:bg-green-600' : active ? 'bg-white border-2 border-indigo-600 text-indigo-600 shadow-lg shadow-indigo-100 scale-110' : 'bg-white border-2 border-gray-200 text-gray-400 group-hover:border-indigo-300 group-hover:text-indigo-400'}
    `}>
      {completed ? <CheckCircle2 size={compact ? 12 : 16} /> : number}
    </div>
    <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase tracking-wider transition-colors ${active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-500'} group-hover:underline decoration-dotted underline-offset-2`}>
      {label}
    </span>
  </button>
));

export default StepItem;
