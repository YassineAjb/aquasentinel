import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AccessibilityProvider } from './a11y';
import { AuthProvider } from './auth';
import { ConfirmProvider } from './confirm';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AccessibilityProvider>
          <LanguageProvider>
            <AuthProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </AuthProvider>
          </LanguageProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
