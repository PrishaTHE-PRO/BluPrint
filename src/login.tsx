import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FloatingInput } from './components/ui/floating-input';
import './index.css';

function LoginFields() {
  return (
    <>
      <FloatingInput
        label="Email address"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        className="input-field login-float-field"
      />

      <div className="login-password-block">
        <div className="flex justify-end mb-1">
          <a href="#" id="forgot-link" className="text-xs font-medium">
            Forgot password?
          </a>
        </div>
        <FloatingInput
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input-field login-float-field"
        />
      </div>
    </>
  );
}

const rootEl = document.getElementById('login-fields-root');

if (rootEl) {
  flushSync(() => {
    createRoot(rootEl).render(<LoginFields />);
  });
}

// Auth handlers need #email / #password / #forgot-link in the DOM.
await import('../main.js');
