
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  className?: string;
}

export function Alert({ type, title, message, className }: AlertProps) {
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    error: <XCircle className="h-5 w-5 text-rose-500" />,
    warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />
  };

  const backgrounds = {
    success: 'bg-emerald-50 border-emerald-200',
    error: 'bg-rose-50 border-rose-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200'
  };

  const textColors = {
    success: 'text-emerald-800',
    error: 'text-rose-800',
    warning: 'text-amber-800',
    info: 'text-blue-800'
  };

  return (
    <div className={cn('p-4 border rounded-xl flex items-start space-x-3', backgrounds[type], className)}>
      <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
      <div>
        <h3 className={cn('text-sm font-semibold', textColors[type])}>{title}</h3>
        {message && <div className={cn('mt-1 text-sm', textColors[type], 'opacity-90')}>{message}</div>}
      </div>
    </div>
  );
}
