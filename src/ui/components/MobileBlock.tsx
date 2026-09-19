import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/** Mobile guard: touch aiming is not attempted — show notice instead. */
export function MobileBlock({ children }: { children: ReactElement }): ReactElement {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const small = window.innerWidth < 768;
    setIsMobile(coarse && small && !fine);
  }, []);
  if (isMobile) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-md">{t('needMouse')}</p>
      </div>
    );
  }
  return children;
}
