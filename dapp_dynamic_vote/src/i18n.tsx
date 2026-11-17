import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { messages } from './messages';
import type { Lang, Messages } from './messages';

const STORAGE_KEY = 'set-kuesioner-lang';

type I18n = { lang: Lang; t: Messages; setLang: (lang: Lang) => void };

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'id' ? saved : 'id';
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(initialLang);

    useEffect(() => {
        document.documentElement.lang = lang;
        document.title = messages[lang].appTitle;
    }, [lang]);

    const setLang = (next: Lang) => {
        localStorage.setItem(STORAGE_KEY, next);
        setLangState(next);
    };

    return <I18nContext.Provider value={{ lang, t: messages[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
    const value = useContext(I18nContext);
    if (!value) throw new Error('useI18n must be used inside I18nProvider');
    return value;
}

export function LanguageSwitch() {
    const { lang, t, setLang } = useI18n();
    const next: Lang = lang === 'id' ? 'en' : 'id';

    return (
        <button
            type="button"
            className="lang-switch"
            onClick={() => setLang(next)}
            aria-label={t.switchTo}
            title={t.switchTo}
        >
            <span className={lang === 'id' ? 'active' : ''}>ID</span>
            <span className={lang === 'en' ? 'active' : ''}>EN</span>
        </button>
    );
}
